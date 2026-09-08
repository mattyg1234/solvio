"""Holded invoice lifecycle regressions on disposable PostgreSQL 17.

Run: python3 tests/show-ops/holded-lifecycle.py
Starts a private local cluster and never connects to Supabase or Holded.
"""
import importlib.util
from pathlib import Path
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
        staff.StaffPermissions.setUp(self)
        self.migration('20260813120000_show_ops_money_cancel.sql')
        self.migration('20260815120000_show_ops_invoice_editor.sql')
        s.sql("do $$ begin create role anon; exception when duplicate_object then null; end $$;")
        self.migration(MIGRATION)
        s.sql(f"update show_invoices set status='issued', total_amount=100, net_total=90, vat_total=10 where id='{self.invoice}';")

    def claim_invoice(self, token, role='finance', business=None, invoice=None):
        return s.sql(
            f"select claim_status, external_id, claim_token from private.show_ops_claim_holded_invoice("
            f"'{business or s.BIZ}','{invoice or self.invoice}','{token}');", role)

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
        self.assertIn(f'recovered||{recovered}', result.stdout)
        state = s.sql(f"select holded_claim_token,holded_reconciliation_status from show_invoices where id='{self.invoice}';").stdout
        self.assertIn(f'{recovered}|required', state)
        self.assertEqual(s.sql("select count(*) from show_invoice_external_events where action='invoice_claim' and outcome in ('claimed','recovered');").stdout.strip(), '2')

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


if __name__ == '__main__':
    unittest.main(verbosity=2)
