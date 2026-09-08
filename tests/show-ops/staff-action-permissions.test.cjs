// Run: node --test tests/show-ops/staff-action-permissions.test.cjs
// Execute the actual TS guards/pages with an in-memory Supabase boundary.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '../..');

function load(relative, dependencies = {}) {
  const filename = path.join(ROOT, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (key) => dependencies[key] ?? {}, module, module.exports,
  );
  return module.exports;
}
const nav = load('src/lib/show-ops/nav.ts');

function harness(role = 'booker', pages = null) {
  const state = { role, pages, enabled: true, signedIn: true, member: true, reads: [], authReads: 0 };
  const business = () => ({ id: 'workspace', owner_id: state.role === 'owner' ? 'user' : 'someone-else', name: 'Test', show_ops_enabled: state.enabled });
  const supabase = {
    auth: { getUser: async () => { state.authReads++; return { data: { user: state.signedIn ? { id: 'user' } : null } }; } },
    from(table) {
      state.reads.push(table);
      const filters = [];
      let single = false;
      const q = {
        select() { return q; },
        eq(key, value) { filters.push((r) => r[key] === value); return q; },
        in(key, values) { filters.push((r) => values.includes(r[key])); return q; },
        not(key, op, value) { filters.push((r) => r[key] !== value); return q; },
        order() { return q; }, limit() { return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          let rows = table === 'businesses' ? [business()] : table === 'show_ops_members' && state.member
            ? [{ business_id: 'workspace', user_id: 'user', role: state.role, allowed_pages: state.pages,
              allowed_islands: null, supplier_id: state.role === 'seller' ? 'supplier' : null }]
            : [];
          rows = rows.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const access = load('src/lib/show-ops/access.ts', {
    react: { cache: (fn) => { let cached; return () => cached ??= fn(); } },
    './island-access': {},
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'workspace' }) }) },
    'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    '@/lib/show-ops/config': { brandingFromBusiness: () => ({}), parseShowOpsConfig: () => ({}) },
    '@/lib/show-ops/nav': nav,
    '@/lib/supabase/server': { createSupabaseServerClient: async () => supabase, createSupabaseServiceRoleClient: () => supabase },
  });
  return { state, access };
}

test('saved invoice grants cannot raise booker or office above their role', () => {
  for (const role of ['booker', 'office', 'seller']) {
    assert.equal(nav.canSeeShowOpsPage(role, ['invoices'], 'invoices'), false);
  }
  assert.equal(nav.canSeeShowOpsPage('finance', ['invoices'], 'invoices'), true);
  assert.deepEqual(nav.showOpsAllowedPages('seller', ['bookings', 'door']), []);
});

test('role AND page checks apply, with any-of page alternatives and fail-closed empty alternatives', async () => {
  for (const role of ['booker', 'office', 'finance', 'admin']) {
    const { access } = harness(role, ['door']);
    assert.equal((await access.requireShowOpsAction('booker', ['lists', 'door'])).role, role);
    await assert.rejects(access.requireShowOpsAction('booker', 'bookings'), /permission/);
    await assert.rejects(access.requireShowOpsAction('booker', []), /permission/);
  }
  await assert.rejects(harness('booker', ['bookings']).access.requireShowOpsAction('office', 'bookings'), /office/);
  await assert.rejects(harness('office', ['invoices']).access.requireShowOpsAction('finance', 'invoices'), /finance/);
});

test('owner and unrestricted defaults work; empty saved list retains existing defaults', async () => {
  for (const pages of [null, []]) {
    await harness('booker', pages).access.requireShowOpsAction('booker', 'bookings');
    await harness('office', pages).access.requireShowOpsAction('office', 'bookings');
    await harness('finance', pages).access.requireShowOpsAction('finance', 'invoices');
    await harness('owner', pages).access.requireShowOpsAction('admin', 'settings');
  }
});

test('mutations reload membership, page grants, role and enabled state even after a cached render', async () => {
  const { access, state } = harness('finance');
  await access.requireShowOpsPage('invoices');
  await access.requireShowOpsAction('finance', 'invoices');
  state.pages = ['door'];
  await assert.rejects(access.requireShowOpsAction('finance', 'invoices'), /permission/);
  state.pages = null;
  state.role = 'booker';
  await assert.rejects(access.requireShowOpsAction('finance', 'invoices'), /finance/);
  state.enabled = false;
  await assert.rejects(access.requireShowOpsAction('booker', 'bookings'), /REDIRECT:.*setup/);
  state.enabled = true;
  state.member = false;
  await assert.rejects(access.requireShowOpsAction('booker', 'bookings'), /REDIRECT:\/dashboard$/);
  assert.equal(state.authReads, 6);
});

test('signed-out users and sellers cannot invoke staff actions', async () => {
  const signedOut = harness();
  signedOut.state.signedIn = false;
  await assert.rejects(signedOut.access.requireShowOpsAction('booker', 'bookings'), /REDIRECT:\/login/);
  await assert.rejects(harness('seller', ['bookings']).access.requireShowOpsAction('booker', 'bookings'), /REDIRECT:\/partner/);
});

test('all three actual direct pages reject restricted staff before reading bookings or payments', async () => {
  for (const page of ['bookings/new', 'bookings/[id]', 'payments']) {
    for (const role of ['booker', 'office']) {
      const { access, state } = harness(role, ['door']);
      const component = load(`src/app/dashboard/show-ops/${page}/page.tsx`, { '@/lib/show-ops/access': access }).default;
      await assert.rejects(component({ params: Promise.resolve({ id: 'booking' }), searchParams: Promise.resolve({}) }), /REDIRECT:.*\/door$/);
      assert.ok(!state.reads.includes('show_bookings'));
      assert.ok(!state.reads.includes('show_booking_payments'));
    }
  }
});

test('payments page adds the office floor to the existing bookings key', async () => {
  const { access, state } = harness('booker', ['bookings']);
  const component = load('src/app/dashboard/show-ops/payments/page.tsx', { '@/lib/show-ops/access': access }).default;
  await assert.rejects(component({ searchParams: Promise.resolve({}) }), /REDIRECT:.*\/bookings$/);
  assert.ok(!state.reads.includes('show_booking_payments'));
  await harness('office', ['bookings']).access.requireShowOpsPage('bookings', 'office');
  assert.ok(!nav.SHOW_OPS_PAGE_KEYS.includes('payments'));
});
