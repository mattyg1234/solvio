"""Ticket-type tenant, history and shared capacity regressions on localhost only."""
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('organisations',Path(__file__).with_name('partner-organisations.py'))
o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o);s=o.s
T1='60000000-0000-0000-0000-000000000001'
T2='60000000-0000-0000-0000-000000000002'
class TicketTypes(unittest.TestCase):
 def setUp(self):
  o.PartnerOrganisations.setUp(self)
  s.sql((s.ROOT/'supabase/migrations/20260905181330_show_ops_ticket_types.sql').read_text())
  s.sql(f"insert into show_ticket_types(id,business_id,product_id,name,adult_price) values ('{T1}','{s.BIZ}','{s.PRODUCT}','Standard',50),('{T2}','{s.BIZ}','{s.PRODUCT}','Gold + meal',80);",'admin')
 def denied(self,q,role='seller'):
  self.assertNotEqual(s.sql(q,role,check=False).returncode,0)
 def booking(self,t=T1,product=s.PRODUCT,pax=1):
  return s.booking(pax=pax,product=product).replace('transport_required)','transport_required,ticket_type_id)').replace(f'{pax},0,0,false)',f"{pax},0,0,false,'{t}')")
 def test_types_share_physical_capacity(self):
  s.sql('update show_products set capacity=2;')
  s.sql(self.booking(T1),'seller');s.sql(self.booking(T2),'teammate')
  self.denied(self.booking(T2))
  self.assertEqual(s.sql('select sum(adults) from show_bookings;').stdout.strip(),'2')
 def test_wrong_show_and_archived_type_denied(self):
  self.denied(self.booking(product=s.PRODUCT2))
  s.sql(f"update show_ticket_types set active=false where id='{T1}';",'admin')
  self.denied(self.booking())
 def test_owner_admin_only_prices_and_valid_scope(self):
  for role in ['seller','office','finance','booker']:
   self.assertTrue(s.sql('with x as(update show_ticket_types set adult_price=1 returning id) select count(*) from x;',role).stdout.endswith('0\n'))
  self.denied(f"insert into show_ticket_types(business_id,product_id,name) values ('{s.OTHER}','{s.PRODUCT}','Wrong');",'owner')
  self.denied(f"update show_ticket_types set adult_price=-1 where id='{T1}';",'admin')
 def test_snapshot_name_and_archived_history_survive(self):
  s.sql(self.booking(),'seller');self.assertEqual(s.sql('select ticket_type_name from show_bookings;').stdout.strip(),'Standard')
  s.sql(f"update show_ticket_types set name='Standard new',adult_price=99,active=false where id='{T1}';",'admin')
  self.assertEqual(s.sql('select ticket_type_name from show_bookings;').stdout.strip(),'Standard')
  self.denied(f"delete from show_ticket_types where id='{T1}';",'admin')
  s.sql("update show_bookings set guest_name='Changed';",'office')
 def test_duplicate_live_type_name_rejected(self):
  self.denied(f"insert into show_ticket_types(business_id,product_id,name) values ('{s.BIZ}','{s.PRODUCT}',' standard ');",'admin')
 def test_type_can_disable_transport(self):
  s.sql(f"update show_ticket_types set transport_available=false where id='{T1}';",'admin')
  self.denied(self.booking().replace('false,','true,'))
if __name__=='__main__':unittest.main(verbosity=2)
