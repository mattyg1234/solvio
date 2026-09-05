"""Real RLS/RPC regression tests; uses only disposable localhost PostgreSQL."""
import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('safety',Path(__file__).with_name('partner-safety.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
s.USERS['teammate']='40000000-0000-0000-0000-000000000009'

class PartnerOrganisations(unittest.TestCase):
    def setUp(self):
        s.setup_database()
        s.sql('''create table profiles(id uuid primary key,email text,full_name text);
          alter table show_bookings add column no_show_proof_path text;
          create schema storage; create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
          alter table storage.objects enable row level security; grant usage on schema storage to authenticated;
          grant all on storage.objects to authenticated;''')
        s.sql((s.ROOT/'supabase/migrations/20260905180237_show_ops_partner_organisations.sql').read_text())
        s.sql(f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{s.BIZ}','{s.USERS['teammate']}','seller','{s.SUPPLIER}'); update show_products set capacity=10000;")
    def count(self,query,role='seller'):
        return int(s.sql(query,role).stdout.strip().splitlines()[-1])
    def rpc(self,role='seller',supplier=s.SUPPLIER):
        return self.count(f"select count(*) from show_ops_partner_bookings('{s.BIZ}','{supplier}',null,null);",role)
    def denied(self,query,role='seller'):
        self.assertNotEqual(s.sql(query,role,check=False).returncode,0)
    def admin(self):
        s.sql(f"update show_ops_members set partner_admin=true where user_id='{s.USERS['seller']}';",'admin')
    def seed(self):
        for role,supplier in [('seller',s.SUPPLIER),('teammate',s.SUPPLIER),('seller2',s.SUPPLIER2)]:
            s.sql(s.booking(supplier=supplier),role)
    def test_seller_reads_only_own_and_no_raw_office_columns(self):
        self.seed();self.assertEqual(self.rpc(),1);self.assertEqual(self.rpc(supplier=s.SUPPLIER2),0)
        self.assertEqual(self.count('select count(*) from show_bookings;'),0)
    def test_admin_reads_org_not_other_org_and_no_raw_columns(self):
        self.seed();self.admin();self.assertEqual(self.rpc(),2);self.assertEqual(self.rpc(supplier=s.SUPPLIER2),0)
        self.assertEqual(self.count('select count(*) from show_bookings;'),0)
    def test_revocation_blocks_old_session(self):
        self.seed();s.sql(f"delete from show_ops_members where user_id='{s.USERS['seller']}';")
        self.assertEqual(self.rpc(),0);self.denied(s.booking())
    def test_attribution_stamped_and_forgery_denied(self):
        s.sql(s.booking(),'seller')
        self.assertEqual(s.sql('select created_by from show_bookings;').stdout.strip(),s.USERS['seller'])
        forged=s.booking().replace('transport_required)','transport_required,created_by)').replace('1,0,0,false)',f"1,0,0,false,'{s.USERS['teammate']}')")
        self.denied(forged)
    def test_sellers_cannot_rewrite_or_delete_booking(self):
        self.seed();self.admin()
        for role in ['seller','teammate']:
            self.assertEqual(self.count('with x as(update show_bookings set total_cost=0 returning id) select count(*) from x;',role),0)
            self.assertEqual(self.count('with x as(delete from show_bookings returning id) select count(*) from x;',role),0)
    def test_admin_remove_ordinary_only_and_keep_history(self):
        self.seed();self.admin()
        self.assertEqual(self.count(f"with x as(delete from show_ops_members where user_id='{s.USERS['seller']}' returning id) select count(*) from x;"),0)
        self.assertEqual(self.count(f"with x as(delete from show_ops_members where user_id='{s.USERS['seller2']}' returning id) select count(*) from x;"),0)
        self.assertEqual(self.count(f"with x as(delete from show_ops_members where user_id='{s.USERS['teammate']}' returning id) select count(*) from x;"),1)
        self.assertEqual(self.rpc(),2)
    def test_ordinary_cannot_remove_or_promote(self):
        self.assertEqual(self.count('with x as(delete from show_ops_members returning id) select count(*) from x;'),0)
        self.assertEqual(self.count('with x as(update show_ops_members set partner_admin=true returning id) select count(*) from x;'),0)
        self.admin();self.assertEqual(self.count('with x as(update show_ops_members set partner_admin=true returning id) select count(*) from x;'),0)
    def test_team_scope(self):
        q=f"select count(*) from show_ops_partner_team('{s.BIZ}','{s.SUPPLIER}');"
        self.assertEqual(self.count(q),1);self.admin();self.assertEqual(self.count(q),2)
        self.assertEqual(self.count(q,'seller2'),0)
    def test_cross_org_binding_rejected(self):
        self.denied(f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{s.OTHER}','{s.USERS['seller']}','seller','{s.SUPPLIER}');",None)
        self.denied(f"update show_ops_members set supplier_id='{s.SUPPLIER2}' where user_id='{s.USERS['seller']}';",None)
    def test_pagination_and_dates(self):
        s.sql(f"insert into show_bookings(business_id,booking_ref,supplier_id,show_name,island,show_date,guest_name,created_by) select '{s.BIZ}',g::text,'{s.SUPPLIER}','Test','Tenerife','2026-10-01','Test','{s.USERS['seller']}' from generate_series(1,1001) g;")
        self.assertEqual(self.rpc(),500)
        self.assertEqual(self.count(f"select count(*) from show_ops_partner_bookings('{s.BIZ}','{s.SUPPLIER}',null,null,1000,500);"),1)
        self.assertEqual(self.count(f"select count(*) from show_ops_partner_bookings('{s.BIZ}','{s.SUPPLIER}','2099-01-01','2099-02-01');"),0)
    def photo(self):
        s.sql(s.booking(),'seller');b=s.sql('select id from show_bookings;').stdout.strip()
        p=f'{s.BIZ}/{b}/50000000-0000-0000-0000-000000000001.jpg'
        return b,p
    def test_owned_photo_attaches_and_cannot_delete_evidence(self):
        b,p=self.photo();s.sql(f"insert into storage.objects(bucket_id,name) values ('show-ops-proofs','{p}');",'seller')
        s.sql(f"select show_ops_attach_seller_ticket('{b}','{p}');",'seller')
        self.assertEqual(self.count('select count(*) from storage.objects;'),1)
        self.assertEqual(self.count('select count(*) from storage.objects;','teammate'),0)
        self.assertEqual(self.count('with x as(delete from storage.objects returning name) select count(*) from x;'),0)
        self.assertEqual(s.sql('select no_show_proof_path from show_bookings;').stdout.strip(),p)
    def test_forged_missing_cancelled_and_cross_seller_photos(self):
        b,p=self.photo();self.denied(f"select show_ops_attach_seller_ticket('{b}','{p}');")
        self.denied(f"insert into storage.objects(bucket_id,name) values ('show-ops-proofs','{p}');",'teammate')
        s.sql(f"insert into storage.objects(bucket_id,name) values ('show-ops-proofs','{p}');",'seller')
        self.denied(f"select show_ops_attach_seller_ticket('{b}','{p}');",'teammate')
        s.sql('update show_bookings set cancelled_at=now();')
        self.denied(f"select show_ops_attach_seller_ticket('{b}','{p}');")
    def test_invite_insert_requires_current_authority(self):
        user='40000000-0000-0000-0000-000000000010'
        s.sql(f"insert into auth.users values ('{user}');")
        q=f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{s.BIZ}','{user}','seller','{s.SUPPLIER}');"
        self.denied(q);self.admin();s.sql(q,'seller')
        s.sql(f"delete from show_ops_members where user_id='{user}'; update show_ops_members set partner_admin=false where user_id='{s.USERS['seller']}';")
        self.denied(q)
        s.sql(q,'office')
    def test_ticket_metadata_is_private(self):
        b,p=self.photo()
        q=f"select count(*) from show_ops_seller_ticket_booking('{b}');"
        self.assertEqual(self.count(q),1);self.assertEqual(self.count(q,'teammate'),0)
        self.admin();self.assertEqual(self.count(q,'seller2'),0)
    def test_concurrent_organisation_binding(self):
        import subprocess,time
        user='40000000-0000-0000-0000-000000000010'
        other_supplier='30000000-0000-0000-0000-000000000003'
        s.sql(f"insert into auth.users values ('{user}'); insert into show_suppliers(id,business_id,name) values ('{other_supplier}','{s.OTHER}','Other');")
        q=f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{s.BIZ}','{user}','seller','{s.SUPPLIER}');"
        first=subprocess.Popen(s.command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        first.stdin.write('begin;'+q+'select pg_sleep(0.5);commit;');first.stdin.close();time.sleep(0.1)
        result=s.sql(f"insert into show_ops_members(business_id,user_id,role,supplier_id) values ('{s.OTHER}','{user}','seller','{other_supplier}');",check=False)
        first.wait();self.assertEqual(first.returncode,0);self.assertNotEqual(result.returncode,0)
        self.assertEqual(s.sql(f"select count(*) from show_ops_members where user_id='{user}';").stdout.strip(),'1')
    def test_capacity_remains_enforced(self):
        s.sql('update show_products set capacity=1;');s.sql(s.booking(),'seller');self.denied(s.booking(),'teammate')

if __name__=='__main__':unittest.main(verbosity=2)
