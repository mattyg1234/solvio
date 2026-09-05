"""Reproduce the deployed membership RLS loop, then verify its narrow fix.

Uses the existing disposable localhost PostgreSQL fixture (port 55439 by default).
Never connects to production. Run: python3 tests/show-ops/membership-recursion.py
"""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "islands", Path(__file__).with_name("island-permissions.py")
)
islands = importlib.util.module_from_spec(spec)
spec.loader.exec_module(islands)
s = islands.s


class MembershipRecursion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        islands.IslandPermissions().setUp()
        # These are the exact two deployed loop edges. The original fixture
        # created the member policy but did not enable businesses RLS.
        s.sql("""
            alter table businesses enable row level security;
            create policy businesses_select_own on businesses for select
              to authenticated using (owner_id = (select auth.uid()));
            drop policy if exists businesses_select_show_ops_member on businesses;
            create policy businesses_select_show_ops_member on businesses
              for select to authenticated using (exists (
                select 1 from show_ops_members m
                where m.business_id = businesses.id
                  and m.user_id = (select auth.uid())
              ));
            drop policy if exists show_ops_members_write on show_ops_members;
            create policy show_ops_members_write on show_ops_members
              for all to authenticated using (exists (
                select 1 from businesses b
                where b.id = show_ops_members.business_id
                  and b.owner_id = (select auth.uid())
              )) with check (exists (
                select 1 from businesses b
                where b.id = show_ops_members.business_id
                  and b.owner_id = (select auth.uid())
              ));
        """)
        cls.before = {
            (role, table): s.sql(f"select count(*) from {table};", role, check=False)
            for role in ["owner", "office", "seller", "admin", "outsider"]
            for table in ["businesses", "show_ops_members"]
        }
        s.sql((s.ROOT / "supabase/migrations/20260905210500_show_ops_membership_policy_recursion.sql").read_text())

    def count(self, query, role):
        return int(s.sql(query, role).stdout.strip().splitlines()[-1])

    def test_live_policy_loop_reproduced_before_fix(self):
        for key, result in self.before.items():
            with self.subTest(role=key[0], table=key[1]):
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("infinite recursion detected in policy", result.stderr)

    def test_roles_keep_workspace_discovery_and_member_isolation(self):
        # Outsider owns a different business, but never sees this workspace.
        for role in ["owner", "office", "seller", "admin", "outsider"]:
            with self.subTest(role=role):
                expected = 0 if role == "outsider" else 1
                self.assertEqual(self.count(
                    f"select count(*) from businesses where id='{s.BIZ}';", role
                ), expected)
                self.assertEqual(self.count("select count(*) from businesses;", role), 1)
                expected_members = 7 if role == "owner" else (0 if role == "outsider" else 1)
                self.assertEqual(self.count("select count(*) from show_ops_members;", role), expected_members)

    def test_partner_admin_and_global_admin_preserve_existing_scopes(self):
        try:
            s.sql(f"update show_ops_members set partner_admin=true where user_id='{s.USERS['seller']}';")
            s.sql(f"update show_ops_members set allowed_islands=array['Tenerife'] where user_id='{s.USERS['teammate']}';")
            self.assertEqual(self.count("select count(*) from show_ops_members;", "seller"), 2)
            s.sql(f"update show_ops_members set allowed_islands=null where user_id='{s.USERS['admin']}';")
            self.assertEqual(self.count("select count(*) from show_ops_members;", "admin"), 7)
        finally:
            s.sql(f"update show_ops_members set partner_admin=false where user_id='{s.USERS['seller']}';")
            s.sql(f"update show_ops_members set allowed_islands=null where user_id='{s.USERS['teammate']}';")
            s.sql(f"update show_ops_members set allowed_islands=array['Tenerife'] where user_id='{s.USERS['admin']}';")

    def test_owner_helper_does_not_grant_staff_owner_privileges(self):
        for role in ["owner", "office", "seller", "admin", "outsider"]:
            with self.subTest(role=role):
                self.assertEqual(self.count(
                    f"select private.show_ops_is_business_owner('{s.BIZ}')::int;", role
                ), int(role == "owner"))
        self.assertEqual(self.count(
            "with changed as (update show_ops_members set allowed_islands=null returning id) select count(*) from changed;",
            "office",
        ), 0)

    def test_prepared_query_does_not_cache_another_callers_memberships(self):
        result = s.sql(f"""
            set role authenticated;
            prepare workspace_count as select count(*) from businesses where id='{s.BIZ}';
            set request.jwt.claim.sub = '{s.USERS['seller']}';
            execute workspace_count;
            set request.jwt.claim.sub = '{s.USERS['outsider']}';
            execute workspace_count;
            set request.jwt.claim.sub = '{s.USERS['owner']}';
            execute workspace_count;
        """)
        self.assertEqual(result.stdout.strip().splitlines(), ["1", "0", "1"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
