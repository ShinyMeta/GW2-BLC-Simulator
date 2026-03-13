/**
 * Resolves a template category by combining its fixed items with items
 * injected from set configs via slot declarations.
 *
 * Slot weight resolution (first match wins):
 *  1. Item's own `weight` property (from the set config)
 *  2. Slot's `weightPerItem` — fixed weight assigned to every item
 *  3. Slot's `totalWeight` — divided evenly among all items in the set
 *
 * @param {{ items?: object[], slots?: object[] }} category
 * @param {string} categoryName - tag attached to each resolved item
 * @param {Record<string, { items: object[] }>} sets
 * @returns {object[]}
 */
function resolveCategory(category, categoryName, sets) {
  const items = (category.items ?? []).map((item) => ({
    ...item,
    quantity: item.quantity ?? 1,
    category: categoryName,
  }));

  for (const slot of category.slots ?? []) {
    const setConfig = sets[slot.setKey];
    if (!setConfig) {
      throw new Error(`Missing set config for slot "${slot.setKey}"`);
    }

    const perItemWeight =
      slot.weightPerItem ??
      (slot.totalWeight != null ? slot.totalWeight / setConfig.items.length : undefined);

    for (const setItem of setConfig.items) {
      items.push({
        ...setItem,
        quantity: setItem.quantity ?? 1,
        weight: setItem.weight ?? perItemWeight,
        category: categoryName,
      });
    }
  }

  return items;
}

/**
 * Merges a loot-table template with a map of resolved set configs
 * to produce a fully flattened loot table ready for rolling.
 *
 * The resulting table has four sections:
 *  - `guaranteed`   – items always received (no weighting)
 *  - `commonLeft`   – first common drop pool (one draw)
 *  - `commonRight`  – second common drop pool (one draw)
 *  - `fifthDrop`    – single pool combining exclusive/uncommon/rare/superRare,
 *                      drawn once with probability `fifthDropChance`
 *
 * @param {object} template - parsed template.json
 * @param {Record<string, { items: object[] }>} sets - setKey → set config
 * @returns {object} resolved loot table
 */
export function buildLootTable(template, sets) {
  return {
    fifthDropChance: template.fifthDropChance,

    guaranteed: resolveCategory(template.guaranteed, "guaranteed", sets),

    commonLeft: resolveCategory(template.commonLeft, "commonLeft", sets),
    commonRight: resolveCategory(template.commonRight, "commonRight", sets),

    fifthDrop: [
      ...resolveCategory(template.exclusive, "exclusive", sets),
      ...resolveCategory(template.uncommon, "uncommon", sets),
      ...resolveCategory(template.rare, "rare", sets),
      ...(template.superRare.items ?? []).map((item) => ({
        ...item,
        quantity: item.quantity ?? 1,
        category: "superRare",
      })),
    ],
  };
}

/**
 * Weighted random selection from a list of items.
 * Each item must have a numeric `weight` property.
 *
 * @param {Array<{ weight: number }>} items
 * @returns {object} the selected item
 */
function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }

  return items[items.length - 1];
}

/**
 * Simulates opening one Black Lion Chest.
 *
 * Returns an array of 4–5 drop results:
 *  1. Black Lion Statuette (guaranteed)
 *  2. Guaranteed Rotating Item (guaranteed)
 *  3. Common left draw
 *  4. Common right draw
 *  5. (10% chance) One item from the exclusive/uncommon/rare/superRare pool
 *
 * Each result is a plain object with:
 *  `{ itemId, label, quantity, category }`
 *
 * @param {object} lootTable - resolved table from buildLootTable()
 * @returns {Array<{ itemId: number, label: string, quantity: number, category: string }>}
 */
export function openChest(lootTable) {
  const drops = [];

  for (const item of lootTable.guaranteed) {
    drops.push({ itemId: item.itemId, label: item.label, quantity: item.quantity, category: item.category });
  }

  const leftPick = weightedRandom(lootTable.commonLeft);
  drops.push({ itemId: leftPick.itemId, label: leftPick.label, quantity: leftPick.quantity, category: leftPick.category });

  const rightPick = weightedRandom(lootTable.commonRight);
  drops.push({ itemId: rightPick.itemId, label: rightPick.label, quantity: rightPick.quantity, category: rightPick.category });

  if (Math.random() < lootTable.fifthDropChance) {
    const pick = weightedRandom(lootTable.fifthDrop);
    drops.push({ itemId: pick.itemId, label: pick.label, quantity: pick.quantity, category: pick.category });
  }

  return drops;
}

/**
 * Convenience factory: builds a loot table and returns a service object
 * with a single `openChest()` method bound to that table.
 *
 * @param {object} template
 * @param {Record<string, { items: object[] }>} sets
 * @returns {{ lootTable: object, openChest: () => object[] }}
 */
export function createLootService(template, sets) {
  const lootTable = buildLootTable(template, sets);
  return {
    lootTable,
    openChest: () => openChest(lootTable),
  };
}
