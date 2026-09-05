"""Extra catalogue and direct-seller snapshot validation against local PostgreSQL."""
import importlib.util,json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('o',Path(__file__).with_name('partner-organisations.py'));o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o);s=o.s
E='70000000-0000-0000-0000-000000000001'
class Extras(unittest.TestCase):
 def setUp(self):
  o.PartnerOrganisations.setUp(self)
  s.sql((s.ROOT/'supabase/migrations/20260905181330_show_ops_ticket_types.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905182450_show_ops_configurable_extras.sql').read_text())
  s.sql(f"insert into show_extras(id,business_id,product_id,name,unit_price,charge_basis) values ('{E}','{s.BIZ}','{s.PRODUCT}','Custom extra',10,'per_person');")
 def booking(self,**overrides):
  line=dict(id=E,name='Custom extra',unit_price=10,charge_basis='per_person',commissionable=True,quantity=2,gross_total=20,nett_total=20);line.update(overrides)
  return s.booking(2).replace('transport_required)','transport_required,extras_snapshot)').replace('2,0,0,false)',"2,0,0,false,'"+json.dumps([line])+"'::jsonb)")
 def test_valid_extra_and_price_forgery(self):
  s.sql(self.booking(),'seller')
  for patch in [dict(unit_price=1),dict(name='Fake'),dict(quantity=1),dict(gross_total=1),dict(nett_total=0),dict(commissionable=False)]:
   self.assertNotEqual(s.sql(self.booking(**patch),'seller',check=False).returncode,0)
 def test_wrong_product_and_archived_extra(self):
  self.assertNotEqual(s.sql(self.booking().replace(s.PRODUCT,s.PRODUCT2),'seller',check=False).returncode,0)
  s.sql('update show_extras set active=false;')
  self.assertNotEqual(s.sql(self.booking(),'seller',check=False).returncode,0)
 def test_catalogue_is_senior_only(self):
  for role in ['seller','office','booker','finance']:
   self.assertTrue(s.sql('with x as(update show_extras set unit_price=1 returning id) select count(*) from x;',role).stdout.endswith('0\n'))
if __name__=='__main__':unittest.main(verbosity=2)
