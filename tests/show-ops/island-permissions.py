"""Per-island permissions exercised as real JWT database roles on localhost."""
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('o',Path(__file__).with_name('partner-organisations.py'));o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o);s=o.s
class IslandPermissions(unittest.TestCase):
 def setUp(self):
  o.PartnerOrganisations.setUp(self)
  s.sql('alter table show_suppliers add column if not exists island text; alter table show_invoices add column if not exists island text;')
  s.sql((s.ROOT/'supabase/migrations/20260905181330_show_ops_ticket_types.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905182450_show_ops_configurable_extras.sql').read_text())
  s.sql('alter table show_ops_members add column display_name text;')
  s.sql((s.ROOT/'supabase/migrations/20260905100500_show_ops_booking_history.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905183006_show_ops_island_permissions.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905184331_show_ops_booking_audit.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905211000_show_ops_booking_policy_performance.sql').read_text())
  s.sql(f"update show_products set island='Lanzarote' where id='{s.PRODUCT2}'; update show_ops_members set allowed_islands=array['Tenerife'] where user_id in ('{s.USERS['admin']}','{s.USERS['seller']}');")
 def count(self,q,role='admin'):return int(s.sql(q,role).stdout.strip().splitlines()[-1])
 def denied(self,q,role='admin'):self.assertNotEqual(s.sql(q,role,check=False).returncode,0)
 def test_restricted_admin_can_only_read_write_own_island(self):
  self.assertEqual(self.count('select count(*) from show_products;'),1)
  self.assertEqual(self.count('with x as(update show_products set capacity=10 returning id) select count(*) from x;'),1)
  self.denied(f"insert into show_products(business_id,name,island) values ('{s.BIZ}','Other','Lanzarote');")
  self.assertEqual(self.count('select count(*) from show_products;','owner'),2)
 def test_empty_islands_mean_none(self):
  s.sql(f"update show_ops_members set allowed_islands='{{}}' where user_id='{s.USERS['admin']}';")
  self.assertEqual(self.count('select count(*) from show_products;'),0)
  self.assertEqual(self.count('select count(*) from show_suppliers;'),0)
 def test_cannot_expand_own_scope_or_promote(self):
  self.assertEqual(self.count('with x as(update show_ops_members set allowed_islands=null returning id) select count(*) from x;'),0)
  self.assertEqual(self.count('with x as(update show_ops_members set partner_admin=true where role=\'seller\' returning id) select count(*) from x;'),0)
 def test_scope_inherited_on_invite(self):
  s.sql(f"update show_ops_members set partner_admin=true where user_id='{s.USERS['seller']}';")
  new='40000000-0000-0000-0000-000000000010';s.sql(f"insert into auth.users values ('{new}');")
  q=f"insert into show_ops_members(business_id,user_id,role,supplier_id,allowed_islands) values ('{s.BIZ}','{new}','seller','{s.SUPPLIER}',"
  self.denied(q+'null);','seller');self.denied(q+"array['Lanzarote']);",'seller');s.sql(q+"array['Tenerife']);",'seller')
 def test_cross_island_product_cannot_hide_under_allowed_label(self):
  self.denied(s.booking(product=s.PRODUCT2))
 def test_partner_rpc_scope_and_storage_scope(self):
  s.sql(s.booking(),'seller')
  s.sql(s.booking(product=s.PRODUCT2).replace("'Tenerife'","'Lanzarote'").replace('transport_required)','transport_required,created_by)').replace('1,0,0,false)',f"1,0,0,false,'{s.USERS['seller']}')"))
  self.assertEqual(self.count(f"select count(*) from show_ops_partner_bookings('{s.BIZ}','{s.SUPPLIER}',null,null);",'seller'),1)
  b=s.sql("select id from show_bookings where island='Lanzarote';").stdout.strip();p=f'{s.BIZ}/{b}/50000000-0000-0000-0000-000000000001.jpg'
  self.assertEqual(self.count(f"select count(*) from show_ops_seller_ticket_booking('{b}');",'seller'),0)
  self.denied(f"insert into storage.objects(bucket_id,name) values ('show-ops-proofs','{p}');",'seller')
 def test_shared_partners_readable_but_not_editable(self):
  s.sql("update show_suppliers set island='ALL';")
  self.assertEqual(self.count('select count(*) from show_suppliers;'),2)
  self.assertEqual(self.count('with x as(update show_suppliers set name=\'Changed\' returning id) select count(*) from x;'),0)
  s.sql(f"update show_suppliers set island='Tenerife, Lanzarote' where id='{s.SUPPLIER}';")
  self.assertEqual(self.count('select count(*) from show_suppliers;'),2)
  self.assertEqual(self.count(f"with x as(update show_suppliers set name='Changed' where id='{s.SUPPLIER}' returning id) select count(*) from x;"),0)
 def test_dependent_types_and_extras_follow_show(self):
  for table in ['show_ticket_types','show_extras']:
   price=',unit_price' if table=='show_extras' else '';value=',10' if price else ''
   s.sql(f"insert into {table}(business_id,product_id,name{price}) values ('{s.BIZ}','{s.PRODUCT}','Own'{value}),('{s.BIZ}','{s.PRODUCT2}','Other'{value});")
   self.assertEqual(self.count(f'select count(*) from {table};'),1)
 def test_null_invoice_is_global_only(self):
  s.sql(f"insert into show_invoices(business_id,supplier_name,period_start,period_end,invoice_date,island) values ('{s.BIZ}','Test','2026-10-01','2026-10-31','2026-10-31',null),('{s.BIZ}','Test','2026-10-01','2026-10-31','2026-10-31','Tenerife');")
  self.assertEqual(self.count('select count(*) from show_invoices;'),1)
 def test_unrestricted_nonowner_admin_can_manage_staff(self):
  s.sql(f"update show_ops_members set allowed_islands=null where user_id='{s.USERS['admin']}';")
  user='40000000-0000-0000-0000-000000000010';s.sql(f"insert into auth.users values ('{user}');")
  s.sql(f"insert into show_ops_members(business_id,user_id,role,allowed_islands) values ('{s.BIZ}','{user}','booker',array['Tenerife']);",'admin')
  self.assertEqual(self.count(f"with x as(delete from show_ops_members where user_id='{user}' returning id) select count(*) from x;"),1)
 def test_owner_scope_wins_over_restricted_membership(self):
  s.sql(f"insert into show_ops_members(business_id,user_id,role,allowed_islands) values ('{s.BIZ}','{s.USERS['owner']}','booker','{{}}');")
  s.sql(s.booking())
  self.assertEqual(self.count('select count(*) from show_bookings;','owner'),1)
 def test_prepared_booking_query_rechecks_current_user(self):
  s.sql(s.booking())
  s.sql(s.booking(product=s.PRODUCT2).replace("'Tenerife'","'Lanzarote'"))
  statements=["set role authenticated; prepare visible_bookings as select count(*) from show_bookings;"]
  for role in ['admin','outsider','owner','seller']:
   statements.append(f"select set_config('request.jwt.claim.sub','{s.USERS[role]}',false); execute visible_bookings;")
  rows=s.sql(' '.join(statements)).stdout.strip().splitlines()
  self.assertEqual(rows[1::2],['1','0','2','0'])
 def test_invoice_cannot_claim_other_island_booking(self):
  s.sql(s.booking(product=s.PRODUCT2).replace("'Tenerife'","'Lanzarote'"));b=s.sql('select id from show_bookings;').stdout.strip()
  inv=s.sql(f"insert into show_invoices(business_id,supplier_name,period_start,period_end,invoice_date,island) values ('{s.BIZ}','Test','2026-10-01','2026-10-31','2026-10-31','Tenerife') returning id;").stdout.strip()
  self.denied(f"insert into show_invoice_lines(business_id,invoice_id,booking_id,booking_ref,guest_name) values ('{s.BIZ}','{inv}','{b}','TEST','Test');",'owner')
  s.sql('alter table show_invoice_lines alter column booking_id drop not null;')
  self.denied(f"insert into show_invoice_lines(business_id,invoice_id,source_booking_id,booking_ref,guest_name) values ('{s.BIZ}','{inv}','{b}','TEST','Test');",'owner')
  s.sql(f"update show_invoices set island='Lanzarote' where id='{inv}';")
  s.sql(f"insert into show_invoice_lines(business_id,invoice_id,booking_id,booking_ref,guest_name) values ('{s.BIZ}','{inv}','{b}','TEST','Test');",'owner')
  self.denied(f"update show_invoices set island='Tenerife' where id='{inv}';",'owner')
if __name__=='__main__':unittest.main(verbosity=2)
