"""Integration regressions on a disposable local PostgreSQL 17 database.
Run: python3 tests/show-ops/partner-safety.py
Requires PostgreSQL tools in PATH; override PSQL and PG_TEST_PORT if necessary.
Never connects to a remote database. Set BEFORE_SAFETY=1 to reproduce pre-fix failures.
"""
import os
from pathlib import Path
import subprocess
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
PSQL = os.environ.get('PSQL', '/opt/homebrew/opt/postgresql@17/bin/psql')
PORT = os.environ.get('PG_TEST_PORT', '55439')
DB = 'solvio_partner_safety_test'
BIZ = '10000000-0000-0000-0000-000000000001'
OTHER = '10000000-0000-0000-0000-000000000002'
PRODUCT = '20000000-0000-0000-0000-000000000001'
PRODUCT2 = '20000000-0000-0000-0000-000000000002'
SUPPLIER = '30000000-0000-0000-0000-000000000001'
SUPPLIER2 = '30000000-0000-0000-0000-000000000002'
USERS = {r: f'40000000-0000-0000-0000-{i:012}' for i, r in enumerate(['owner','admin','office','finance','booker','seller','seller2','outsider'], 1)}


def command(db=DB):
    return [PSQL, '-X', '-h', '127.0.0.1', '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq']


def sql(query, role=None, check=True, db=DB):
    if role:
        query = f"set role authenticated; select set_config('request.jwt.claim.sub','{USERS[role]}',false); " + query
    p = subprocess.run(command(db), input=query, text=True, capture_output=True)
    if check and p.returncode:
        raise AssertionError(p.stderr)
    return p


def booking(pax=1, product=PRODUCT, supplier=SUPPLIER, day='2026-10-01', bus=False, biz=BIZ):
    return f"""insert into show_bookings(business_id, booking_ref, supplier_id, product_id, show_name, island,
        show_date, guest_name, adults, children, infants, transport_required)
        values ('{biz}',gen_random_uuid()::text,'{supplier}','{product}','Test','Tenerife','{day}','Test',
        {pax},0,0,{str(bus).lower()})"""


