/**
 * B02 database regression tests. Run: node --test src/lib/show-ops/partner-link-capacity.pg.test.mjs
 * Needs local initdb/pg_ctl/psql. Creates its own disposable cluster with TCP disabled.
 * Never reads application env files or accepts a database URL.
 * B02_BASELINE=1 demonstrates the original service-insert capacity bypass (expected failure).
 * Focused fixture: real table definitions and seller/island triggers, not the full Supabase stack.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const migration = '20260908221151_show_ops_partner_link_capacity.sql';
const baseline = process.env.B02_BASELINE === '1';
const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C' };
const cache = new Map();
function source(name) {
  if (!cache.has(name)) cache.set(name, readFileSync(`${root}/supabase/migrations/${name}`, 'utf8'));
  return cache.get(name);
}
function table(name, file = '20260811120000_show_ops.sql') {
  const match = source(file).match(new RegExp(`create table (?:if not exists )?public\\.${name} \\([\\s\\S]*?\\n\\);`, 'i'));
  assert.ok(match, `real table definition: ${name}`);
  return match[0];
}
function fn(name, file) {
  const matches = [...source(file).matchAll(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'gi'))];
  assert.ok(matches.length, `real function definition: ${name}`);
  return matches.at(-1)[0];
}
const biz = '00000000-0000-0000-0000-000000000001';
const otherBiz = '00000000-0000-0000-0000-000000000002';
const supplier = '00000000-0000-0000-0000-000000000011';
const otherSupplier = '00000000-0000-0000-0000-000000000012';
const product = '00000000-0000-0000-0000-000000000021';
const otherProduct = '00000000-0000-0000-0000-000000000022';
const stop = '00000000-0000-0000-0000-000000000031';
const hotel = '00000000-0000-0000-0000-000000000041';
const ticket = '00000000-0000-0000-0000-000000000051';
const extra = '00000000-0000-0000-0000-000000000061';
const seller = '00000000-0000-0000-0000-000000000071';
const staff = '00000000-0000-0000-0000-000000000072';
const token = 'synthetic_partner_token_0001';
const otherToken = 'synthetic_partner_token_0002';
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
let seq = 0;

test('B02 partner-link transaction on isolated PostgreSQL', { timeout: 90000 }, async (t) => {
  for (const binary of ['initdb', 'pg_ctl', 'psql']) {
    const result = spawnSync(binary, ['--version'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, `${binary} required; no remote fallback`);
  }
  const dir = mkdtempSync('/tmp/solvio-b02-');
  const socket = `${dir}/socket`;
  mkdirSync(socket);
  let started = false;
  const args = ['-X', '-h', socket, '-p', '55439', '-U', 'b02_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
  const run = (sql) => spawnSync('psql', args, { env, input: sql, encoding: 'utf8', timeout: 12000 });
  function sql(statement) {
    const result = run(statement);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }
  function asyncSql(statement) {
    const child = spawn('psql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
    if (statement) child.stdin.end(statement);
    return { child, done };
  }
  async function waitForBlocked(name) {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      if (sql(`select count(*) from pg_stat_activity where application_name=${quote(name)} and wait_event_type='Lock'`) === '1') return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`${name} did not block on the shared transaction lock`);
  }
  function fields(overrides = {}) {
    return {
      id: randomUUID(), business_id: biz, booking_ref: `B02-${++seq}`, supplier_id: supplier,
      product_id: product, island: 'Lanzarote', show_date: tomorrow, guest_name: 'Synthetic guest',
      adults: 1, children: 0, infants: 0, transport_required: false, pickup_kind: 'own_way',
      hotel_id: null, pickup_stop_id: null, ticket_type_id: null,
      total_cost: 50, deposit_amount: 15, balance_remaining: 50, nett_total: 40,
      adult_nett_total: 40, child_nett_total: 0, infant_nett_total: 0,
      billing_mode: 'deposit', payment_status: 'unpaid', dietary_required: false,
      extras_snapshot: [], pricing_snapshot: { test: true }, custom_answers: {},
      ...overrides,
    };
  }
  function direct(data) {
    const row = { ...data, show_name: 'Fixture show', supplier_name: 'Fixture partner', sales_channel: 'agency' };
    return `insert into public.show_bookings (${Object.keys(row).join(',')}) values (${Object.values(row).map((value) => value === null ? 'null' : typeof value === 'object' ? `${quote(JSON.stringify(value))}::jsonb` : quote(value)).join(',')});`;
  }
  function rpc(data = fields(), linkToken = token) {
    return `select public.show_ops_create_partner_link_booking(${linkToken === null ? 'null' : quote(linkToken)},${quote(JSON.stringify(data))}::jsonb);`;
  }
  const asService = (statement) => `set role service_role; ${statement}`;
  const asSeller = (statement) => `set role authenticated; set request.jwt.claim.sub=${quote(seller)}; ${statement}`;
  const asStaff = (statement) => `set role authenticated; set request.jwt.claim.sub=${quote(staff)}; ${statement}`;
  const save = (data = fields(), linkToken = token) => sql(asService(rpc(data, linkToken)));
  function rejects(data, code, linkToken = token) {
    const before = sql('select count(*) from public.show_bookings');
    const result = run(asService(baseline ? direct(data) : rpc(data, linkToken)));
    assert.notEqual(result.status, 0, `expected ${code}; booking unexpectedly succeeded`);
    assert.match(result.stderr, new RegExp(code));
    assert.equal(sql('select count(*) from public.show_bookings'), before, 'failure must not insert a booking');
  }
  let tomorrow;
  function reset() {
    sql(`truncate public.show_bookings,public.show_night_closes,public.show_bus_orders;
      update public.businesses set show_ops_enabled=true;
      update public.show_suppliers set active=true,island='ALL',booking_token=case when id='${supplier}' then '${token}' else '${otherToken}' end;
      update public.show_products set business_id='${biz}',active=true,capacity=100,transport_available=true,run_weekdays='{0,1,2,3,4,5,6}',island='Lanzarote';
      update public.show_hotels set active=true,island='Lanzarote',business_id='${biz}';
      update public.show_bus_stops set active=true,island='Lanzarote',business_id='${biz}';
      update public.show_ticket_types set active=true,transport_available=true,product_id='${product}';
      update public.show_extras set active=true,product_id='${product}';`);
  }
  try {
    const init = spawnSync('initdb', ['-D', `${dir}/data`, '-U', 'b02_owner', '--auth=trust', '--no-locale', '--encoding=UTF8'], { env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const start = spawnSync('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o', `-k ${socket} -p 55439 -c listen_addresses='' -c timezone=UTC -c statement_timeout=8000`, '-w', 'start'], { env, encoding: 'utf8' });
    assert.equal(start.status, 0, start.stderr);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.businesses(id uuid primary key, owner_id uuid,show_ops_enabled boolean not null default true);
      ${['show_ops_members','show_suppliers','show_products','show_bus_stops','show_hotels','show_bus_orders','show_bookings'].map((name) => table(name)).join('\n')}
      alter table public.show_ops_members drop constraint show_ops_members_role_check;
      alter table public.show_ops_members add column supplier_id uuid,add column allowed_islands text[];
      alter table public.show_suppliers add column island text,add column booking_token text unique;
      -- Existing app-consumed columns absent from the checked-in base migration.
      alter table public.show_products add column run_weekdays integer[];
      alter table public.show_bookings add column cancelled_at timestamptz,add column attendees jsonb;
      ${source('20260811140000_show_ops_custom_answers.sql')}
      ${source('20260905100000_show_ops_payment_method.sql')}
      ${source('20260905100100_show_ops_private_pickup.sql')}
      alter table public.show_bookings add column pricing_snapshot jsonb;
      ${table('show_night_closes', '20260816120000_show_ops_night_closes.sql')}
      ${fn('public.show_ops_can_access', '20260812200000_show_ops_seller_portals.sql')}
      ${fn('public.show_ops_seller_supplier_id', '20260812200000_show_ops_seller_portals.sql')}
      ${fn('private.show_ops_can_manage_catalogue', '20260905155752_show_ops_partner_safety.sql')}
      ${source('20260905181330_show_ops_ticket_types.sql')}
      ${source('20260905182450_show_ops_configurable_extras.sql')}
      ${fn('private.show_ops_guard_partner_capacity', '20260905155752_show_ops_partner_safety.sql')}
      create trigger show_ops_partner_capacity before insert or update on public.show_bookings for each row execute function private.show_ops_guard_partner_capacity();
      ${fn('private.show_ops_island_access', '20260905183006_show_ops_island_permissions.sql')}
      ${fn('private.show_ops_guard_island_references', '20260905183006_show_ops_island_permissions.sql')}
      create trigger show_ops_island_references before insert or update on public.show_bookings for each row execute function private.show_ops_guard_island_references();
      -- Only this fixture helper replaces unrelated staff scope helpers. Bookings use the real trigger.
      create function private.show_ops_supplier_access(uuid,text,boolean) returns boolean language sql as $$ select true $$;
      grant usage on schema public,auth,private to authenticated,service_role;
      grant all on all tables in schema public to authenticated,service_role;
      grant execute on all functions in schema public,private to authenticated,service_role;
      -- Simulate Supabase default grants; the new migration must explicitly revoke these.
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      alter default privileges in schema private grant execute on functions to anon,authenticated,service_role;
      insert into auth.users values ('${seller}'),('${staff}');
      insert into public.businesses values ('${biz}','${staff}',true),('${otherBiz}',null,true);
      insert into public.show_suppliers(id,business_id,name,island,booking_token) values
        ('${supplier}','${biz}','Fixture partner','ALL','${token}'),('${otherSupplier}','${biz}','Other partner','ALL','${otherToken}');
      insert into public.show_ops_members(business_id,user_id,role,supplier_id) values ('${biz}','${seller}','seller','${supplier}');
      insert into public.show_products(id,business_id,name,island) values ('${product}','${biz}','Fixture show','Lanzarote'),('${otherProduct}','${biz}','Other show','Lanzarote');
      insert into public.show_bus_stops(id,business_id,island,resort,stop_name) values ('${stop}','${biz}','Lanzarote','Test resort','Test stop');
      insert into public.show_hotels(id,business_id,island,name,bus_stop_id) values ('${hotel}','${biz}','Lanzarote','Test hotel','${stop}');
      insert into public.show_ticket_types(id,business_id,product_id,name) values ('${ticket}','${biz}','${product}','Test ticket');
      insert into public.show_extras(id,business_id,product_id,name,unit_price) values ('${extra}','${biz}','${product}','Test extra',1);`);
    tomorrow = sql("select (timezone('UTC',now())::date+1)::text");
    if (!baseline) sql(source(migration));

    await t.test('numeric show capacity rejects the second service booking atomically', () => {
      reset(); sql(`update public.show_products set capacity=1 where id='${product}'`);
      if (baseline) sql(asService(direct(fields()))); else save();
      rejects(fields(), 'SHOW_OPS_SHOW_FULL');
    });
    if (baseline) return;

    await t.test('service-only grants on both wrapper and private implementation', () => {
      for (const schema of ['public','private']) {
        for (const role of ['anon','authenticated']) {
          const result = run(`set role ${role}; select ${schema}.show_ops_create_partner_link_booking('${token}','{}');`);
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /permission denied/);
          assert.equal(sql(`select has_function_privilege('${role}','${schema}.show_ops_create_partner_link_booking(text,jsonb)','execute')`), 'f');
        }
        assert.equal(sql(`select has_function_privilege('service_role','${schema}.show_ops_create_partner_link_booking(text,jsonb)','execute')`), 't');
      }
      assert.equal(sql("select prosecdef from pg_proc where oid='public.show_ops_create_partner_link_booking(text,jsonb)'::regprocedure"), 'f');
      assert.equal(sql("select prosecdef from pg_proc where oid='private.show_ops_create_partner_link_booking(text,jsonb)'::regprocedure"), 't');
    });
    for (const badToken of [null, '', 'short', 'wrong_valid_format_token']) {
      await t.test(`reject invalid token ${JSON.stringify(badToken)}`, () => { reset(); rejects(fields(), 'SHOW_OPS_PARTNER_LINK_INVALID', badToken); });
    }
    for (const [name, setup, patch, code] of [
      ['inactive partner', `update public.show_suppliers set active=false`, {}, 'PARTNER_LINK_INVALID'],
      ['rotated token', `update public.show_suppliers set booking_token='new_synthetic_token_123' where id='${supplier}'`, {}, 'PARTNER_LINK_INVALID'],
      ['disabled business', 'update public.businesses set show_ops_enabled=false', {}, 'PARTNER_LINK_INVALID'],
      ['forged supplier', '', { supplier_id: otherSupplier }, 'PARTNER_LINK_INVALID'],
      ['forged business', '', { business_id: otherBiz }, 'PARTNER_LINK_INVALID'],
      ['inactive product', `update public.show_products set active=false`, {}, 'PRODUCT_UNAVAILABLE'],
      ['foreign product', `update public.show_products set business_id='${otherBiz}' where id='${otherProduct}'`, { product_id: otherProduct }, 'PRODUCT_UNAVAILABLE'],
      ['forged island', '', { island: 'Tenerife' }, 'PRODUCT_UNAVAILABLE'],
      ['partner location', `update public.show_suppliers set island='Tenerife, Gran Canaria'`, {}, 'PARTNER_LOCATION_INVALID'],
      ['wrong-island hotel', `update public.show_hotels set island='Tenerife'`, { hotel_id: hotel }, 'REFERENCE_INVALID'],
      ['foreign hotel', `update public.show_hotels set business_id='${otherBiz}'`, { hotel_id: hotel }, 'REFERENCE_INVALID'],
      ['archived hotel', 'update public.show_hotels set active=false', { hotel_id: hotel }, 'REFERENCE_INVALID'],
      ['wrong-island stop', `update public.show_bus_stops set island='Tenerife'`, { pickup_stop_id: stop, transport_required: true, pickup_kind: 'bus' }, 'REFERENCE_INVALID'],
      ['archived stop', 'update public.show_bus_stops set active=false', { pickup_stop_id: stop, transport_required: true, pickup_kind: 'bus' }, 'REFERENCE_INVALID'],
      ['missing bus stop', '', { transport_required: true, pickup_kind: 'bus' }, 'REFERENCE_INVALID'],
      ['transport mismatch', '', { transport_required: false, pickup_kind: 'bus' }, 'REFERENCE_INVALID'],
      ['transport unavailable', 'update public.show_products set transport_available=false', { transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }, 'PRODUCT_UNAVAILABLE'],
      ['wrong-show ticket type', '', { product_id: otherProduct, ticket_type_id: ticket }, 'REFERENCE_INVALID'],
      ['archived ticket type', 'update public.show_ticket_types set active=false', { ticket_type_id: ticket }, 'REFERENCE_INVALID'],
      ['ticket transport unavailable', 'update public.show_ticket_types set transport_available=false', { ticket_type_id: ticket, transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }, 'PRODUCT_UNAVAILABLE'],
      ['wrong-show extra', '', { product_id: otherProduct, extras_snapshot: [{ id: extra, quantity: 1 }] }, 'REFERENCE_INVALID'],
      ['archived extra', 'update public.show_extras set active=false', { extras_snapshot: [{ id: extra, quantity: 1 }] }, 'REFERENCE_INVALID'],
      ['negative guests', '', { adults: -1, children: 2 }, 'PARTNER_BOOKING_INVALID'],
      ['zero guests', '', { adults: 0 }, 'PARTNER_BOOKING_INVALID'],
      ['missing guests', '', { adults: null }, 'PARTNER_BOOKING_INVALID'],
      ['injected cancellation', '', { cancelled_at: '2026-01-01' }, 'PARTNER_BOOKING_INVALID'],
      ['injected invoice', '', { invoice_id: randomUUID() }, 'PARTNER_BOOKING_INVALID'],
    ]) {
      await t.test(name, () => { reset(); if (setup) sql(setup); rejects(fields(patch), `SHOW_OPS_${code}`); });
    }
    await t.test('malformed date fails without insert', () => { reset(); rejects(fields({ show_date: '2026-02-30' }), 'date/time field value out of range'); });
    await t.test('past and out-of-window dates are unavailable', () => {
      reset();
      rejects(fields({ show_date: sql("select (current_date-1)::text") }), 'SHOW_OPS_DATE_UNAVAILABLE');
      rejects(fields({ show_date: sql("select (current_date+interval '13 months')::date::text") }), 'SHOW_OPS_DATE_UNAVAILABLE');
    });
    await t.test('off-schedule date needs an existing active booking of this product', () => {
      reset(); sql(`update public.show_products set run_weekdays='{}'`);
      rejects(fields(), 'SHOW_OPS_DATE_UNAVAILABLE');
      sql(asStaff(direct(fields({ product_id: otherProduct }))));
      rejects(fields(), 'SHOW_OPS_DATE_UNAVAILABLE');
      sql(asStaff(direct(fields({ cancelled_at: new Date().toISOString() }))));
      rejects(fields(), 'SHOW_OPS_DATE_UNAVAILABLE');
      sql(asStaff(direct(fields()))); save();
    });
    for (const scope of [null, product, otherProduct]) {
      await t.test(`full close scope ${scope}`, () => {
        reset();
        sql(`insert into public.show_night_closes(business_id,show_date,island,product_id,close_kind) values ('${biz}','${tomorrow}','Lanzarote',${scope ? quote(scope) : 'null'},'full')`);
        if (scope === otherProduct) save(); else rejects(fields(), 'SHOW_OPS_NIGHT_CLOSED');
      });
    }
    await t.test('part close and null/unconfigured capacities retain existing semantics', () => {
      reset(); sql(`update public.show_products set capacity=null;
        insert into public.show_night_closes(business_id,show_date,island,close_kind) values ('${biz}','${tomorrow}','Lanzarote','part')`);
      save(fields({ adults: 20, transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }));
    });
    await t.test('bus capacity is shared across products and includes infants', () => {
      reset(); sql(`insert into public.show_bus_orders(business_id,show_date,island,seats_ordered) values ('${biz}','${tomorrow}','Lanzarote',2)`);
      save(fields({ product_id: otherProduct, transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }));
      rejects(fields({ infants: 1, transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }), 'SHOW_OPS_BUS_FULL');
      save(fields({ transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }));
      rejects(fields({ transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop }), 'SHOW_OPS_BUS_FULL');
      save();
    });
    await t.test('zero capacity blocks; cancelled bookings release seats; staff keep override', () => {
      reset(); sql(`update public.show_products set capacity=0`); rejects(fields(), 'SHOW_OPS_SHOW_FULL');
      const row = fields(); sql(asStaff(direct(row)));
      sql(`update public.show_products set capacity=1; update public.show_bookings set cancelled_at=now() where id='${row.id}'`);
      save(); sql(asStaff(direct(fields())));
      assert.equal(sql('select count(*) from public.show_bookings where cancelled_at is null'), '2');
    });
    await t.test('server-built financial fields survive; attribution is server-stamped', () => {
      reset();
      const data = fields({ created_by: staff, updated_by: 'partner-link', office_only_comments: 'forged', sales_channel: 'forged', supplier_name: 'forged', show_name: 'forged' });
      assert.equal(save(data), data.id);
      const row = JSON.parse(sql(`select row_to_json(b) from public.show_bookings b where id='${data.id}'`));
      assert.equal(row.total_cost, 50); assert.deepEqual(row.pricing_snapshot, { test: true });
      assert.equal(row.created_by, null); assert.equal(row.updated_by, null);
      assert.equal(row.supplier_name, 'Fixture partner'); assert.equal(row.sales_channel, 'agency');
      assert.equal(row.office_only_comments, 'Booked by Fixture partner via their partner link');
    });
    await t.test('show label snapshots include the selected ticket type', () => {
      reset();
      const typed = fields({ ticket_type_id: ticket, show_name: 'Untrusted label' });
      save(typed);
      assert.equal(sql(`select show_name from public.show_bookings where id='${typed.id}'`), 'Fixture show \u00b7 Test ticket');
      assert.equal(sql(`select ticket_type_name from public.show_bookings where id='${typed.id}'`), 'Test ticket');
      const standard = fields({ show_name: 'Untrusted label' });
      save(standard);
      assert.equal(sql(`select show_name from public.show_bookings where id='${standard.id}'`), 'Fixture show');
    });
    for (const location of [null, '', 'ALL', ' all ', 'Tenerife, Lanzarote', ' , ']) {
      await t.test(`permitted partner locations ${JSON.stringify(location)}`, () => { reset(); sql(`update public.show_suppliers set island=${location === null ? 'null' : quote(location)}`); save(); });
    }
    await t.test('unique-reference failure rolls back without consuming seats', () => {
      reset(); const first = fields(); save(first);
      rejects(fields({ booking_ref: first.booking_ref }), 'duplicate key');
      assert.equal(sql('select count(*) from public.show_bookings'), '1');
    });
    for (const mode of ['link-link', 'seller-link', 'link-seller', 'bus-seller-link', 'move-link', 'cancel-link']) {
      await t.test(`deterministic concurrent ${mode}`, async () => {
        reset();
        const bus = mode.startsWith('bus');
        sql(`update public.show_products set capacity=${bus ? 100 : 1}`);
        if (bus) sql(`insert into public.show_bus_orders(business_id,show_date,island,seats_ordered) values ('${biz}','${tomorrow}','Lanzarote',1)`);
        const patch = bus ? { transport_required: true, pickup_kind: 'bus', pickup_stop_id: stop } : {};
        const first = fields(patch);
        let firstSql;
        if (mode === 'move-link') {
          sql(asStaff(direct({ ...first, show_date: sql("select (current_date+2)::text") })));
          firstSql = asSeller(`update public.show_bookings set show_date='${tomorrow}' where id='${first.id}';`);
        } else if (mode === 'cancel-link') {
          save(first);
          firstSql = asStaff(`update public.show_bookings set cancelled_at=now() where id='${first.id}';`);
        } else firstSql = mode.includes('seller-link') ? asSeller(direct(first)) : asService(rpc(first));
        const holder = asyncSql();
        const ready = new Promise((resolve, reject) => {
          let output = '';
          holder.child.stdout.on('data', (chunk) => { output += chunk; if (output.includes('B02_LOCK_HELD')) resolve(); });
          holder.child.once('close', () => reject(new Error('holder exited before acquiring locks')));
        });
        holder.child.stdin.write(`begin; ${firstSql} select 'B02_LOCK_HELD';\n`);
        await ready;
        const next = fields({ ...patch, ...(bus ? { product_id: otherProduct } : {}) });
        const contender = asyncSql(`set application_name='b02_contender'; ${mode === 'link-seller' ? asSeller(direct(next)) : asService(rpc(next))}`);
        try { await waitForBlocked('b02_contender'); } finally { holder.child.stdin.end('commit;\n'); }
        const [held, competing] = await Promise.all([holder.done, contender.done]);
        assert.equal(held.status, 0, held.stderr);
        if (mode === 'cancel-link') assert.equal(competing.status, 0, competing.stderr);
        else {
          assert.notEqual(competing.status, 0, 'only one writer may take the final seat');
          assert.match(competing.stderr, new RegExp(bus ? 'SHOW_OPS_BUS_FULL' : 'SHOW_OPS_SHOW_FULL'));
        }
        assert.equal(sql(`select count(*) from public.show_bookings where show_date='${tomorrow}' and cancelled_at is null`), '1');
      });
    }
  } finally {
    if (started) spawnSync('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', '-w', 'stop'], { env, encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
  }
});
