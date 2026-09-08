"""Holded invoice lifecycle regressions on disposable PostgreSQL 17.

Run: python3 tests/show-ops/holded-lifecycle.py
Starts a private local cluster and never connects to Supabase or Holded.
"""
import importlib.util
from pathlib import Path
import subprocess
import time
import unittest


spec = importlib.util.spec_from_file_location(
    'staff_permissions', Path(__file__).with_name('staff-permissions.py'))
staff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staff)
s = staff.s
MIGRATION = '20260908230000_show_ops_holded.sql'


class HoldedLifecycle(unittest.TestCase):
    migration = staff.StaffPermissions.migration
    grant = staff.StaffPermissions.grant
    count = staff.StaffPermissions.count
    denied = staff.StaffPermissions.denied
    line = staff.StaffPermissions.line

    @classmethod
    def setUpClass(cls):
        staff.StaffPermissions.setUpClass.__func__(cls)

    def setUp(self):
        staff.partners.PartnerOrganisations.setUp(self)
        s.sql('''alter table show_suppliers add column island text;
          create table show_rate_prices(id uuid primary key default gen_random_uuid(), business_id uuid,
            product_id uuid references show_products(id), rate_id uuid references show_supplier_rates(id), amount numeric);
          alter table show_rate_prices enable row level security;
          grant all on show_rate_prices to authenticated;
          create policy rate_fixture_staff on show_rate_prices for all to authenticated
            using(show_ops_can_access(business_id)) with check(show_ops_can_access(business_id));
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
          alter table show_bookings add column cancel_reason text, add column cancelled_by uuid;
          do $$ begin create role anon; exception when duplicate_object then null; end $$;
          do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
        ''')
        for migration in [
            '20260813120000_show_ops_money_cancel.sql',
            '20260814120000_show_ops_door_list.sql',
            '20260814200000_show_ops_arrived_pax.sql',
            '20260814210000_show_ops_no_show_invoice.sql',
            '20260815120000_show_ops_invoice_editor.sql',
            '20260825120000_show_ops_staff_pages.sql',
            '20260905100500_show_ops_booking_history.sql',
            '20260905181330_show_ops_ticket_types.sql',
            '20260905182450_show_ops_configurable_extras.sql',
            '20260905183006_show_ops_island_permissions.sql',
            '20260905184331_show_ops_booking_audit.sql',
        ]:
            self.migration(migration)
        s.sql('alter table businesses enable row level security;')
        self.migration('20260905210500_show_ops_membership_policy_recursion.sql')
        self.migration('20260905211000_show_ops_booking_policy_performance.sql')
        s.sql('''create policy business_fixture_owner on businesses for select to authenticated using(owner_id=auth.uid());
          alter table show_bookings add column legacy_id text;
          update businesses set show_ops_enabled=true;
          update show_products set capacity=null;
          update show_suppliers set island='Tenerife';''')
        self.migration('20260908221214_show_ops_opening_paid_balance.sql')
        self.migration('20260908221252_show_ops_staff_action_permissions.sql')
        self.migration(MIGRATION)
        repairs = list((s.ROOT/'supabase/migrations').glob('*_show_ops_holded_lifecycle_safeguards.sql'))
        if repairs:
            self.migration(repairs[-1].name)
        s.sql(s.booking() + ';')
        self.booking = s.sql('select id from show_bookings;').stdout.strip()
        s.sql('update show_bookings set total_cost=100,balance_remaining=100;')
        self.invoice = s.sql(f"""insert into show_invoices(business_id,supplier_name,island,period_start,period_end)
          values('{s.BIZ}','Partner','Tenerife','2026-10-01','2026-10-31') returning id;""").stdout.strip()
        s.sql(self.line())
        s.sql(f"update show_invoices set status='issued', total_amount=100, net_total=90, vat_total=10 where id='{self.invoice}';")

    def claim_invoice(self, token, role='finance', business=None, invoice=None, check=True):
        return s.sql(
            f"select claim_status, external_id, claim_token from private.show_ops_claim_holded_invoice("
            f"'{business or s.BIZ}','{invoice or self.invoice}','{token}');", role, check=check)

    def claim_credit(self, token, role='finance'):
        return s.sql(
            f"select claim_status, external_id, claim_token from private.show_ops_claim_holded_credit_note("
            f"'{s.BIZ}','{self.invoice}','{token}',25.00,'Supplier correction');", role)

    def test_credentials_are_owner_admin_only_and_tenant_scoped(self):
        s.sql(f"""insert into show_ops_integrations(business_id,provider,secret_ciphertext,created_by)
          values('{s.BIZ}','holded','encrypted-owner','{s.USERS['owner']}');""", 'owner')
        self.assertEqual(self.count("select count(*) from show_ops_integrations where secret_ciphertext='encrypted-owner';", 'owner'), 1)
        self.assertEqual(self.count("select count(*) from show_ops_integrations where secret_ciphertext='encrypted-owner';", 'admin'), 1)
        s.sql("update show_ops_integrations set secret_ciphertext='encrypted-admin';", 'admin')
        for role in ['finance', 'booker', 'seller', 'office', 'outsider']:
            with self.subTest(role=role):
                self.assertEqual(self.count('select count(*) from show_ops_integrations;', role), 0)
                self.denied(
                    f"insert into show_ops_integrations(business_id,provider,secret_ciphertext) values('{s.BIZ}','holded','forbidden');",
                    role)
        self.denied(
            f"insert into show_ops_integrations(business_id,provider,secret_ciphertext) values('{s.OTHER}','holded','cross-tenant');",
            'admin')
        s.sql('delete from show_ops_integrations;', 'owner')
        self.assertEqual(self.count('select count(*) from show_ops_integrations;', 'owner'), 0)

    def test_invoice_claim_rejects_active_duplicate_and_recovers_stale_claim(self):
        first = '51000000-0000-0000-0000-000000000001'
        second = '51000000-0000-0000-0000-000000000002'
        recovered = '51000000-0000-0000-0000-000000000003'
        result = self.claim_invoice(first)
        self.assertIn(f'claimed||{first}', result.stdout)
        self.denied(
            f"select * from private.show_ops_claim_holded_invoice('{s.BIZ}','{self.invoice}','{second}');",
            'finance', 'SHOW_OPS_HOLDED_CLAIM_ACTIVE')
        s.sql(f"update show_invoices set holded_claimed_at=now()-interval '16 minutes' where id='{self.invoice}';")
        result = self.claim_invoice(recovered)
        self.assertIn('reconciliation_required||', result.stdout)
        self.assertNotIn(recovered, result.stdout)
        state = s.sql(f"select holded_claim_token,holded_reconciliation_status from show_invoices where id='{self.invoice}';").stdout
        self.assertIn(f'{first}|required', state)
        self.denied(
            f"select * from private.show_ops_claim_holded_invoice('{s.BIZ}','{self.invoice}','{recovered}');",
            'finance', 'SHOW_OPS_HOLDED_RECONCILIATION_REQUIRED')
        s.sql(f"select private.show_ops_resolve_holded_invoice_claim('{s.BIZ}','{self.invoice}',null,'confirmed_not_found');", 'finance')
        self.assertIn(f'claimed||{recovered}', self.claim_invoice(recovered).stdout)
        self.assertEqual(s.sql("select count(*) from show_invoice_external_events where action in ('invoice_claim','invoice_reconciliation');").stdout.strip(), '4')

    def test_concurrent_invoice_claims_serialize_on_the_invoice_row(self):
        first = '55000000-0000-0000-0000-000000000001'
        second = '55000000-0000-0000-0000-000000000002'
        prefix = (f"set role authenticated; select set_config('request.jwt.claim.sub',"
                  f"'{s.USERS['finance']}',false);")
        process = subprocess.Popen(s.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True)
        process.stdin.write(
            prefix + f" begin; select * from private.show_ops_claim_holded_invoice("
            f"'{s.BIZ}','{self.invoice}','{first}'); select pg_sleep(0.75); commit;")
        process.stdin.close()
        for _ in range(100):
            if s.sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep';").stdout.strip() != '0':
                break
            time.sleep(.02)
        else:
            self.fail('First invoice claim did not reach its lock-holding sleep')
        started = time.monotonic()
        duplicate = s.sql(
            f"select * from private.show_ops_claim_holded_invoice('{s.BIZ}','{self.invoice}','{second}');",
            'finance', check=False)
        elapsed = time.monotonic() - started
        process.wait(timeout=5)
        self.assertEqual(process.returncode, 0, process.stderr.read())
        process.stdout.close()
        process.stderr.close()
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertIn('SHOW_OPS_HOLDED_CLAIM_ACTIVE', duplicate.stderr)
        self.assertGreater(elapsed, .4)

    def test_existing_external_invoice_is_idempotent(self):
        s.sql(f"update show_invoices set holded_document_id='doc_123',holded_status='draft' where id='{self.invoice}';")
        result = self.claim_invoice('51000000-0000-0000-0000-000000000004')
        self.assertIn('existing|doc_123|', result.stdout)

    def test_credit_note_has_one_atomic_claim(self):
        token = '52000000-0000-0000-0000-000000000001'
        s.sql(f"update show_invoices set holded_document_id='doc_123',holded_status='approved' where id='{self.invoice}';")
        result = self.claim_credit(token)
        self.assertIn(f'claimed||{token}', result.stdout)
        stored = s.sql(f"select holded_credit_claim_token,holded_credit_amount,holded_credit_reason from show_invoices where id='{self.invoice}';").stdout
        self.assertIn(f'{token}|25.00|Supplier correction', stored)
        self.denied(
            f"select * from private.show_ops_claim_holded_credit_note('{s.BIZ}','{self.invoice}',"
            "'52000000-0000-0000-0000-000000000002',25.00,'Supplier correction');",
            'finance', 'SHOW_OPS_HOLDED_CREDIT_CLAIM_ACTIVE')

    def test_stale_credit_note_claim_requires_explicit_reconciliation(self):
        first = '52100000-0000-0000-0000-000000000001'
        retry = '52100000-0000-0000-0000-000000000002'
        s.sql(f"update show_invoices set holded_document_id='doc_123',holded_status='approved' where id='{self.invoice}';")
        self.assertIn(f'claimed||{first}', self.claim_credit(first).stdout)
        s.sql(f"update show_invoices set holded_credit_claimed_at=now()-interval '16 minutes' where id='{self.invoice}';")
        stale = s.sql(
            f"select * from private.show_ops_claim_holded_credit_note('{s.BIZ}','{self.invoice}',"
            f"'{retry}',25.00,'Supplier correction');", 'finance')
        self.assertIn('reconciliation_required||', stale.stdout)
        self.assertNotIn(retry, stale.stdout)
        self.denied(
            f"select * from private.show_ops_claim_holded_credit_note('{s.BIZ}','{self.invoice}',"
            f"'{retry}',25.00,'Supplier correction');", 'finance',
            'SHOW_OPS_HOLDED_RECONCILIATION_REQUIRED')
        s.sql(f"select private.show_ops_resolve_holded_credit_note_claim('{s.BIZ}','{self.invoice}',null,'confirmed_not_found');", 'finance')
        self.assertIn(f'claimed||{retry}', s.sql(
            f"select * from private.show_ops_claim_holded_credit_note('{s.BIZ}','{self.invoice}',"
            f"'{retry}',25.00,'Supplier correction');", 'finance').stdout)

    def test_claims_are_tenant_safe(self):
        other_invoice = s.sql(f"""insert into show_invoices(business_id,supplier_name,period_start,period_end,status)
          values('{s.OTHER}','Other','2026-10-01','2026-10-31','issued') returning id;""").stdout.strip()
        token = '53000000-0000-0000-0000-000000000001'
        self.denied(
            f"select * from private.show_ops_claim_holded_invoice('{s.BIZ}','{other_invoice}','{token}');",
            'owner', 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND')
        self.denied(
            f"select * from private.show_ops_claim_holded_invoice('{s.OTHER}','{other_invoice}','{token}');",
            'owner', 'SHOW_OPS_HOLDED_NOT_ALLOWED')

    def test_external_events_are_tenant_scoped_append_only_and_safe(self):
        token = '54000000-0000-0000-0000-000000000001'
        self.claim_invoice(token)
        self.assertEqual(self.count('select count(*) from show_invoice_external_events;', 'owner'), 1)
        self.assertEqual(self.count('select count(*) from show_invoice_external_events;', 'finance'), 1)
        for role in ['booker', 'seller', 'outsider']:
            self.assertEqual(self.count('select count(*) from show_invoice_external_events;', role), 0)
        details = s.sql('select details::text from show_invoice_external_events;').stdout
        self.assertNotIn('secret_ciphertext', details)
        self.assertNotIn('encrypted-', details)
        for role in ['owner', 'admin', 'finance']:
            self.denied("update show_invoice_external_events set safe_message='rewritten';", role)
            self.denied('delete from show_invoice_external_events;', role)
        for statement in [
            "update show_invoice_external_events set safe_message='trusted rewrite';",
            'delete from show_invoice_external_events;',
        ]:
            result = s.sql(statement, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('SHOW_OPS_EXTERNAL_EVENTS_APPEND_ONLY', result.stderr)
        service_insert = s.sql(
            f"set role service_role; insert into show_invoice_external_events(business_id,invoice_id,action,outcome) "
            f"values('{s.BIZ}','{self.invoice}','forged','success');", check=False)
        self.assertNotEqual(service_insert.returncode, 0)

    def test_finance_cannot_write_lifecycle_columns_but_can_edit_normal_invoice_fields(self):
        s.sql("update show_invoices set notes='Legitimate finance edit';", 'finance')
        protected = {
            'holded_document_id': "'forged'", 'holded_doc_number': "'INV-1'",
            'holded_status': "'draft'", 'holded_pushed_at': 'now()', 'holded_synced_at': 'now()',
            'holded_error': "'forged'", 'holded_claim_token': "'56000000-0000-0000-0000-000000000001'",
            'holded_claimed_at': 'now()', 'holded_expected_net': '1', 'holded_expected_tax': '1',
            'holded_expected_total': '1', 'holded_actual_net': '1', 'holded_actual_tax': '1',
            'holded_actual_total': '1', 'holded_amounts_match': 'true',
            'holded_verification_status': "'matched'", 'holded_reconciliation_status': "'required'",
            'holded_credit_note_id': "'credit'", 'holded_credit_note_number': "'CN-1'",
            'holded_credit_status': "'draft'", 'holded_credit_amount': '1',
            'holded_credit_reason': "'forged'", 'holded_credit_claim_token': "'56000000-0000-0000-0000-000000000002'",
            'holded_credit_claimed_at': 'now()',
        }
        for column, value in protected.items():
            with self.subTest(column=column):
                self.denied(f'update show_invoices set {column}={value};', 'finance',
                            'SHOW_OPS_HOLDED_LIFECYCLE_TRUSTED_ONLY')

    def test_holded_financial_values_and_claim_inputs_must_be_finite(self):
        lifecycle_amounts = [
            'holded_expected_net', 'holded_expected_tax', 'holded_expected_total',
            'holded_actual_net', 'holded_actual_tax', 'holded_actual_total', 'holded_credit_amount',
        ]
        for column in lifecycle_amounts:
            for value in ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]:
                with self.subTest(column=column, value=value):
                    result = s.sql(f'update show_invoices set {column}={value};', check=False)
                    self.assertNotEqual(result.returncode, 0)
        for column in ['net_total', 'vat_total', 'total_amount']:
            for value in ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]:
                with self.subTest(claim_source=column, value=value):
                    stored = s.sql(f'update show_invoices set {column}={value};', check=False)
                    if stored.returncode:
                        continue
                    result = self.claim_invoice('57000000-0000-0000-0000-000000000001', check=False)
                    s.sql(f"""update show_invoices set
                      {column}={'10' if column == 'vat_total' else '90' if column == 'net_total' else '100'},
                      holded_claim_token=null,holded_claimed_at=null,holded_status='not_sent',
                      holded_reconciliation_status='not_required';""")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('SHOW_OPS_HOLDED_AMOUNT_INVALID', result.stderr)
        s.sql(f"update show_invoices set holded_document_id='doc_123',holded_status='approved' where id='{self.invoice}';")
        for value in ["'NaN'::numeric", "'Infinity'::numeric", "'-Infinity'::numeric"]:
            result = s.sql(
                f"select * from private.show_ops_claim_holded_credit_note('{s.BIZ}','{self.invoice}',"
                f"'58000000-0000-0000-0000-000000000001',{value},'Correction');",
                'finance', check=False)
            s.sql("""update show_invoices set holded_credit_claim_token=null,holded_credit_claimed_at=null,
              holded_credit_status='not_requested',holded_credit_amount=null,holded_credit_reason=null;""")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('SHOW_OPS_HOLDED_CREDIT_INPUT_INVALID', result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