def setup_database():
    sql(f'drop database if exists {DB}; create database {DB};', db='postgres')
    sql("""do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated;
        create table businesses(id uuid primary key, owner_id uuid, name text);
        grant select on businesses to authenticated;
        """)
    for name in ['20260811120000_show_ops.sql','20260812200000_show_ops_seller_portals.sql']:
        sql((ROOT/'supabase/migrations'/name).read_text())
    sql('alter table show_bookings add column cancelled_at timestamptz;')
    sql((ROOT/'supabase/migrations/20260816120000_show_ops_night_closes.sql').read_text())
    sql('''create table show_supplier_rates(id uuid primary key default gen_random_uuid(), business_id uuid, name text);
        alter table show_supplier_rates enable row level security;
        grant all on show_supplier_rates to authenticated;
        create policy show_supplier_rates_w on show_supplier_rates for all to authenticated
        using (show_ops_can_access(business_id)) with check (show_ops_can_access(business_id));''')
    if not os.environ.get('BEFORE_SAFETY'):
        sql((ROOT/'supabase/migrations/20260905155752_show_ops_partner_safety.sql').read_text())
    sql('insert into auth.users values '+','.join(f"('{u}')" for u in USERS.values())+';')
    sql(f"insert into businesses values ('{BIZ}','{USERS['owner']}','Test'),('{OTHER}','{USERS['outsider']}','Other');")
    for role in ['admin','office','finance','booker','seller','seller2']:
        # Suppliers are inserted before seller membership below.
        if not role.startswith('seller'):
            sql(f"insert into show_ops_members(business_id,user_id,role) values ('{BIZ}','{USERS[role]}','{role}');")
    sql(f"insert into show_suppliers(id,business_id,name) values ('{SUPPLIER}','{BIZ}','Seller'),('{SUPPLIER2}','{BIZ}','Seller2');")
    for role, supplier in [('seller',SUPPLIER),('seller2',SUPPLIER2)]:
        sql(f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{BIZ}','{USERS[role]}','seller','{supplier}');")
    sql(f"insert into show_products(id,business_id,name,island,capacity) values ('{PRODUCT}','{BIZ}','Test','Tenerife',2),('{PRODUCT2}','{BIZ}','Other','Tenerife',2);")
    for table in ['show_hotels','show_bus_stops','show_supplier_rates']:
        extras = ",island" if table != 'show_supplier_rates' else ''
        values = ",'Tenerife'" if extras else ''
        namecol = 'stop_name,resort' if table == 'show_bus_stops' else 'name'
        names = "'Test','Test'" if table == 'show_bus_stops' else "'Test'"
        sql(f"insert into {table}(business_id,{namecol}{extras}) values ('{BIZ}',{names}{values});")


class Safety(unittest.TestCase):
    def setUp(self):
        sql('truncate show_bookings cascade; truncate show_bus_orders, show_night_closes;')
        sql("update show_products set capacity=2, active=true, island='Tenerife';")

    def denied(self, query, role='seller', expected=None):
        p = sql(query, role, check=False)
        self.assertNotEqual(p.returncode, 0, 'Unexpectedly allowed: '+query)
        if expected:
            self.assertIn(expected, p.stderr)

    def test_catalogue_reads_remain_available(self):
        for role in ['office','finance','booker','seller','admin','owner']:
            self.assertTrue(sql('select count(*) from show_products;', role).stdout.endswith('2\n'))

    def test_catalogue_mutations_are_senior_only(self):
        for role in ['office','finance','booker']:
            for table in ['show_products','show_suppliers','show_hotels','show_bus_stops','show_supplier_rates']:
                with self.subTest(role=role, table=table):
                    # UPDATE/DELETE denied by RLS silently affect zero rows.
                    out = sql(f'with changed as (update {table} set business_id=business_id returning id) select count(*) from changed;', role)
                    self.assertTrue(out.stdout.endswith('0\n'),out.stdout)
                    out = sql(f'with changed as (delete from {table} returning id) select count(*) from changed;', role)
                    self.assertTrue(out.stdout.endswith('0\n'),out.stdout)
            self.denied(f"insert into show_suppliers(business_id,name) values ('{BIZ}','Forbidden');",role)
        for role in ['owner','admin']:
            out = sql('with changed as (update show_products set capacity=2 returning id) select count(*) from changed;',role)
            self.assertTrue(out.stdout.endswith('2\n'))

    def test_cross_tenant_write_denied(self):
        self.denied(f"insert into show_suppliers(business_id,name) values ('{OTHER}','Forbidden');",'admin')

    def test_exactly_full_then_rejected_across_sellers(self):
        sql(booking(2), 'seller')
        self.denied(booking(supplier=SUPPLIER2),'seller2','SHOW_OPS_SHOW_FULL')

    def test_zero_capacity(self):
        sql('update show_products set capacity=0;')
        self.denied(booking(),expected='SHOW_OPS_SHOW_FULL')

    def test_no_limit_remains_unlimited(self):
        sql('update show_products set capacity=null;')
        sql(booking(100), 'seller')

    def test_cancelled_bookings_release_capacity(self):
        sql(booking(2),'seller')
        sql('update show_bookings set cancelled_at=now();','office')
        sql(booking(2,supplier=SUPPLIER2),'seller2')

    def test_different_show_or_night_is_independent(self):
        sql(booking(2),'seller')
        sql(booking(2,product=PRODUCT2),'seller')
        sql(booking(2,day='2026-10-02'),'seller')

    def test_bus_capacity_shared_between_shows(self):
        sql(f"insert into show_bus_orders(business_id,show_date,island,seats_ordered) values ('{BIZ}','2026-10-01','Tenerife',2);")
        sql(booking(2,bus=True),'seller')
        self.denied(booking(product=PRODUCT2,bus=True),expected='SHOW_OPS_BUS_FULL')
        sql(booking(product=PRODUCT2,bus=False),'seller')

    def test_zero_bus_capacity(self):
        sql(f"insert into show_bus_orders(business_id,show_date,island,seats_ordered) values ('{BIZ}','2026-10-01','Tenerife',0);")
        self.denied(booking(bus=True),expected='SHOW_OPS_BUS_FULL')

    def test_staff_override_is_preserved_and_counted(self):
        sql(booking(3),'office')
        self.denied(booking(),expected='SHOW_OPS_SHOW_FULL')

    def test_seller_update_cannot_add_extra_guests(self):
        sql(booking(2),'seller')
        self.denied('update show_bookings set adults=3;',expected='SHOW_OPS_SHOW_FULL')
        sql("update show_bookings set guest_name='Corrected';",'seller')

    def test_full_close_and_inactive_product(self):
        sql(f"insert into show_night_closes(business_id,show_date,island,close_kind) values ('{BIZ}','2026-10-01','Tenerife','full');")
        self.denied(booking(),expected='SHOW_OPS_NIGHT_CLOSED')
        sql('truncate show_night_closes; update show_products set active=false;')
        self.denied(booking(),expected='SHOW_OPS_PRODUCT_UNAVAILABLE')

    def test_seller_cannot_fake_island_or_cancelled_insert(self):
        self.denied(booking().replace("'Tenerife'","'Other'"),expected='SHOW_OPS_PRODUCT_UNAVAILABLE')
        self.denied(booking().replace('transport_required)', 'transport_required,cancelled_at)').replace('false)', 'false,now())'))

    def test_seller_update_cannot_move_into_full_night(self):
        sql(booking(2),'seller')
        sql(booking(1,day='2026-10-02'),'seller')
        self.denied("update show_bookings set show_date='2026-10-01' where show_date='2026-10-02';",expected='SHOW_OPS_SHOW_FULL')

    def test_seller_update_cannot_join_full_bus(self):
        sql(f"insert into show_bus_orders(business_id,show_date,island,seats_ordered) values ('{BIZ}','2026-10-01','Tenerife',1);")
        sql(booking(bus=True),'seller')
        sql(booking(product=PRODUCT2,supplier=SUPPLIER2),'seller2')
        self.denied('update show_bookings set transport_required=true;','seller2','SHOW_OPS_BUS_FULL')

    def test_infants_match_existing_capacity_display(self):
        sql(booking().replace('1,0,0,false)', '1,1,1,false)'), 'office')
        self.denied(booking(),expected='SHOW_OPS_SHOW_FULL')

    def test_unrelated_tenant_bookings_do_not_count(self):
        sql(booking(20,biz=OTHER))
        sql(booking(2),'seller')

    def test_product_island_change_preserves_existing_show_occupancy(self):
        sql(booking(2),'seller')
        sql("update show_products set island='Lanzarote';",'admin')
        self.denied(booking().replace("'Tenerife'", "'Lanzarote'"),expected='SHOW_OPS_SHOW_FULL')

    def test_concurrent_last_seat(self):
        sql('update show_products set capacity=1;')
        prefix = f"set role authenticated; select set_config('request.jwt.claim.sub','{USERS['seller']}',false);"
        first = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write(prefix+' begin; '+booking()+"; select pg_sleep(1.5); commit;")
        first.stdin.close()
        # Wait until the first transaction is sleeping with its seat reserved.
        for _ in range(100):
            if sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep';").stdout.strip() != '0':
                break
            time.sleep(.02)
        else:
            self.fail('First reservation did not reach sleep')
        self.denied(booking(supplier=SUPPLIER2),'seller2','SHOW_OPS_SHOW_FULL')
        first.wait(timeout=5)
        self.assertEqual(first.returncode,0,first.stderr.read())
        first.stdout.close(); first.stderr.close()
        self.assertEqual(sql('select sum(adults) from show_bookings;').stdout.strip(),'1')


if __name__ == '__main__':
    setup_database()
    unittest.main()
