import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generateChestConfig } from "../src/loot/generateChestConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const setsDir = join(__dirname, "../src/loot/config/sets");
const outPath = join(__dirname, "../src/loot/config/chests/example.json");

const readJSON = (file) => JSON.parse(readFileSync(join(setsDir, file), "utf-8"));

const chest = generateChestConfig({
  name: "Example Chest",
  guaranteedItemCatalog: readJSON("guaranteedItems.json"),
  exclusivesCatalog: readJSON("exclusives.json"),
  dyeKitsCatalog: readJSON("dyeKits.json"),
  weaponsCatalog: readJSON("weapons.json"),
  glyphsCatalog: readJSON("glyphs.json"),
  nodesCatalog: readJSON("nodes.json"),
  tonicsCatalog: readJSON("tonics.json"),
});

writeFileSync(outPath, JSON.stringify(chest, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
