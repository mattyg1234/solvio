"""Payment regressions on an automatically created, disposable local PostgreSQL cluster.
Run: python3 tests/show-ops/payment-integrity.py
BEFORE_REPAIR=1 reproduces the pre-repair failures. Never connects to production.
"""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
PG = Path('/opt/homebrew/opt/postgresql@17/bin')
BIZ = '10000000-0000-0000-0000-000000000001'
BOOK = '20000000-0000-0000-0000-000000000001'
OTHER = '10000000-0000-0000-0000-000000000002'


class PaymentIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='solvio-payment-repair-')
        cls.data = Path(cls.temp.name) / 'data'
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        subprocess.run([str(PG/'initdb'), '-D', str(cls.data), '-A', 'trust', '--no-locale'], check=True, capture_output=True)
        subprocess.run([str(PG/'pg_ctl'), '-D', str(cls.data), '-l', str(Path(cls.temp.name)/'postgres.log'),
                        '-o', f'-h 127.0.0.1 -p {cls.port} -k {cls.temp.name}', '-w', 'start'], check=True, capture_output=True)
        cls.sql('''create role authenticated; create role service_role bypassrls;
          create schema auth; create table auth.users(id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          grant usage on schema auth to authenticated, service_role;
          create table businesses(id uuid primary key, owner_id uuid, name text);
          grant select on businesses to authenticated,service_role;''')
        cls.sql((ROOT/'supabase/migrations/20260811120000_show_ops.sql').read_text())
        cls.sql('alter table show_bookings add legacy_id text, add cancelled_at timestamptz;')
        cls.sql(f"insert into businesses values ('{BIZ}',null,'Test'),('{OTHER}',null,'Other');")
        cls.sql(f"""insert into show_bookings(business_id,booking_ref,show_date,guest_name,show_name,island,
          total_cost,balance_remaining,payment_status,legacy_id) values
          ('{BIZ}','backfill','2026-10-01','Fixture','Fixture','Tenerife',100,30,'partial','backfill');""")
        if not os.environ.get('BEFORE_REPAIR'):
            cls.sql((ROOT/'supabase/migrations/20260908221214_show_ops_opening_paid_balance.sql').read_text())
            cls.sql((ROOT/'supabase/migrations/20260909000000_show_ops_imported_paid_opening_balance.sql').read_text())
            if cls.sql("select count(*) || '|' || sum(amount) from show_booking_payments where method='import';").stdout.strip() != '1|70.00':
                raise AssertionError('Existing opening migration double-counted or lost the backfill')

    @classmethod
    def tearDownClass(cls):
        subprocess.run([str(PG/'pg_ctl'), '-D', str(cls.data), '-m', 'immediate', '-w', 'stop'], check=True, capture_output=True)
        cls.temp.cleanup()

    @classmethod
    def command(cls):
        return [str(PG/'psql'), '-X', '-h', '127.0.0.1', '-p', str(cls.port), '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1']

    @classmethod
    def sql(cls, query, check=True):
        result = subprocess.run(cls.command(), input=query, text=True, capture_output=True)
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    def setUp(self):
        self.sql('truncate show_bookings cascade;')
        self.sql(f"""insert into show_bookings(id,business_id,booking_ref,show_date,guest_name,show_name,island,
          total_cost,balance_remaining,payment_status,legacy_id) values
          ('{BOOK}','{BIZ}','1','2026-10-01','Fixture','Fixture','Tenerife',100,30,'partial','legacy');""")

    def receipt(self, amount, business=BIZ, method='cash'):
        return f"insert into show_booking_payments(business_id,booking_id,amount,method) values ('{business}','{BOOK}',{amount},'{method}');"

    def state(self):
        return self.sql(f"select balance_remaining || '|' || payment_status from show_bookings where id='{BOOK}';").stdout.strip()

    def test_first_receipt_preserves_imported_amount(self):
        self.sql(self.receipt(10))
        self.assertEqual(self.state(), '20.00|partial')
        self.assertEqual(self.sql('select sum(amount) from show_booking_payments;').stdout.strip(), '80.00')
        self.assertEqual(self.sql("select count(*) from show_booking_payments where method='import';").stdout.strip(), '1')

    def test_second_receipt_does_not_double_count_opening(self):
        self.sql(self.receipt(10) + self.receipt(20))
        self.assertEqual(self.state(), '0.00|paid')
        self.assertEqual(self.sql('select sum(amount) from show_booking_payments;').stdout.strip(), '100.00')

    def test_stale_edit_cannot_reset_paid_summary(self):
        self.sql(self.receipt(10))
        self.sql("update show_bookings set balance_remaining=30,payment_status='partial',office_comments='Note';")
        self.assertEqual(self.state(), '20.00|partial')

    def test_reprice_preserves_opening_before_first_receipt(self):
        self.sql('update show_bookings set total_cost=120,balance_remaining=120;')
        self.assertEqual(self.state(), '50.00|partial')
        self.sql(self.receipt(10))
        self.assertEqual(self.state(), '40.00|partial')

    def test_price_reduction_preserves_credit(self):
        self.sql('update show_bookings set total_cost=60,balance_remaining=0;')
        self.assertEqual(self.state(), '-10.00|paid')

    def test_overcollection_rejected_and_opening_rolls_back(self):
        result = self.sql(self.receipt(40), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state(), '30.00|partial')
        self.assertEqual(self.sql('select count(*) from show_booking_payments;').stdout.strip(), '0')

    def test_cross_business_receipt_rejected(self):
        self.assertNotEqual(self.sql(self.receipt(10, OTHER), check=False).returncode, 0)

    def test_paid_booking_cannot_switch_to_invoice(self):
        self.assertNotEqual(self.sql("update show_bookings set billing_mode='invoice';", check=False).returncode, 0)

    def test_invalid_and_nonpositive_receipt_rejected(self):
        for amount in ['0', '-1', "'NaN'"]:
            self.assertNotEqual(self.sql(self.receipt(amount), check=False).returncode, 0)

    def test_provider_overpayment_is_retained_as_credit(self):
        self.sql(self.receipt(50, method='stripe'))
        self.assertEqual(self.state(), '-20.00|paid')

    def test_provider_receipt_after_cancellation_is_not_discarded(self):
        self.sql('update show_bookings set cancelled_at=now();')
        self.sql(self.receipt(30, method='stripe'))
        self.assertEqual(self.state(), '0.00|paid')

    def test_cash_after_cancellation_rejected(self):
        self.sql('update show_bookings set cancelled_at=now();')
        self.assertNotEqual(self.sql(self.receipt(30), check=False).returncode, 0)

    def test_failed_summary_update_rolls_back_receipt_and_opening(self):
        self.sql('''create function public.reject_summary() returns trigger language plpgsql as $$
          begin raise exception 'fixture summary failure'; end; $$;
          create trigger fixture_reject_summary before update on show_bookings
          for each row execute function public.reject_summary();''')
        try:
            result = self.sql(self.receipt(10), check=False)
            self.assertIn('fixture summary failure', result.stderr)
            self.assertEqual(self.sql('select count(*) from show_booking_payments;').stdout.strip(), '0')
            self.assertEqual(self.state(), '30.00|partial')
        finally:
            self.sql('drop trigger fixture_reject_summary on show_bookings; drop function public.reject_summary();')

    def test_duplicate_and_concurrent_final_payment(self):
        first = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write('begin;' + self.receipt(30) + 'select pg_sleep(1); commit;')
        first.stdin.close()
        for _ in range(100):
            if self.sql("select count(*) from pg_stat_activity where wait_event='PgSleep';").stdout.strip() != '0':
                break
            time.sleep(.02)
        second = self.sql(self.receipt(30), check=False)
        first.wait(timeout=5)
        try:
            self.assertEqual(first.returncode, 0, first.stderr.read())
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(self.state(), '0.00|paid')
            self.assertEqual(self.sql('select sum(amount) from show_booking_payments;').stdout.strip(), '100.00')
        finally:
            first.stdout.close()
            first.stderr.close()


if __name__ == '__main__':
    unittest.main()
