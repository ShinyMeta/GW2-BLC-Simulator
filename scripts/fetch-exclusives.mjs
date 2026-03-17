#!/usr/bin/env node
/**
 * Scrapes the GW2 wiki to build exclusives.json with item IDs and names.
 *
 * Sources:
 *   1. Template:Inventory/statuette  – New / Recent / Vintage exclusive tables
 *   2. Black_Lion_Chest (sections)   – New / Returning exclusives
 *
 * For each item the script fetches the wiki page wikitext to read the
 * item‑id from the infobox (| id = …), then hits the GW2 API to get
 * the canonical in‑game display name.
 *
 * Usage:  node scripts/fetch-exclusives.mjs
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "../src/loot/config/sets/exclusives.json");
const WIKI = "https://wiki.guildwars2.com/api.php";
const GW2_API = "https://api.guildwars2.com/v2/items";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADERS = {
  "User-Agent": "GW2-BLC-Simulator/1.0 (wiki scraper; Node.js)",
};

// ── Wiki helpers ──────────────────────────────────────────────────────────

async function wikiApi(params) {
  const url = new URL(WIKI);
  for (const [k, v] of Object.entries({ ...params, format: "json" }))
    url.searchParams.set(k, v);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Wiki API HTTP ${res.status}`);
  return res.json();
}

async function getPageWikitext(title) {
  const data = await wikiApi({ action: "parse", page: title, prop: "wikitext" });
  return data.parse.wikitext["*"];
}

async function getSectionWikitext(page, section) {
  const data = await wikiApi({
    action: "parse",
    page,
    prop: "wikitext",
    section: String(section),
  });
  return data.parse.wikitext["*"];
}

async function batchGetWikitext(titles) {
  const result = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wikiApi({
      action: "query",
      titles: batch.join("|"),
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
    });

    // Build forward chain so we can map resolved titles back to originals
    const normMap = new Map();
    for (const n of data.query.normalized ?? []) normMap.set(n.from, n.to);
    const redirMap = new Map();
    for (const r of data.query.redirects ?? []) redirMap.set(r.from, r.to);

    const resolvedToOrig = new Map();
    for (const orig of batch) {
      let t = orig;
      if (normMap.has(t)) t = normMap.get(t);
      if (redirMap.has(t)) t = redirMap.get(t);
      if (!resolvedToOrig.has(t)) resolvedToOrig.set(t, []);
      resolvedToOrig.get(t).push(orig);
    }

    for (const page of Object.values(data.query.pages)) {
      if (page.missing !== undefined) continue;
      const wt =
        page.revisions?.[0]?.slots?.main?.["*"] ??
        page.revisions?.[0]?.["*"];
      if (!wt) continue;
      result[page.title] = wt;
      for (const orig of resolvedToOrig.get(page.title) ?? [])
        result[orig] = wt;
    }

    if (i + 50 < titles.length) await sleep(300);
  }
  return result;
}

// ── GW2 API helper ───────────────────────────────────────────────────────

async function batchGetItemNames(ids) {
  const names = {};
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const res = await fetch(`${GW2_API}?ids=${batch.join(",")}`);
    if (!res.ok) throw new Error(`GW2 API HTTP ${res.status}`);
    const items = await res.json();
    for (const item of items) names[item.id] = item.name;
    if (i + 200 < ids.length) await sleep(100);
  }
  return names;
}

// ── Parsers ──────────────────────────────────────────────────────────────

function extractId(wikitext) {
  const m = wikitext.match(/\|\s*id\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseStatuetteItems(wikitext) {
  const sections = [
    "New Black Lion Chest Exclusives",
    "Recent Black Lion Chest Exclusives",
    "Vintage Black Lion Chest Exclusives",
  ];
  const items = [];

  for (const sec of sections) {
    const escaped = sec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`===\\s*${escaped}\\s*===([\\s\\S]*?)(?====|$)`);
    const match = wikitext.match(re);
    if (!match) {
      console.warn(`  ⚠ Section "${sec}" not found`);
      continue;
    }
    const rows = [
      ...match[1].matchAll(
        /\{\{vendor table row\s*\|\s*item\s*=\s*(.+?)(?:\s*\||\s*\}\})/gi
      ),
    ];
    for (const row of rows) items.push(row[1].trim());
    console.log(`  ${sec}: ${rows.length} items`);
  }
  return items;
}

function parseChestItems(wikitext) {
  return [...wikitext.matchAll(/\{\{contains\|([^|}]+)/g)].map((m) =>
    m[1].trim()
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // 1. Statuette vendor template
  console.log("Fetching statuette vendor template…");
  const statWt = await getPageWikitext("Template:Inventory/statuette");
  const statItems = parseStatuetteItems(statWt);
  console.log(`  Subtotal: ${statItems.length}\n`);

  // 2. Chest page – New / Returning exclusive sections
  console.log("Fetching chest page exclusive sections…");
  const {
    parse: { sections },
  } = await wikiApi({
    action: "parse",
    page: "Black_Lion_Chest",
    prop: "sections",
  });

  const chestItems = [];
  for (const sec of sections) {
    if (/New Exclusive|Returning Exclusive/.test(sec.line)) {
      const wt = await getSectionWikitext("Black_Lion_Chest", sec.index);
      const parsed = parseChestItems(wt);
      console.log(`  ${sec.line}: ${parsed.length} items`);
      chestItems.push(...parsed);
    }
  }
  console.log(`  Subtotal: ${chestItems.length}\n`);

  // 3. Deduplicate
  const allNames = [...new Set([...statItems, ...chestItems])];
  console.log(`Combined unique items: ${allNames.length}\n`);

  // 4. Resolve item IDs from wiki page infoboxes
  console.log(`Fetching wikitext for ${allNames.length} item pages…`);
  const wtMap = await batchGetWikitext(allNames);

  const resolved = [];
  const missing = [];
  for (const name of allNames) {
    const wt = wtMap[name];
    if (!wt) {
      missing.push(`${name} (page not found)`);
      continue;
    }
    const id = extractId(wt);
    if (id === null) {
      missing.push(`${name} (no id in infobox)`);
      continue;
    }
    resolved.push({ id, wikiName: name });
  }

  // 5. Get canonical display names from the GW2 API
  console.log(`Fetching display names from GW2 API for ${resolved.length} items…`);
  const nameMap = await batchGetItemNames(resolved.map((r) => r.id));

  const items = resolved.map(({ id, wikiName }) => ({
    itemId: id,
    label: nameMap[id] ?? wikiName.replace(/\s*\([^)]*\)$/, ""),
  }));

  if (missing.length) {
    console.warn(`\n⚠ ${missing.length} unresolved:`);
    for (const m of missing) console.warn(`  - ${m}`);
  }

  // 6. Write output
  writeFileSync(OUTPUT, JSON.stringify({ items }, null, 2) + "\n");
  console.log(`\nWrote ${items.length} items → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
