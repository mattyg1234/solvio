/**
 * Customer inbox RLS regression tests. Run: node --test src/lib/show-ops/inbox/inbox-rls.pg.test.mjs
 * Needs local initdb/pg_ctl/psql. Creates its own disposable cluster with TCP disabled.
 * Never reads application env files or accepts a database URL.
 * Fixture: minimal businesses/members/bookings/integrations tables with the real
 * staff helper, the real chat migration, then the real inbox migration verbatim.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const migrationsDir = join(root, 'supabase/migrations');
const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C' };
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;

function fn(file, name) {
  const src = readFileSync(join(migrationsDir, file), 'utf8');
  const matches = [...src.matchAll(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'gi'))];
  assert.ok(matches.length, `real function definition: ${name}`);
  return matches.at(-1)[0];
}

const biz = '00000000-0000-0000-0000-00000000000b';
const otherBiz = '00000000-0000-0000-0000-00000000000c';
const owner = '00000000-0000-0000-0000-0000000000a1';
const admin = '00000000-0000-0000-0000-0000000000a2';
const office = '00000000-0000-0000-0000-0000000000a3';
const flagged = '00000000-0000-0000-0000-0000000000a4';
const seller = '00000000-0000-0000-0000-0000000000a5';
const outsider = '00000000-0000-0000-0000-0000000000a6';
const booking = '00000000-0000-0000-0000-0000000000f1';
const cFree = '00000000-0000-0000-0000-0000000000c1';
const cOffice = '00000000-0000-0000-0000-0000000000c2';
const cAdmin = '00000000-0000-0000-0000-0000000000c3';
const cOther = '00000000-0000-0000-0000-0000000000c4';
const handoff = '00000000-0000-0000-0000-0000000000e1';

test('show ops customer inbox RLS on isolated PostgreSQL', { timeout: 90000 }, async (t) => {
  for (const binary of ['initdb', 'pg_ctl', 'psql']) {
    const result = spawnSync(binary, ['--version'], { env, encoding: 'utf8' });
    if (result.status !== 0) {
      t.skip(`${binary} not installed`);
      return;
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'solvio-inbox-'));
  const socket = `${dir}/socket`;
  mkdirSync(socket);
  const port = '55448';
  let started = false;
  const args = ['-X', '-h', socket, '-p', port, '-U', 'inbox_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
  const run = (statement) => spawnSync('psql', args, { env, input: statement, encoding: 'utf8', timeout: 12000 });
  function sql(statement) {
    const result = run(statement);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }
  const as = (user, statement) => `set role authenticated; set request.jwt.claim.sub=${quote(user)}; ${statement}`;
  const ok = (user, statement) => sql(as(user, statement));
  function denied(user, statement, pattern = /row-level security|permission denied|violates/) {
    const result = run(as(user, statement));
    assert.notEqual(result.status, 0, `expected denial for ${user}: ${statement}`);
    assert.match(result.stderr, pattern);
  }
  const visible = (user) => ok(user, 'select id from public.show_ops_inbox_conversations order by id;');

  try {
    const init = spawnSync('initdb', ['-D', `${dir}/data`, '-U', 'inbox_owner', '--auth=trust', '--no-locale', '--encoding=UTF8'], { env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const start = spawnSync('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c timezone=UTC -c statement_timeout=8000`, '-w', 'start'], { env, encoding: 'utf8' });
    assert.equal(start.status, 0, start.stderr);
    started = true;

    sql(`create role anon; create role authenticated;
      create schema auth; create schema private;
      grant usage on schema auth, private, public to authenticated, anon;
      alter default privileges in schema public grant all on tables to authenticated, anon;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.businesses(id uuid primary key, owner_id uuid not null, name text not null default 'Biz', show_ops_enabled boolean not null default true);
      create table public.profiles(id uuid primary key, email text not null default '', full_name text not null default '');
      create table public.show_ops_members(
        id uuid primary key default gen_random_uuid(), business_id uuid not null, user_id uuid not null,
        role text not null check (role in ('booker','office','finance','admin','seller')),
        display_name text, allowed_pages text[], allowed_islands text[], supplier_id uuid,
        unique (business_id, user_id));
      create table public.show_bookings(
        id uuid primary key, business_id uuid not null, booking_ref text not null, island text not null default 'Tenerife',
        guest_name text not null default 'Guest', show_date date not null default '2026-10-01');
      create table public.show_ops_integrations(
        id uuid primary key default gen_random_uuid(), business_id uuid not null,
        provider text not null check (provider in ('holded')), secret_ciphertext text not null,
        status text not null default 'connected', meta jsonb not null default '{}'::jsonb, unique (business_id, provider));
      ${fn('20260905211000_show_ops_booking_policy_performance.sql', 'private.show_ops_current_staff_businesses')}
      alter table public.show_bookings enable row level security;
      create policy show_bookings_sel on public.show_bookings for select to authenticated
        using (business_id = any((select private.show_ops_current_staff_businesses())::uuid[]));
      insert into auth.users values (${[owner, admin, office, flagged, seller, outsider].map(quote).join('),(')});
      insert into public.businesses(id, owner_id) values (${quote(biz)}, ${quote(owner)}), (${quote(otherBiz)}, ${quote(outsider)});
      insert into public.show_ops_members(business_id, user_id, role) values
        (${quote(biz)}, ${quote(admin)}, 'admin'),
        (${quote(biz)}, ${quote(office)}, 'office'),
        (${quote(biz)}, ${quote(flagged)}, 'booker'),
        (${quote(biz)}, ${quote(seller)}, 'seller');
      insert into public.show_bookings(id, business_id, booking_ref) values (${quote(booking)}, ${quote(biz)}, 'TF-1');`);

    sql(readFileSync(join(migrationsDir, '20260930020000_show_ops_chat.sql'), 'utf8'));
    sql(readFileSync(join(migrationsDir, '20261014120000_show_ops_inbox.sql'), 'utf8'));
    // The migration is safe to run twice.
    sql(readFileSync(join(migrationsDir, '20261014120000_show_ops_inbox.sql'), 'utf8'));

    // Server-side writes (service role in production; the cluster owner here).
    sql(`update public.show_ops_members set inbox_all = true where user_id = ${quote(flagged)};
      update public.show_ops_members set inbox_all = true where user_id = ${quote(seller)};
      insert into public.show_ops_inbox_conversations(id,business_id,channel,customer_phone,customer_name,assigned_to) values
        (${quote(cFree)},${quote(biz)},'whatsapp','+34612345678','Ana',null),
        (${quote(cOffice)},${quote(biz)},'sms','+447700900123','Ben',${quote(office)}),
        (${quote(cAdmin)},${quote(biz)},'whatsapp','+34699999999','Cris',${quote(admin)}),
        (${quote(cOther)},${quote(otherBiz)},'whatsapp','+34611111111','Dee',null);
      insert into public.show_ops_inbox_messages(conversation_id,business_id,direction,body,source,status) values
        (${quote(cFree)},${quote(biz)},'in','Hola','webhook','received'),
        (${quote(cOffice)},${quote(biz)},'in','Bus?','webhook','received'),
        (${quote(cOffice)},${quote(biz)},'in','Hello?','webhook','received'),
        (${quote(cAdmin)},${quote(biz)},'in','Table?','webhook','received'),
        (${quote(cOther)},${quote(otherBiz)},'in','Other','webhook','received');`);

    await t.test('twilio is now an allowed integration provider', () => {
      sql(`insert into public.show_ops_integrations(business_id,provider,secret_ciphertext) values (${quote(biz)},'twilio','x');`);
      assert.throws(() => sql(`insert into public.show_ops_integrations(business_id,provider,secret_ciphertext) values (${quote(otherBiz)},'other','x');`));
    });

    await t.test('owner, Superadmin and ticked staff see the whole inbox of their business only', () => {
      const all = [cFree, cOffice, cAdmin].sort().join('\n');
      assert.equal(visible(owner), all);
      assert.equal(visible(admin), all);
      assert.equal(visible(flagged), all);
      assert.equal(visible(outsider), cOther);
    });

    await t.test('unticked staff see only their own chats; sellers see nothing even when flagged', () => {
      assert.equal(visible(office), cOffice);
      assert.equal(ok(office, 'select count(*) from public.show_ops_inbox_messages;'), '2');
      assert.equal(visible(seller), '');
      assert.equal(ok(seller, 'select count(*) from public.show_ops_inbox_messages;'), '0');
    });

    await t.test('a chat sent to someone is readable until they answer', () => {
      sql(`insert into public.show_ops_inbox_handoffs(id,conversation_id,business_id,from_user,to_user,note) values
        (${quote(handoff)},${quote(cAdmin)},${quote(biz)},${quote(admin)},${quote(office)},'Can you check?');`);
      assert.equal(visible(office), [cOffice, cAdmin].sort().join('\n'));
      assert.equal(ok(office, `select count(*) from public.show_ops_inbox_messages where conversation_id=${quote(cAdmin)};`), '1');
      const row = ok(office, `select id, unread, pending_handoff_id, pending_handoff_note from public.show_ops_inbox_list(${quote(biz)}) where id=${quote(cAdmin)};`);
      assert.equal(row, `${cAdmin}|1|${handoff}|Can you check?`);
      sql(`update public.show_ops_inbox_handoffs set status='declined' where id=${quote(handoff)};`);
      assert.equal(visible(office), cOffice);
    });

    await t.test('the list RPC counts unread guest messages per person', () => {
      assert.equal(ok(office, `select id || '|' || unread from public.show_ops_inbox_list(${quote(biz)});`), `${cOffice}|2`);
      sql(`insert into public.show_ops_inbox_reads(conversation_id,business_id,user_id,last_read_at) values (${quote(cOffice)},${quote(biz)},${quote(office)},now());`);
      assert.equal(ok(office, `select unread from public.show_ops_inbox_list(${quote(biz)});`), '0');
      // Someone else's read marker does not change theirs.
      assert.equal(ok(owner, `select unread from public.show_ops_inbox_list(${quote(biz)}) where id=${quote(cOffice)};`), '2');
      assert.equal(ok(seller, `select count(*) from public.show_ops_inbox_list(${quote(biz)});`), '0');
      assert.equal(ok(office, 'select count(*) from public.show_ops_inbox_reads;'), '1');
      assert.equal(ok(owner, 'select count(*) from public.show_ops_inbox_reads;'), '0');
    });

    await t.test('the browser can never write inbox tables', () => {
      denied(owner, `insert into public.show_ops_inbox_conversations(business_id,channel,customer_phone) values (${quote(biz)},'sms','+34600000000');`, /permission denied/);
      denied(owner, `update public.show_ops_inbox_conversations set assigned_to=${quote(owner)};`, /permission denied/);
      denied(office, `insert into public.show_ops_inbox_messages(conversation_id,business_id,direction,body) values (${quote(cOffice)},${quote(biz)},'out','x');`, /permission denied/);
      denied(office, `update public.show_ops_inbox_handoffs set status='accepted';`, /permission denied/);
      denied(office, `insert into public.show_ops_inbox_reads(conversation_id,business_id,user_id) values (${quote(cOffice)},${quote(biz)},${quote(office)});`, /permission denied/);
      denied(owner, `delete from public.show_ops_inbox_messages;`, /permission denied/);
      assert.equal(run(`set role anon; select count(*) from public.show_ops_inbox_conversations;`).status === 0, false);
    });

    await t.test('data checks: phone format, one chat per number and channel', () => {
      assert.throws(() => sql(`insert into public.show_ops_inbox_conversations(business_id,channel,customer_phone) values (${quote(biz)},'sms','612345678');`));
      assert.throws(() => sql(`insert into public.show_ops_inbox_conversations(business_id,channel,customer_phone) values (${quote(biz)},'whatsapp','+34612345678');`));
      sql(`insert into public.show_ops_inbox_conversations(business_id,channel,customer_phone) values (${quote(biz)},'sms','+34612345678');`);
      sql(`insert into public.show_ops_inbox_messages(conversation_id,business_id,direction,provider_sid) values (${quote(cFree)},${quote(biz)},'out','SMx');`);
      assert.throws(() => sql(`insert into public.show_ops_inbox_messages(conversation_id,business_id,direction,provider_sid) values (${quote(cFree)},${quote(biz)},'out','SMx');`));
      // A message cannot point at another business's conversation.
      assert.throws(() => sql(`insert into public.show_ops_inbox_messages(conversation_id,business_id,direction) values (${quote(cOther)},${quote(biz)},'in');`));
    });

    let team;
    await t.test('team chat can carry an inbox card for a chat of the same business', () => {
      team = ok(owner, `select channel_id from public.show_ops_chat_sync(${quote(biz)});`);
      const card = (id) => `jsonb_build_object('kind','inbox','conversation_id',${quote(id)},'label','WhatsApp · Ana')`;
      ok(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,text,attachment) values (${quote(team)},${quote(biz)},'take this',${card(cFree)});`);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${card(cOther)});`);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},jsonb_build_object('kind','inbox','conversation_id',${quote(cFree)},'label',''));`, /violates/);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},'{"kind":"other"}');`, /violates/);
      // Booking cards still work after the policy was replaced.
      ok(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},jsonb_build_object('kind','booking','booking_id',${quote(booking)},'ref','TF-1'));`);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},jsonb_build_object('kind','booking','booking_id',${quote(booking)},'ref','FAKE'));`);
    });

    await t.test('a removed staff member loses the inbox', () => {
      sql(`delete from public.show_ops_members where user_id=${quote(office)}`);
      assert.equal(visible(office), '');
      sql(`update public.show_ops_members set inbox_all=false where user_id=${quote(flagged)}`);
      assert.equal(visible(flagged), '');
    });
  } finally {
    if (started) spawnSync('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', 'stop'], { env, encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
  }
});
