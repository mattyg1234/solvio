"""B03/DB3 regression tests against actual RLS on disposable PostgreSQL 17.

Run: python3 tests/show-ops/staff-permissions.py
Starts its own temporary localhost cluster/port and separate test database.
Existing fixtures are imported unchanged. The missing legacy rate table has a
minimal fixture definition; this is not a full replay of the production schema.
"""
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('partners', Path(__file__).with_name('partner-organisations.py'))
partners = importlib.util.module_from_spec(spec)
spec.loader.exec_module(partners)
s = partners.s
DB = 'solvio_staff_permissions_test'
PG_BIN = Path(os.environ.get('PG_TEST_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MIGRATION = '20260908221252_show_ops_staff_action_permissions.sql'


class StaffPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='solvio-staff-permissions-')
        cls.addClassCleanup(cls.temp.cleanup)
        data = str(Path(cls.temp.name) / 'data')
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        subprocess.run([str(PG_BIN/'initdb'), '-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'],
                       check=True, capture_output=True, text=True, timeout=30)
        subprocess.run([str(PG_BIN/'pg_ctl'), '-D', data, '-l', str(Path(cls.temp.name)/'postgres.log'),
                        '-o', f'-h 127.0.0.1 -p {port} -k {cls.temp.name}', '-w', 'start'],
                       check=True, capture_output=True, text=True, timeout=30)
        cls.addClassCleanup(lambda: subprocess.run([str(PG_BIN/'pg_ctl'), '-D', data, '-m', 'fast', '-w', 'stop'],
                                                   check=True, capture_output=True, timeout=30))
        s.PSQL, s.PORT, s.DB = str(PG_BIN/'psql'), str(port), DB
        # Existing fixture defaults captured their original DB at definition time.
        # Redirect only this imported module, inside our private cluster.
        original_sql, original_command = s.sql, s.command
        s.command = lambda db=DB: original_command(db)
        s.sql = lambda query, role=None, check=True, db=DB: original_sql(query, role, check, db)
        print(f'Isolated PostgreSQL 17: 127.0.0.1:{port}/{DB}', flush=True)

    def migration(self, name):
        s.sql((s.ROOT/'supabase/migrations'/name).read_text())

    def setUp(self):
        partners.PartnerOrganisations.setUp(self)
        s.sql('''alter table show_suppliers add column island text;
          create table show_rate_prices(id uuid primary key default gen_random_uuid(), business_id uuid,
            product_id uuid references show_products(id), rate_id uuid references show_supplier_rates(id), amount numeric);
          alter table show_rate_prices enable row level security;
          grant all on show_rate_prices to authenticated;
          create policy rate_fixture_staff on show_rate_prices for all to authenticated
            using(show_ops_can_access(business_id)) with check(show_ops_can_access(business_id));
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
          alter table show_bookings add column cancel_reason text, add column cancelled_by uuid;
        ''')
        for migration in [
            '20260825120000_show_ops_staff_pages.sql',
            '20260814120000_show_ops_door_list.sql',
            '20260814200000_show_ops_arrived_pax.sql',
            '20260814210000_show_ops_no_show_invoice.sql',
            '20260905181330_show_ops_ticket_types.sql',
            '20260905182450_show_ops_configurable_extras.sql',
            '20260905100500_show_ops_booking_history.sql',
            '20260905183006_show_ops_island_permissions.sql',
            '20260905184331_show_ops_booking_audit.sql',
            '20260905211000_show_ops_booking_policy_performance.sql',
        ]:
            self.migration(migration)
        # Include membership/business recursion fix against enabled business RLS.
        s.sql('alter table businesses enable row level security;')
        self.migration('20260905210500_show_ops_membership_policy_recursion.sql')
        s.sql('''create policy business_fixture_owner on businesses for select to authenticated using(owner_id=auth.uid());
          alter table show_bookings add column legacy_id text;
          update businesses set show_ops_enabled=true;
          update show_products set capacity=null;
          update show_suppliers set island='Tenerife';''')
        self.migration('20260909000000_show_ops_imported_paid_opening_balance.sql')
        self.migration(MIGRATION)
        s.sql(s.booking() + ';')
        self.booking = s.sql('select id from show_bookings;').stdout.strip()
        s.sql('update show_bookings set total_cost=100,balance_remaining=100;')
        self.invoice = s.sql(f"""insert into show_invoices(business_id,supplier_name,island,period_start,period_end)
          values('{s.BIZ}','Partner','Tenerife','2026-10-01','2026-10-31') returning id;""").stdout.strip()
        s.sql(self.line())
        s.sql(f"insert into show_rate_prices(business_id,product_id,amount) values('{s.BIZ}','{s.PRODUCT}',10);")

    def grant(self, role, pages, islands=None):
        def array(values):
            return 'null' if values is None else 'array[' + ','.join("'"+v+"'" for v in values) + ']::text[]'
        s.sql(f"update show_ops_members set allowed_pages={array(pages)},allowed_islands={array(islands)} where user_id='{s.USERS[role]}';")

    def count(self, query, role='booker'):
        return int(s.sql(query, role).stdout.strip().splitlines()[-1])

    def denied(self, query, role='booker', message=None):
        result = s.sql(query, role, check=False)
        self.assertNotEqual(result.returncode, 0, query)
        if message:
            self.assertIn(message, result.stderr)

    def payment(self, method='cash', note='Test', biz=None, booking=None):
        return f"""insert into show_booking_payments(business_id,booking_id,amount,method,note)
          values('{biz or s.BIZ}','{booking or self.booking}',10,'{method}','{note}');"""

    def line(self):
        return f"""insert into show_invoice_lines(business_id,invoice_id,booking_id,booking_ref,guest_name)
          values('{s.BIZ}','{self.invoice}','{self.booking}','Test','Test');"""

    def test_invoice_crud_requires_finance_and_invoices_page(self):
        for role in ['booker', 'office', 'seller', 'outsider']:
            with self.subTest(role=role):
                self.grant(role, ['invoices'])
                for table in ['show_invoices', 'show_invoice_lines']:
                    self.assertEqual(self.count(f'select count(*) from {table};', role), 0)
                    self.assertEqual(self.count(f'with x as(update {table} set business_id=business_id returning id) select count(*) from x;', role), 0)
                    self.assertEqual(self.count(f'with x as(delete from {table} returning id) select count(*) from x;', role), 0)
                self.denied(self.line(), role)
                self.denied(f"insert into show_invoices(business_id,supplier_name,period_start,period_end) values('{s.BIZ}','X','2026-10-01','2026-10-31');", role)
        for role in ['finance', 'admin', 'owner']:
            for table in ['show_invoices', 'show_invoice_lines']:
                self.assertEqual(self.count(f'with x as(update {table} set business_id=business_id returning id) select count(*) from x;', role), 1)
        for role in ['finance', 'admin']:
            self.grant(role, ['door'])
            self.assertEqual(self.count('select count(*) from show_invoices;', role), 0)

    def test_finance_only_can_link_unlink_invoice_but_cannot_edit_guest(self):
        self.grant('finance', ['invoices'])
        s.sql(f"update show_bookings set invoice_id='{self.invoice}';", 'finance')
        s.sql('update show_bookings set invoice_id=null;', 'finance')
        self.denied("update show_bookings set guest_name='Forbidden';", 'finance', 'permitted pages')
        self.denied(f"update show_bookings set invoice_id='{self.invoice}';", 'booker', 'finance')
        # INSERT must not provide an alternative to the invoice UPDATE guard.
        linked = s.booking().replace('transport_required)', 'transport_required,invoice_id)').replace(
            '1,0,0,false)', f"1,0,0,false,'{self.invoice}')")
        self.denied(linked, 'booker')

    def test_rate_prices_writes_require_admin_and_matching_catalogue_page(self):
        for role in ['booker', 'office', 'finance', 'seller', 'outsider']:
            self.grant(role, ['shows', 'partners'])
            self.assertEqual(self.count('with x as(update show_rate_prices set amount=20 returning id) select count(*) from x;', role), 0)
            self.assertEqual(self.count('with x as(delete from show_rate_prices returning id) select count(*) from x;', role), 0)
            self.denied(f"insert into show_rate_prices(business_id,product_id,amount) values('{s.BIZ}','{s.PRODUCT}',20);", role)
        for page in ['shows', 'partners']:
            self.grant('admin', [page])
            self.assertEqual(self.count('with x as(update show_rate_prices set amount=20 returning id) select count(*) from x;', 'admin'), 1)
        self.grant('admin', ['hotels'])
        self.assertEqual(self.count('with x as(update show_rate_prices set amount=30 returning id) select count(*) from x;', 'admin'), 0)
        self.assertEqual(self.count('select count(*) from show_rate_prices;', 'booker'), 1)
        self.assertEqual(self.count('select count(*) from show_products;', 'seller'), 2)

    def test_door_and_lists_preserve_limited_updates_block_full_edits(self):
        for role in ['booker', 'office', 'finance', 'admin']:
            for page in ['door', 'lists']:
                with self.subTest(role=role, page=page):
                    self.grant(role, [page])
                    s.sql("update show_bookings set arrived_pax=1,arrived_at=now(),door_pay_method='cash',no_show=false,no_show_charge='charge',no_show_decided_at=now();", role)
                    for patch in ["guest_name='Changed'", 'adults=2', 'total_cost=1', 'balance_remaining=0',
                                  "payment_status='paid'", "office_only_comments='Changed'", "show_date='2026-10-02'",
                                  f"supplier_id='{s.SUPPLIER2}'", 'cancelled_at=now()']:
                        self.denied(f'update show_bookings set {patch};', role)
                    self.denied(s.booking(), role)
                    self.assertEqual(self.count('with x as(delete from show_bookings returning id) select count(*) from x;', role), 0)

    def test_booking_and_cancellation_floors(self):
        self.grant('booker', ['bookings'])
        s.sql("update show_bookings set guest_name='Corrected';", 'booker')
        s.sql(s.booking(), 'booker')
        self.denied('update show_bookings set cancelled_at=now();', 'booker', 'office')
        self.grant('office', ['bookings'])
        s.sql("update show_bookings set cancelled_at=now(),cancel_reason='Guest cancelled';", 'office')

    def test_lists_and_bus_pickups_are_narrow(self):
        stop = s.sql('select id from show_bus_stops;').stdout.strip()
        for page in ['lists', 'buses']:
            self.grant('booker', [page])
            s.sql(f"update show_bookings set pickup_stop_id='{stop}',pickup_stop_name='Test',transport_required=true;", 'booker')
            self.denied("update show_bookings set guest_name='Changed';", 'booker')
        self.grant('booker', ['door'])
        self.denied('update show_bookings set pickup_stop_id=null;', 'booker')

    def test_payment_insert_matrix_and_import_stripe_spoofing(self):
        for role in ['office', 'finance', 'admin', 'owner']:
            for method in ['cash', 'card', 'transfer', 'other']:
                s.sql(self.payment(method), role)
        self.grant('booker', ['bookings'])
        self.denied(self.payment(), 'booker')
        for role in ['booker', 'office']:
            for page in ['door', 'lists']:
                self.grant(role, [page])
                for method in ['cash', 'card']:
                    s.sql(self.payment(method), role)
                for method in ['transfer', 'other', 'import', 'stripe']:
                    self.denied(self.payment(method), role)
        for role in ['owner', 'admin', 'finance', 'office', 'booker', 'seller', 'outsider']:
            self.denied(self.payment('import'), role)
            self.denied(self.payment('stripe'), role)
        self.grant('office', ['reports'])
        self.denied(self.payment(), 'office')
        self.denied(self.payment(), 'seller')
        self.denied(self.payment(), 'outsider')

    def test_payment_history_is_immutable_for_all_authenticated_roles(self):
        s.sql(self.payment())
        for role in ['owner', 'admin', 'finance', 'office', 'booker', 'seller', 'outsider']:
            self.assertEqual(self.count('with x as(update show_booking_payments set amount=1 returning id) select count(*) from x;', role), 0)
            self.assertEqual(self.count('with x as(delete from show_booking_payments returning id) select count(*) from x;', role), 0)
            self.assertEqual(self.count('with x as(delete from show_bookings returning id) select count(*) from x;', role), 0)
        self.assertEqual(s.sql('select count(*) from show_booking_payments;').stdout.strip(), '1')

    def test_nested_summary_only_exception_and_atomic_rollback(self):
        # Contract test, not a substitute for the parent worker's payment tests.
        s.sql('''create function private.staff_permissions_test_summary() returns trigger
          language plpgsql security definer set search_path='' as $$ begin
            if new.note='bad nested price' then
              update public.show_bookings set balance_remaining=80,payment_status='partial',total_cost=101 where id=new.booking_id;
            else
              update public.show_bookings set balance_remaining=90,payment_status='partial',updated_at=now() where id=new.booking_id;
            end if;
            return new;
          end $$;
          create trigger test_payment_summary after insert on show_booking_payments
            for each row execute function private.staff_permissions_test_summary();''')
        self.grant('booker', ['door'])
        s.sql(self.payment(), 'booker')
        self.assertEqual(s.sql('select balance_remaining from show_bookings;').stdout.strip(), '90.00')
        self.denied(self.payment(note='bad nested price'), 'booker', 'permitted pages')
        self.assertEqual(s.sql('select count(*) from show_booking_payments;').stdout.strip(), '1')
        self.assertEqual(s.sql('select balance_remaining from show_bookings;').stdout.strip(), '90.00')

    def test_islands_and_tenant_restrictions_still_intersect_permissions(self):
        for role in ['admin', 'finance', 'office', 'booker']:
            self.grant(role, None, ['Lanzarote'])
            self.assertEqual(self.count('select count(*) from show_bookings;', role), 0)
            self.assertEqual(self.count('select count(*) from show_invoices;', role), 0)
            self.denied(self.payment(), role)
            self.grant(role, None, [])
            self.denied(self.payment(), role)
            self.grant(role, None, ['Tenerife'])
            self.assertEqual(self.count('select count(*) from show_bookings;', role), 1)
            s.sql(self.payment(), role)
        self.denied(self.payment(biz=s.OTHER), 'owner')
        self.denied(self.payment(), 'outsider')
        self.grant('admin', ['shows'], ['Lanzarote'])
        self.assertEqual(self.count('with x as(update show_rate_prices set amount=5 returning id) select count(*) from x;', 'admin'), 0)
        self.grant('admin', ['shows'], ['Tenerife'])
        self.denied(f"insert into show_rate_prices(business_id,product_id,amount) values('{s.OTHER}','{s.PRODUCT}',5);", 'admin')

    def test_seller_booking_and_photo_rpc_survive_without_raw_edit_access(self):
        self.grant('seller', ['bookings'], ['Tenerife'])
        result = s.sql(s.booking() + ';', 'seller')
        seller_booking = s.sql(f"select id from show_bookings where created_by='{s.USERS['seller']}';").stdout.strip()
        photo = f'{s.BIZ}/{seller_booking}/50000000-0000-0000-0000-000000000001.jpg'
        s.sql(f"insert into storage.objects(bucket_id,name) values('show-ops-proofs','{photo}');", 'seller')
        s.sql(f"select show_ops_attach_seller_ticket('{seller_booking}','{photo}');", 'seller')
        self.assertEqual(self.count('select count(*) from show_bookings;', 'seller'), 0)
        self.assertEqual(self.count('with x as(update show_bookings set guest_name=\'Changed\' returning id) select count(*) from x;', 'seller'), 0)
        self.denied(s.booking(supplier=s.SUPPLIER2), 'seller')
        self.grant('seller', None, [])
        self.denied(s.booking(), 'seller')

    def test_current_membership_page_role_and_enabled_state_rechecked(self):
        action = f"select private.show_ops_has_action('{s.BIZ}','finance',array['invoices'])::int;"
        self.assertEqual(self.count(action, 'finance'), 1)
        self.grant('finance', ['door'])
        self.assertEqual(self.count(action, 'finance'), 0)
        self.grant('finance', ['invoices'])
        s.sql(f"update show_ops_members set role='office' where user_id='{s.USERS['finance']}';")
        self.assertEqual(self.count(action, 'finance'), 0)
        s.sql('update businesses set show_ops_enabled=false;')
        self.assertEqual(self.count(action, 'owner'), 0)
        self.denied(self.payment(), 'owner')
        s.sql('update businesses set show_ops_enabled=true;')
        s.sql(f"delete from show_ops_members where user_id='{s.USERS['office']}';")
        self.denied(self.payment(), 'office')

    def test_empty_pages_default_unknown_pages_deny_and_owner_precedence(self):
        for role in ['booker', 'office', 'finance', 'admin']:
            self.grant(role, [])
            self.assertEqual(self.count(f"select private.show_ops_has_action('{s.BIZ}','booker',array['bookings'])::int;", role), 1)
            self.grant(role, ['unknown'])
            self.assertEqual(self.count(f"select private.show_ops_has_action('{s.BIZ}','booker',array['bookings'])::int;", role), 0)
        s.sql(f"insert into show_ops_members(business_id,user_id,role,allowed_pages,allowed_islands) values('{s.BIZ}','{s.USERS['owner']}','booker',array['door'],'{{}}');")
        self.assertEqual(self.count(f"select private.show_ops_has_action('{s.BIZ}','finance',array['invoices'])::int;", 'owner'), 1)
        self.assertEqual(self.count('select count(*) from show_invoices;', 'owner'), 1)

    def test_combined_parent_payment_trigger_materializes_import_and_updates_door_summary(self):
        self.migration('20260908221214_show_ops_opening_paid_balance.sql')
        # Emulate a legacy record arriving after migration, before its first receipt.
        s.sql(f"""insert into show_bookings(business_id,booking_ref,guest_name,show_name,show_date,island,
          total_cost,balance_remaining,payment_status,legacy_id)
          values('{s.BIZ}','Legacy','Guest','Test','2026-10-01','Tenerife',100,40,'partial','legacy-1');""")
        legacy = s.sql("select id from show_bookings where booking_ref='Legacy';").stdout.strip()
        self.grant('booker', ['door'], ['Tenerife'])
        s.sql(self.payment(booking=legacy), 'booker')
        self.assertEqual(s.sql(f"select amount from show_booking_payments where booking_id='{legacy}' and method='import';").stdout.strip(), '60.00')
        self.assertEqual(s.sql(f"select balance_remaining from show_bookings where id='{legacy}';").stdout.strip(), '30.00')
        self.denied(self.payment('import', booking=legacy), 'booker')
        self.denied(f"update show_bookings set balance_remaining=0 where id='{legacy}';", 'booker')
        self.assertEqual(s.sql(f"select count(*) from show_booking_payments where booking_id='{legacy}';").stdout.strip(), '2')

    def test_combined_parent_zero_opening_and_booking_price_change(self):
        self.migration('20260908221214_show_ops_opening_paid_balance.sql')
        s.sql(f"""insert into show_bookings(business_id,booking_ref,guest_name,show_name,show_date,island,
          total_cost,balance_remaining,legacy_id)
          values('{s.BIZ}','Zero','Guest','Test','2026-10-01','Tenerife',100,100,'legacy-0');""")
        legacy = s.sql("select id from show_bookings where booking_ref='Zero';").stdout.strip()
        self.grant('office', ['lists'], ['Tenerife'])
        s.sql(self.payment(booking=legacy), 'office')
        self.assertEqual(s.sql(f"select amount from show_booking_payments where booking_id='{legacy}' and method='import';").stdout.strip(), '0.00')
        self.grant('office', ['bookings'], ['Tenerife'])
        s.sql(f"update show_bookings set total_cost=120,balance_remaining=100 where id='{legacy}';", 'office')
        self.assertEqual(s.sql(f"select balance_remaining from show_bookings where id='{legacy}';").stdout.strip(), '110.00')
        self.assertEqual(s.sql(f"select count(*) from show_booking_payments where booking_id='{legacy}';").stdout.strip(), '2')


if __name__ == '__main__':
    unittest.main(verbosity=2)
