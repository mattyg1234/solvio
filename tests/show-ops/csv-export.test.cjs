const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

function moduleAt(file, overrides = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/')) return moduleAt(`src/${name.slice(2)}.ts`, overrides);
    if (name.startsWith('.')) return moduleAt(require('node:path').resolve(require('node:path').dirname(file), `${name}.ts`), overrides);
    return require(name);
  }, Date, URL, URLSearchParams, console });
  return exports;
}

for (const route of ['bookings', 'daily-sales']) {
  for (const failLater of [false, true]) {
    test(`${route} CSV ${failLater ? 'fails closed on a later-page error' : 'exports every row despite server caps'}`, async () => {
      const rows = Array.from({ length: 10123 }, (_, id) => ({ id: String(id), booking_ref: `REF${id}`, guest_name: 'Guest', show_name: 'Show', island: 'Tenerife', show_date: '2026-09-09', created_at: '2026-09-09T12:00:00Z', adults: 1, children: 0, infants: 0, total_cost: 10, balance_remaining: 0, billing_mode: 'deposit', payment_status: 'paid' }));
      const requests = [];
      const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (url) => {
        const p = new URL(url).searchParams;
        requests.push(p);
        const offset = Number(p.get('offset') || 0);
        if (failLater && offset) return new Response(JSON.stringify({ message: 'database unavailable' }), { status: 500 });
        return new Response(JSON.stringify(rows.slice(offset, offset + Math.min(Number(p.get('limit') || 1000), 137))), { headers: { 'Content-Type': 'application/json' } });
      } } });
      client.auth.getUser = async () => ({ data: { user: { id: 'owner' } } });
      const { GET } = moduleAt(`src/app/api/show-ops/${route}.csv/route.ts`, {
        '@/lib/supabase/server': { createSupabaseServerClient: async () => client },
        '@/lib/show-ops/resolve-business': { resolveShowOpsBusinessId: async () => ({ id: 'tenant', show_ops_enabled: true }) },
      });
      const response = await GET({ nextUrl: new URL('https://example.com/?date=2026-09-09&island=Tenerife') });
      const body = await response.text();
      if (failLater) {
        assert.equal(response.status, 500);
        assert.match(response.headers.get('Content-Type'), /json/);
        assert.doesNotMatch(body, /REF0/);
      } else {
        assert.equal(response.status, 200);
        assert.equal((body.match(/REF\d+/g) || []).length, rows.length);
        assert.equal(new Set(body.match(/REF\d+/g)).size, rows.length);
        for (const p of requests) {
          assert.equal(p.get('business_id'), 'eq.tenant');
          assert.equal(p.get('island'), 'eq.Tenerife');
          assert.equal(p.get('cancelled_at'), 'is.null');
          assert.match(p.get('order'), /id/);
        }
      }
    });
  }
}
