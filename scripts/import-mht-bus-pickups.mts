/**
 * Apply printed MHT bus sheets to Show Ops stops.
 * Lanzarote: Playa Blanca + Costa Teguise (updated 15 Aug 2026)
 * Tenerife: Vivo Show Bar pickups from 2 Feb 2026 (weekday routes)
 *
 *   npx tsx scripts/import-mht-bus-pickups.mts
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BIZ = "5a16bfc4-3363-43e1-bd8c-30afcf3d3529";

type SheetStop = {
  island: string;
  zone: string;
  resort: string;
  stop_name: string;
  pickup_time: string;
  sort_order: number;
  runs_on: string | null;
  match: string[];
};

const LANZ_PB: SheetStop[] = [
  ["Sun Royal Reception", "17:45", ["Sun Royal PB"]],
  ["Sun Park Reception", "17:45", ["Sun Park PB"]],
  ["White Suites Reception", "17:45", ["White Suites Recep PB"]],
  ["Sandos Papagayo Reception", "17:50", ["Sandos Papagayo PB"]],
  ["Barcelo Playa Blanca", "17:50", ["Hotel Barcelo Playa Blanca"]],
  ["Gran Castillo Reception", "17:50", ["Gran Castillo"]],
  ["Mirador Papagayo Reception", "17:55", ["Mirador Papagayo PB"]],
  ["Volcan Lanzarote Reception", "17:55", ["Volcan Lanz Bus Stop PB"]],
  ["Pueblo Marinero Reception", "17:55", ["Pueblo Marinero PB"]],
  ["Lanzarote Princess Reception", "18:00", ["Lanzarote Princess PB"]],
  ["Cay Sun Beach Reception", "18:00", ["Cay Sun Beach Reception"]],
  ["Sun Tropical Island Reception", "18:05", ["Tropical Island Reception"]],
  ["Club Playa Blanca Reception", "18:10", ["Club Playa Blanca"]],
  ["Outside Casas del Sol", "18:10", ["outside Casas del Sol"]],
  ["Lanzarote Park Bus Stop", "18:10", ["Lanz Park Recep PB"]],
  ["Playa Flamingo Reception", "18:10", ["Playa Flamingo PB"]],
  ["Timanfaya Palace Reception", "18:15", ["Timanfaya Palace PB"]],
  ["Atlantic Gardens Reception", "18:15", ["Atlantic Garden PB"]],
  ["Natura Palace Reception", "18:15", ["Natura Palace PB"]],
  ["Coral Beach Reception", "18:15", ["Coral Beach"]],
  ["Royal Monica", "18:20", ["Royal Monica"]],
  ["Elba Lanzarote Hotel Reception", "18:20", ["Elba Lanz/Old Corbetta PB"]],
  ["Rubicon Palace Reception", "18:20", ["Rubicon Palace PB"]],
  ["Paradise Island Reception", "18:20", ["Paradise Island PB"]],
  ["Jardines Del Sol Diamond Reception", "18:20", ["Jardines Del Sol MainGate"]],
  ["Secrets Lanzarote Resort & Spa", "18:40", ["Reception Secrets Lanzarote Resort"]],
  ["Hotel Costa Calero (Beside reception - C/Tinasu)", "18:40", ["Costa Calero ReceptionPB"]],
].map(([stop_name, pickup_time, match], i) => ({
  island: "Lanzarote",
  zone: "PB",
  resort: "Playa Blanca",
  stop_name: stop_name as string,
  pickup_time: pickup_time as string,
  sort_order: (i + 1) * 10,
  runs_on: null,
  match: match as string[],
}));

const LANZ_CT: SheetStop[] = [
  ["Tabaiba Centre Reception", "18:00", ["Tabaibas Centre Recep"]],
  ["Lanzarote Paradise Reception", "18:00", ["Lanzarote Paradise Recept"]],
  ["Blue Bay Reception", "18:05", ["Blue Bay"]],
  ["Ficus Hotel Reception", "18:10", ["Ficus Hotel Reception CT"]],
  ["El Trebol Hotel Reception", "18:10", ["El Trebol New recep CT"]],
  ["Club Tahiti Reception", "18:15", ["Tahiti Reception"]],
  ["Beatriz Hotel Reception", "18:15", ["Beatriz CT"]],
  ["Sands Beach Resort Reception", "18:20", ["Sands Beach Reception"]],
  ["Los Zocos Bus Stop", "18:25", ["Los Zocos Bus Stop CT"]],
  ["Lanzarote Gardens Reception", "18:25", ["Lanzarote Gardens"]],
  ["Teguise Playa Reception", "18:35", ["Teguise Playa CT"]],
  ["Radisson Blu", "18:40", ["Raddison Blu Reception"]],
  ["Playa Roca Bus Stop", "18:40", ["Playa Roca Bus Stop CT"]],
  ["Barcelo Lanz Activ", "18:45", ["OccMar B/Stop-Hotel Oasis"]],
  ["Intercambiador", "18:55", ["Intercambiador de Guaguas"]],
].map(([stop_name, pickup_time, match], i) => ({
  island: "Lanzarote",
  zone: "CT",
  resort: "Costa Teguise",
  stop_name: stop_name as string,
  pickup_time: pickup_time as string,
  sort_order: (i + 1) * 10,
  runs_on: null,
  match: match as string[],
}));

const TFS_WEST: SheetStop[] = [
  ["Costa Los Gigantes", "17:45", ["Costa Los Gigantes TFW"]],
  ["Rotonda Pescadora", "17:45", ["Rotonda Pescadora TFW"]],
  ["Colonial Park (Titsa Bus stop)", "17:45", ["TitsaBusStpColonialPrkApt"]],
  ["El Sombrero", "17:45", ["El Sombrero"]],
  ["Bus stop Tipsy Terrace", "17:50", ["TipsyTerraceStopTFW"]],
  ["Barcelo Santiago Bus Stop", "17:55", ["Barcelo Santiago B/Stop T"]],
  ["Tamaimo Tropical Reception", "18:00", ["Tamaimo Tropical TFW"]],
  ["Playa La Arena reception", "18:10", ["Playa La Arena Recep TFW"]],
  ["Bus stop plaza Playa La Arena beach", "18:10", ["Bus stop plaza Playa La Arena beach"]],
  ["Allegro Isora", "18:10", ["Alegro Isora"]],
  ["Palacio de Isora Reception", "18:20", ["Palacio De Isora TFW"]],
  ["Abama Reception", "18:25", ["Abama TFW"]],
  ["Rest. Nebula", "18:30", ["NabulaRest-OLDSantan Bank"]],
  ["RIU Buenavista", "18:40", ["Riu Buenvista TFW"]],
  ["Bus stop opposite Hard Rock", "18:40", ["BStop OpHard RockTFW"]],
  ["Atlantic Sunset Reception", "18:50", ["Reception Atlantic Sunset"]],
  ["Bahia Principe Costa Adeje", "18:50", ["Bahia Principe CA TFW"]],
].map(([stop_name, pickup_time, match], i) => ({
  island: "Tenerife",
  zone: "TFW",
  resort: "West",
  stop_name: stop_name as string,
  pickup_time: pickup_time as string,
  sort_order: (i + 1) * 10,
  runs_on: "Tue,Fri",
  match: match as string[],
}));

const TFS_GOLF: SheetStop[] = [
  ["Arenas del Mar", "18:00", ["Arenas Del Mar Recep TFG"]],
  ["Alborada", "18:15", []],
  ["Costa Silencio Tenbel Tower", "18:15", ["Tenbel Tower BusstopSilen"]],
  ["Santa Barbara", "18:15", ["Santa Barbara Reception"]],
  ["Aguamarina / Alua", "18:15", ["Aguamarina Hotel TFG"]],
  ["Golf Plaza Bus stop", "18:15", ["Golf Plaza B/stop TFGolf"]],
  ["Hotel Bahia Fantasia", "18:20", ["Fantasia Hotel Reception"]],
  ["Vinci Golf Reception", "18:20", ["Vinci Golf Reception TFG"]],
  ["Stop MAIN RD — Royal Tenerife Country Club", "18:20", ["StopMAINrd-Royal TFE"]],
  ["Barcelo Tenerife (San Blas)", "18:20", ["Barcelo Tenerife (San Blas)"]],
].map(([stop_name, pickup_time, match], i) => ({
  island: "Tenerife",
  zone: "TFGolf",
  resort: "El Médano / Golf del Sur",
  stop_name: stop_name as string,
  pickup_time: pickup_time as string,
  sort_order: (i + 1) * 10,
  runs_on: "Mon",
  match: match as string[],
}));

const TFS_CALETA: SheetStop[] = [
  ["Royal Garden Villas", "19:10", ["Royal Garden Villas TFCA"]],
  ["Royal Hideaway Corales", "19:10", ["Royal Hideaway Corales Beach (Nr Rbout)"]],
  ["Costa Adeje Palace", "19:10", ["Costa Adeje Palace TFCA"]],
  ["Riu Arecas bus stop", "19:10", ["Riu Arecas bus stop TFCA"]],
  ["La Plantacion", "19:10", ["Plantacion Del Sur TFCA"]],
  ["Jardines del Teide", "19:10", ["Jardines del teide TFCA"]],
  ["Princess Inspire", "19:20", ["Princess Inspire Bus Stop TFCA"]],
].map(([stop_name, pickup_time, match], i) => ({
  island: "Tenerife",
  zone: "TFCA",
  resort: "La Caleta / Costa Adeje",
  stop_name: stop_name as string,
  pickup_time: pickup_time as string,
  sort_order: (i + 1) * 10,
  runs_on: "Tue,Fri",
  match: match as string[],
}));

const TFS_PUNTA: SheetStop[] = [
  {
    island: "Tenerife",
    zone: "CRZ",
    resort: "Punta del Rey",
    stop_name: "Punta del Rey",
    pickup_time: "17:30",
    sort_order: 10,
    runs_on: "Mon",
    match: ["Punta Del Rey"],
  },
];

const SHEET = [...LANZ_PB, ...LANZ_CT, ...TFS_WEST, ...TFS_GOLF, ...TFS_CALETA, ...TFS_PUNTA];

function loadEnv(path: string) {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    let k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

async function main() {
  const env = loadEnv("/Users/mattygale/Village/sites/closemate/.env.local");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: existing, error } = await sb
    .from("show_bus_stops")
    .select("id,island,resort,zone,stop_name,pickup_time,sort_order,active,runs_on")
    .eq("business_id", BIZ);
  if (error) throw error;
  const rows = existing ?? [];
  const used = new Set<string>();

  const updated: string[] = [];
  const inserted: string[] = [];
  const missingMatch: string[] = [];
  const sheetById = new Map<string, SheetStop>();

  for (const sheet of SHEET) {
    const hit =
      rows.find((r) => !used.has(r.id) && sheet.match.includes(r.stop_name)) ??
      rows.find((r) => !used.has(r.id) && r.stop_name === sheet.stop_name);
    const patch = {
      island: sheet.island,
      zone: sheet.zone,
      resort: sheet.resort,
      stop_name: sheet.stop_name,
      pickup_time: sheet.pickup_time,
      sort_order: sheet.sort_order,
      runs_on: sheet.runs_on,
      active: true,
      updated_at: new Date().toISOString(),
    };
    if (hit) {
      used.add(hit.id);
      sheetById.set(hit.id, sheet);
      const { error: upErr } = await sb.from("show_bus_stops").update(patch).eq("id", hit.id).eq("business_id", BIZ);
      if (upErr) throw upErr;
      updated.push(`${sheet.island} · ${sheet.stop_name}`);
    } else {
      const { error: inErr } = await sb.from("show_bus_stops").insert({ ...patch, business_id: BIZ });
      if (inErr) throw inErr;
      inserted.push(`${sheet.island} · ${sheet.stop_name}`);
      if (!sheet.match.length) missingMatch.push(sheet.stop_name);
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  for (const [id, sheet] of sheetById) {
    const { error: snapErr } = await sb
      .from("show_bookings")
      .update({
        pickup_stop_name: `${sheet.resort} · ${sheet.stop_name}`,
        pickup_time: sheet.pickup_time,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", BIZ)
      .eq("pickup_stop_id", id)
      .is("cancelled_at", null)
      .gte("show_date", todayIso);
    if (snapErr) throw snapErr;
  }

  const lanzLive = new Set([...LANZ_PB, ...LANZ_CT].map((s) => s.stop_name));
  const lanzExtras = rows.filter((r) => {
    if (r.island !== "Lanzarote") return false;
    if (used.has(r.id)) return false;
    if (lanzLive.has(r.stop_name)) return false;
    if (/own way/i.test(r.stop_name)) return false;
    const zone = String(r.zone ?? "").toUpperCase();
    if (zone === "PDC") return false;
    if (zone === "PB" || zone === "CT") return r.active !== false;
    const resort = String(r.resort ?? "").toLowerCase();
    if (resort === "playa blanca" || resort === "costa teguise" || resort === "pb" || resort === "ct") {
      return r.active !== false;
    }
    return false;
  });

  let deactivated = 0;
  for (const extra of lanzExtras) {
    const { error: dErr } = await sb
      .from("show_bus_stops")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", extra.id)
      .eq("business_id", BIZ);
    if (dErr) throw dErr;
    deactivated += 1;
  }

  const extraIds = lanzExtras.map((r) => r.id);
  const hotelsNeedingNewStop =
    extraIds.length === 0
      ? []
      : ((
          await sb
            .from("show_hotels")
            .select("name")
            .eq("business_id", BIZ)
            .eq("active", true)
            .in("bus_stop_id", extraIds)
        ).data?.map((h) => h.name) ?? []);

  const leftoverTimes: Array<{ stop_name: string; pickup_time: string; runs_on: string }> = [
    { stop_name: "Bahia Principe TFW", pickup_time: "18:50", runs_on: "Tue,Fri" },
    { stop_name: "RIU Arecas B/Stop TFS", pickup_time: "19:10", runs_on: "Tue,Fri" },
    { stop_name: "Royal Tenerife Cntry Club", pickup_time: "18:20", runs_on: "Mon" },
    { stop_name: "PlayaArena TitsaB/StopTFW", pickup_time: "18:10", runs_on: "Tue,Fri" },
  ];
  const stampedLeftovers: string[] = [];
  for (const leftover of leftoverTimes) {
    const { data, error: stErr } = await sb
      .from("show_bus_stops")
      .update({
        pickup_time: leftover.pickup_time,
        runs_on: leftover.runs_on,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", BIZ)
      .eq("stop_name", leftover.stop_name)
      .select("id,resort,stop_name");
    if (stErr) throw stErr;
    if (data?.length) stampedLeftovers.push(`${leftover.stop_name} · ${leftover.pickup_time}`);
    for (const stop of data ?? []) {
      const { error: bErr } = await sb
        .from("show_bookings")
        .update({
          pickup_time: leftover.pickup_time,
          pickup_stop_name: `${stop.resort} · ${stop.stop_name}`,
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", BIZ)
        .eq("pickup_stop_id", stop.id)
        .is("cancelled_at", null)
        .gte("show_date", todayIso);
      if (bErr) throw bErr;
    }
  }

  const { data: liveStops, error: liveErr } = await sb
    .from("show_bus_stops")
    .select("id,stop_name")
    .eq("business_id", BIZ)
    .eq("active", true);
  if (liveErr) throw liveErr;
  const stopIdByName = new Map((liveStops ?? []).map((s) => [s.stop_name, s.id]));

  const hotelRelinks: Array<[string, string]> = [
    ["Bahia Playa Blanca-Old Cay Beach Pap", "Cay Sun Beach Reception"],
    ["RIU Arecas TFCA", "Riu Arecas bus stop"],
    ["RIU Palace TFCA", "Riu Arecas bus stop"],
    ["Grand El Mirador TFCA", "Riu Arecas bus stop"],
    ["Principe Tenerife TFW", "Bahia Principe Costa Adeje"],
    ["Palm Resort TFG", "Stop MAIN RD — Royal Tenerife Country Club"],
    ["Alborada Beach Club TFG", "Alborada"],
    ["Zzz Alborada Beach Club TFGolf", "Alborada"],
    ["Barceló Teguise Beach", "Teguise Playa Reception"],
  ];
  const relinkedHotels: string[] = [];
  for (const [hotelName, stopName] of hotelRelinks) {
    const stopId = stopIdByName.get(stopName);
    if (!stopId) continue;
    const { data, error: hErr } = await sb
      .from("show_hotels")
      .update({ bus_stop_id: stopId, updated_at: new Date().toISOString() })
      .eq("business_id", BIZ)
      .eq("name", hotelName)
      .eq("active", true)
      .select("id");
    if (hErr) throw hErr;
    if (!data?.length) continue;
    relinkedHotels.push(`${hotelName} → ${stopName}`);
    const sheet = SHEET.find((s) => s.stop_name === stopName);
    const label = sheet ? `${sheet.resort} · ${sheet.stop_name}` : stopName;
    for (const hotel of data) {
      const { error: bErr } = await sb
        .from("show_bookings")
        .update({
          pickup_stop_id: stopId,
          pickup_stop_name: label,
          pickup_time: sheet?.pickup_time ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", BIZ)
        .eq("hotel_id", hotel.id)
        .eq("transport_required", true)
        .is("cancelled_at", null)
        .gte("show_date", todayIso);
      if (bErr) throw bErr;
    }
  }

  const { data: stillOrphan } = extraIds.length
    ? await sb
        .from("show_hotels")
        .select("name")
        .eq("business_id", BIZ)
        .eq("active", true)
        .in("bus_stop_id", extraIds)
    : { data: [] as { name: string }[] };

  console.log(
    JSON.stringify(
      {
        sheet: SHEET.length,
        updated: updated.length,
        inserted: inserted.length,
        insertedNames: inserted,
        deactivated,
        deactivatedNames: lanzExtras.map((r) => `${r.resort} · ${r.stop_name}`),
        hotelsNeedingNewStop,
        stampedLeftovers,
        relinkedHotels,
        stillOrphan: stillOrphan?.map((h) => h.name) ?? [],
        newWithoutAlias: missingMatch,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
