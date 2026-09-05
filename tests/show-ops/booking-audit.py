"""Transactional audit coverage on disposable local PostgreSQL."""
import importlib.util,json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('o',Path(__file__).with_name('partner-organisations.py'));o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o);s=o.s
class Audit(unittest.TestCase):
 def setUp(self):
  o.PartnerOrganisations.setUp(self)
  s.sql('alter table show_ops_members add column display_name text;')
  s.sql((s.ROOT/'supabase/migrations/20260905100500_show_ops_booking_history.sql').read_text())
  s.sql((s.ROOT/'supabase/migrations/20260905184331_show_ops_booking_audit.sql').read_text())
  s.sql(f"insert into profiles(id,email,full_name) values ('{s.USERS['seller']}','seller@example.invalid','Test Seller'),('{s.USERS['office']}','office@example.invalid','Test Office');")
  s.sql(s.booking(),'seller');self.b=s.sql('select id from show_bookings;').stdout.strip()
 def test_creation_records_authenticated_identity(self):
  self.assertEqual(s.sql('select created_by_name from show_bookings;').stdout.strip(),'Test Seller')
  row=json.loads(s.sql('select changes from show_booking_history;').stdout)
  self.assertIn('created',row);self.assertIn('guest_name',row)
  self.assertEqual(s.sql('select changed_by_name from show_booking_history;').stdout.strip(),'Test Seller')
 def test_updates_cancellation_photo_and_price_are_captured(self):
  for field,value in [('guest_name',"'Changed'"),('total_cost','99'),('no_show_proof_path',"'test/photo.jpg'"),('cancelled_at','now()')]:
   s.sql(f'update show_bookings set {field}={value};','office')
   data=json.loads(s.sql('select changes from show_booking_history order by changed_at desc limit 1;').stdout)
   self.assertIn(field,data);self.assertIn('from',data[field]);self.assertIn('to',data[field])
  self.assertEqual(s.sql('select count(*) from show_booking_history;').stdout.strip(),'5')
 def test_system_actor_does_not_reuse_old_staff_identity(self):
  s.sql(f"update show_bookings set updated_by='{s.USERS['office']}',guest_name='Office';",'office')
  s.sql("update show_bookings set guest_name='Automated';")
  self.assertEqual(s.sql('select changed_by_name from show_booking_history order by changed_at desc limit 1;').stdout.strip(),'System / integration')
 def test_history_cannot_be_forged_and_creator_cannot_change(self):
  q=f"insert into show_booking_history(business_id,booking_id,changes) values ('{s.BIZ}','{self.b}','{{}}');"
  self.assertNotEqual(s.sql(q,'office',check=False).returncode,0)
  self.assertNotEqual(s.sql("update show_bookings set created_at='2020-01-01';",'office',check=False).returncode,0)
 def test_audit_failure_rolls_back_the_edit(self):
  s.sql('alter table show_booking_history add constraint reject_audit check(false) not valid;')
  self.assertNotEqual(s.sql("update show_bookings set guest_name='Must rollback';",'office',check=False).returncode,0)
  self.assertEqual(s.sql('select guest_name from show_bookings;').stdout.strip(),'Test')
 def test_payment_lifecycle_logged(self):
  p=s.sql(f"insert into show_booking_payments(business_id,booking_id,amount,method) values ('{s.BIZ}','{self.b}',10,'cash') returning id;",'office').stdout.strip().splitlines()[-1]
  s.sql(f"update show_booking_payments set amount=12 where id='{p}';",'office');s.sql(f"delete from show_booking_payments where id='{p}';",'office')
  self.assertEqual(s.sql("select count(*) from show_booking_history where changes ? 'payment';").stdout.strip(),'3')
if __name__=='__main__':unittest.main(verbosity=2)
