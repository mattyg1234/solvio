-- Per-staff page permissions for Show Ops.
--
-- Roles are a linear rank (seller < booker < office < finance < admin < owner),
-- which cannot express "this person only ever sees the check-in list". allowed_pages
-- is an explicit allow-list that overrides the role default when set. NULL means
-- "use the role default", so existing members are unaffected.

alter table public.show_ops_members
  add column if not exists allowed_pages text[] default null;

comment on column public.show_ops_members.allowed_pages is
  'Explicit allow-list of Show Ops page keys. NULL = fall back to the role default. Example: {lists} for venue check-in staff.';

-- Who created the login, so an owner can see where a staff account came from.
alter table public.show_ops_members
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.show_ops_members
  add column if not exists display_name text;
