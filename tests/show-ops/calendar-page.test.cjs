const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const calendar = require('../../src/lib/show-ops/calendar.ts');
const nights = require('../../src/lib/show-ops/nights.ts');
const reportData = require('../../src/lib/show-ops/report-data.ts');

function page(client) {
  const overrides = {
    'next/link': { default: 'a' },
    '@/components/show-ops/scroll-to-created': { ScrollIntoView: 'scroll' },
    '@/components/show-ops/show-calendar-night': { ShowCalendarNight: 'night', calendarCellSummary: () => null },
    '@/components/show-ops/show-ops-page-header': { ShowOpsPageHeader: 'header', ShowOpsPill: 'pill' },
    '@/lib/show-ops/access': { requireShowOpsPage: async () => ({ supabase: client, business: { id: 'tenant' }, config: { islands: ['Tenerife'], currency: 'EUR' }, role: 'owner' }), roleAtLeast: () => true },
    '@/lib/show-ops/calendar': calendar,
    '@/lib/show-ops/nights': nights,
    '@/lib/show-ops/outbound': { showOpsOutboundLive: () => false },
    '@/lib/show-ops/report-data': reportData,
  };
  const compiled = ts.transpileModule(fs.readFileSync('src/app/dashboard/show-ops/calendar/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => name in overrides ? overrides[name] : require(name), Date, URLSearchParams });
  return exports.default;
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  return null;
}
for (const failLater of [false, true]) {
  test(`calendar ${failLater ? 'rejects incomplete month data' : 'loads complete month and night with tenant and island filters'}`, async () => {
    const rows = Array.from({ length: 1103 }, (_, id) => ({ id: String(id), show_date: '2026-09-01', island: 'Tenerife', product_id: 'p', show_name: 'Show', guest_name: `Guest ${id}`, adults: 1, children: 0, infants: 0, transport_required: true }));
    const requests = [];
    const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async url => {
      const u = new URL(url); const p = u.searchParams; requests.push({ table: u.pathname.split('/').pop(), p });
      const offset = Number(p.get('offset') || 0);
      if (failLater && offset && p.get('select').includes('product_id')) return new Response(JSON.stringify({ message: 'unavailable' }), { status: 500 });
      let data = u.pathname.endsWith('show_bookings') ? rows : u.pathname.endsWith('show_products') ? [{ id: 'p', name: 'Show', island: 'Tenerife', capacity: 2000, run_weekdays: [2], active: true }] : [];
      data = data.slice(offset, offset + Math.min(Number(p.get('limit') || 1000), 137));
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } } });
    const run = () => page(client)({ searchParams: Promise.resolve({ month: '2026-09', date: '2026-09-01', island: 'Tenerife' }) });
    if (failLater) { await assert.rejects(run, /Could not load/); return; }
    const night = find(await run(), 'night');
    assert.equal(night.props.day.pax, rows.length);
    assert.equal(night.props.bookings.length, rows.length);
    for (const { p } of requests) {
      assert.equal(p.get('business_id'), 'eq.tenant');
      assert.equal(p.get('island'), 'eq.Tenerife');
      assert.match(p.get('order'), /id/);
    }
  });
}

test('calendar shows a closed badge without reopening other shows through an overlapping closure', () => {
  const reopen = () => {};
  const overrides = {
    'next/link': { default: 'a' },
    '@/app/dashboard/show-ops/actions': { reopenSaleAction: reopen },
    '@/components/show-ops/ops-home-widgets': { FillPill: 'fill' },
    '@/components/show-ops/show-ops-page-header': {},
    '@/components/show-ops/submit-once': { SubmitOnce: 'submit' },
    '@/components/ui/number-input': { NumberInput: 'input' },
    '@/lib/show-ops/calc': require('../../src/lib/show-ops/calc.ts'),
  };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync('src/components/show-ops/show-calendar-night.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => name in overrides ? overrides[name] : require(name) });
  const closes = [
    { id: 'show-close', show_date: '2026-09-01', island: 'Tenerife', product_id: 'p', close_kind: 'part' },
    { id: 'island-close', show_date: '2026-09-01', island: 'Tenerife', product_id: null, close_kind: 'full' },
  ];
  const day = calendar.buildCalendarDays({ year: 2026, month: 9, products: [{ id: 'p', name: 'Show', island: 'Tenerife', capacity: 100, run_weekdays: [2] }], bookings: [], busOrders: [], closes })[0];
  const tree = exports.ShowCalendarNight({ day, nextUrl: '/calendar', island: '', canClose: true, currency: 'EUR', bookings: [], closes, busOrders: [] });
  assert.equal(find(tree, 'fill'), null, 'Closed show must not display an Open capacity badge');
  function collect(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => collect(child, predicate))];
  }
  const form = collect(tree, n => n.type === 'form' && n.props.action === reopen)[0];
  assert.equal(collect(form, n => n.type === 'input' && n.props.name === 'id')[0].props.value, 'show-close');
  assert.equal(find(form, 'submit').props.children, 'Remove show closure');
  assert.ok(collect(tree, n => n.type === 'span' && n.props.children === 'Closed').length);
});
