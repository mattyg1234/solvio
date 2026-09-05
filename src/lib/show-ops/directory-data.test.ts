import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDirectoryHotels } from "./directory-data";
import { matchesDirectorySearch } from "./directory-search";

test("hotel search includes names beyond the first database page and always applies business scope", async () => {
  const rows = Array.from({ length: 1205 }, (_, id) => ({
    id: String(id),
    name: id === 1204 ? "Last Hotel José" : `Hotel ${id}`,
    island: "Tenerife",
    bus_stop_id: null,
    active: true,
  }));
  const filters: unknown[] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    order: () => query,
    range: async (start: number, end: number) => ({
      data: rows.slice(start, end + 1),
      error: null,
    }),
  };
  const client = { from: () => query } as unknown as SupabaseClient;
  const { data } = await loadDirectoryHotels(client, "business", true);
  assert.equal(data.length, 1205);
  assert.equal(
    data.filter((hotel) => matchesDirectorySearch("jose", hotel.name)).length,
    1,
  );
  assert.ok(
    filters.some(
      (item) => JSON.stringify(item) === '["business_id","business"]',
    ),
  );
});
