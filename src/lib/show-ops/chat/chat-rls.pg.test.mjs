/**
 * Team chat RLS regression tests. Run: node --test src/lib/show-ops/chat/chat-rls.pg.test.mjs
 * Needs local initdb/pg_ctl/psql. Creates its own disposable cluster with TCP disabled.
 * Never reads application env files or accepts a database URL.
 * Fixture: minimal businesses/members/bookings tables with the real staff and
 * island helper functions, then the real chat migration applied verbatim.
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
const booker = '00000000-0000-0000-0000-0000000000a2';
const office = '00000000-0000-0000-0000-0000000000a3';
const seller = '00000000-0000-0000-0000-0000000000a4';
const outsider = '00000000-0000-0000-0000-0000000000a5';
const bookingTf = '00000000-0000-0000-0000-0000000000f1';
const bookingLz = '00000000-0000-0000-0000-0000000000f2';
const bookingOther = '00000000-0000-0000-0000-0000000000f3';

test('show ops chat RLS on isolated PostgreSQL', { timeout: 90000 }, async (t) => {
  for (const binary of ['initdb', 'pg_ctl', 'psql']) {
    const result = spawnSync(binary, ['--version'], { env, encoding: 'utf8' });
    if (result.status !== 0) {
      t.skip(`${binary} not installed`);
      return;
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'solvio-chat-'));
  const socket = `${dir}/socket`;
  mkdirSync(socket);
  const port = '55447';
  let started = false;
  const args = ['-X', '-h', socket, '-p', port, '-U', 'chat_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
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

  try {
    const init = spawnSync('initdb', ['-D', `${dir}/data`, '-U', 'chat_owner', '--auth=trust', '--no-locale', '--encoding=UTF8'], { env, encoding: 'utf8' });
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
        id uuid primary key, business_id uuid not null, booking_ref text not null, island text not null,
        guest_name text not null default 'Guest', show_date date not null default '2026-10-01');
      ${fn('20260905211000_show_ops_booking_policy_performance.sql', 'private.show_ops_current_staff_businesses')}
      ${fn('20260905211000_show_ops_booking_policy_performance.sql', 'private.show_ops_current_island_scopes')}
      alter table public.show_bookings enable row level security;
      create policy show_bookings_sel on public.show_bookings for select to authenticated
        using (business_id = any((select private.show_ops_current_staff_businesses())::uuid[]));
      create policy show_bookings_island_scope on public.show_bookings as restrictive for all to authenticated using(
        coalesce(((select private.show_ops_current_island_scopes())->business_id::text)='null'::jsonb
        or ((select private.show_ops_current_island_scopes())->business_id::text) ? island,false));
      insert into auth.users values (${[owner, booker, office, seller, outsider].map(quote).join('),(')});
      insert into public.businesses(id, owner_id) values (${quote(biz)}, ${quote(owner)}), (${quote(otherBiz)}, ${quote(outsider)});
      insert into public.profiles(id, email, full_name) values
        (${quote(owner)}, 'joel@example.test', 'Joel Owner'), (${quote(booker)}, 'bea@example.test', ''),
        (${quote(office)}, 'olga@example.test', 'Olga Office');
      insert into public.show_ops_members(business_id, user_id, role, display_name, allowed_islands) values
        (${quote(biz)}, ${quote(booker)}, 'booker', 'Bea Door', array['Lanzarote']),
        (${quote(biz)}, ${quote(office)}, 'office', null, null),
        (${quote(biz)}, ${quote(seller)}, 'seller', 'Partner', null);
      insert into public.show_bookings(id, business_id, booking_ref, island) values
        (${quote(bookingTf)}, ${quote(biz)}, 'TF-1', 'Tenerife'),
        (${quote(bookingLz)}, ${quote(biz)}, 'LZ-1', 'Lanzarote'),
        (${quote(bookingOther)}, ${quote(otherBiz)}, 'XX-1', 'Tenerife');`);

    sql(readFileSync(join(migrationsDir, '20260930020000_show_ops_chat.sql'), 'utf8'));
    const sync = (user) => ok(user, `select channel_id, unread, unread_mentions from public.show_ops_chat_sync(${quote(biz)}) order by 1;`);

    await t.test('people: staff only, names resolved, sellers and outsiders get nothing', () => {
      const rows = ok(booker, `select name || '|' || role from public.show_ops_chat_people(${quote(biz)}) order by 1;`).split('\n');
      assert.deepEqual(rows, ['Bea Door|booker', 'Joel Owner|owner', 'Olga Office|office']);
      assert.equal(ok(seller, `select count(*) from public.show_ops_chat_people(${quote(biz)});`), '0');
      assert.equal(ok(outsider, `select count(*) from public.show_ops_chat_people(${quote(biz)});`), '0');
    });

    let team;
    await t.test('sync creates one Team channel and joins each staff member', () => {
      const first = sync(owner);
      team = first.split('|')[0];
      assert.match(team, /^[0-9a-f-]{36}$/);
      sync(booker);
      sync(office);
      assert.equal(sql(`select count(*) from public.show_ops_chat_channels where kind='team'`), '1');
      assert.equal(sql(`select count(*) from public.show_ops_chat_members where channel_id=${quote(team)}`), '3');
      assert.equal(sync(seller), '');
      assert.equal(sync(outsider), '');
    });

    await t.test('team messages, mentions and unread counts', () => {
      ok(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,author_id,text,mentions)
        values (${quote(team)},${quote(biz)},${quote(owner)},'@Bea Door check this',array[${quote(booker)}]::uuid[]);`);
      assert.equal(sync(booker), `${team}|1|1`);
      assert.equal(sync(office), `${team}|1|0`);
      assert.equal(sync(owner), `${team}|0|0`, 'own messages are never unread');
      ok(booker, `update public.show_ops_chat_members set last_read_at=now() where channel_id=${quote(team)} and user_id=${quote(booker)};`);
      assert.equal(sync(booker), `${team}|0|0`);
    });

    await t.test('author and time are stamped by the database', () => {
      ok(office, `insert into public.show_ops_chat_messages(channel_id,business_id,author_id,text,created_at)
        values (${quote(team)},${quote(biz)},${quote(owner)},'spoof','2020-01-01');`);
      assert.equal(sql(`select author_id::text || '|' || (created_at > now() - interval '1 minute') from public.show_ops_chat_messages where text='spoof'`), `${office}|true`);
    });

    await t.test('mentions must be people who can read the chat', () => {
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,text,mentions)
        values (${quote(team)},${quote(biz)},'hi',array[${quote(seller)}]::uuid[]);`);
    });

    await t.test('sellers and other businesses cannot read or post', () => {
      assert.equal(ok(seller, 'select count(*) from public.show_ops_chat_messages;'), '0');
      assert.equal(ok(seller, 'select count(*) from public.show_ops_chat_channels;'), '0');
      assert.equal(ok(outsider, 'select count(*) from public.show_ops_chat_messages;'), '0');
      denied(seller, `insert into public.show_ops_chat_messages(channel_id,business_id,text) values (${quote(team)},${quote(biz)},'hi');`);
      denied(seller, `insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(team)},${quote(biz)},${quote(seller)});`);
      denied(outsider, `insert into public.show_ops_chat_messages(channel_id,business_id,text) values (${quote(team)},${quote(biz)},'hi');`);
      denied(seller, `insert into public.show_ops_chat_channels(business_id,kind,name,created_by) values (${quote(biz)},'group','x',${quote(seller)});`);
    });

    const direct = '00000000-0000-0000-0000-0000000000d1';
    await t.test('direct chats: only the two people', () => {
      const key = [owner, booker].sort().join(':');
      denied(office, `insert into public.show_ops_chat_channels(id,business_id,kind,name,direct_key,created_by)
        values (gen_random_uuid(),${quote(biz)},'direct','',${quote(key)},${quote(office)});`);
      ok(owner, `insert into public.show_ops_chat_channels(id,business_id,kind,name,direct_key,created_by)
        values (${quote(direct)},${quote(biz)},'direct','',${quote(key)},${quote(owner)});
        insert into public.show_ops_chat_members(channel_id,business_id,user_id)
        values (${quote(direct)},${quote(biz)},${quote(owner)}),(${quote(direct)},${quote(biz)},${quote(booker)});`);
      denied(owner, `insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(direct)},${quote(biz)},${quote(office)});`);
      denied(office, `insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(direct)},${quote(biz)},${quote(office)});`);
      ok(booker, `insert into public.show_ops_chat_messages(channel_id,business_id,text) values (${quote(direct)},${quote(biz)},'private');`);
      assert.equal(ok(office, `select count(*) from public.show_ops_chat_messages where channel_id=${quote(direct)};`), '0');
      denied(office, `insert into public.show_ops_chat_messages(channel_id,business_id,text) values (${quote(direct)},${quote(biz)},'nosy');`);
      assert.equal(ok(owner, `select count(*) from public.show_ops_chat_messages where channel_id=${quote(direct)};`), '1');
      denied(owner, `insert into public.show_ops_chat_channels(business_id,kind,name,direct_key,created_by)
        values (${quote(biz)},'direct','',${quote(key)},${quote(owner)});`, /duplicate key/);
    });

    await t.test('groups: creator adds staff only; non-members see nothing', () => {
      const group = '00000000-0000-0000-0000-0000000000e1';
      ok(owner, `insert into public.show_ops_chat_channels(id,business_id,kind,name,created_by) values (${quote(group)},${quote(biz)},'group','Pick-ups',${quote(owner)});
        insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(group)},${quote(biz)},${quote(owner)}),(${quote(group)},${quote(biz)},${quote(office)});`);
      denied(owner, `insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(group)},${quote(biz)},${quote(seller)});`);
      denied(office, `insert into public.show_ops_chat_members(channel_id,business_id,user_id) values (${quote(group)},${quote(biz)},${quote(booker)});`);
      assert.equal(ok(booker, `select count(*) from public.show_ops_chat_channels where id=${quote(group)};`), '0');
      assert.match(sync(office), new RegExp(group));
      assert.doesNotMatch(sync(booker), new RegExp(group));
    });

    await t.test('booking attachments: same business, real ref, visible to the sender (islands)', () => {
      const att = (id, ref) => `jsonb_build_object('kind','booking','booking_id',${quote(id)},'ref',${quote(ref)})`;
      ok(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${att(bookingTf, 'TF-1')});`);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${att(bookingTf, 'FAKE')});`);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${att(bookingOther, 'XX-1')});`);
      // Bea only has Lanzarote: she cannot attach a Tenerife booking, and cannot read it back.
      denied(booker, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${att(bookingTf, 'TF-1')});`);
      ok(booker, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},${att(bookingLz, 'LZ-1')});`);
      assert.equal(ok(booker, `select count(*) from public.show_bookings where id=${quote(bookingTf)};`), '0');
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,attachment) values (${quote(team)},${quote(biz)},'{"kind":"booking","booking_id":"x","ref":"TF-1"}');`, /violates/);
      denied(owner, `insert into public.show_ops_chat_messages(channel_id,business_id,text) values (${quote(team)},${quote(biz)},'   ');`, /violates check constraint/);
    });

    await t.test('messages are immutable; read markers are personal', () => {
      denied(owner, `update public.show_ops_chat_messages set text='edited';`, /permission denied/);
      denied(owner, `delete from public.show_ops_chat_messages;`, /permission denied/);
      denied(owner, `update public.show_ops_chat_members set user_id=${quote(office)} where user_id=${quote(owner)};`, /permission denied/);
      const before = sql(`select last_read_at from public.show_ops_chat_members where channel_id=${quote(team)} and user_id=${quote(office)}`);
      ok(owner, `update public.show_ops_chat_members set last_read_at=now() + interval '1 day' where user_id=${quote(office)};`);
      assert.equal(sql(`select last_read_at from public.show_ops_chat_members where channel_id=${quote(team)} and user_id=${quote(office)}`), before);
    });

    await t.test('a removed staff member loses access to chats they were in', () => {
      sql(`delete from public.show_ops_members where user_id=${quote(office)}`);
      assert.equal(ok(office, 'select count(*) from public.show_ops_chat_messages;'), '0');
      assert.equal(sync(office), '');
    });
  } finally {
    if (started) spawnSync('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', 'stop'], { env, encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
  }
});
