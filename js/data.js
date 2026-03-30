import { categoryOf, OPTION_NAMES } from './utils.js?v=3.0.0';

/** Loaded database */
let db = null;

/** Load JSON and build indices */
export async function loadData() {
  const resp = await fetch('json/Oniro_ItemDB_V1.json?v=2.1.1');
  const raw = await resp.json();

  const items = raw['아이템 옵션+스킬 DB'] || [];
  const weaponStats = raw['무기 피해 DB'] || [];
  const armorStats = raw['방어구 방어력 DB'] || [];
  const legend = raw['범례'] || [];

  // Build lookup maps
  const weaponMap = new Map();
  for (const w of weaponStats) {
    weaponMap.set(w.ID, w);
  }

  const armorMap = new Map();
  for (const a of armorStats) {
    armorMap.set(a.ID, a);
  }

  // Filter out items without a Korean name and add category field
  const isValidName = (name) => name && name.trim() !== '' && name.trim() !== '-' && name.trim() !== 'N';
  const validItems = items.filter(item =>
    item.아이템ID != null && (isValidName(item.한국어이름) || isValidName(item.에디터이름))
  );
  for (const item of validItems) {
    item._category = categoryOf(item.타입);
  }

  // Collect unique types per category
  const typesByCategory = {};
  for (const item of validItems) {
    if (!item.타입) continue;
    const cat = item._category;
    if (!typesByCategory[cat]) typesByCategory[cat] = new Set();
    typesByCategory[cat].add(item.타입);
  }

  // Collect unique subtypes per category
  const subtypesByCategory = {};
  for (const item of validItems) {
    if (!item.세부타입) continue;
    const cat = item._category;
    if (!subtypesByCategory[cat]) subtypesByCategory[cat] = new Set();
    subtypesByCategory[cat].add(item.세부타입);
  }

  // Collect unique options (ID → Korean name, only those that exist in items)
  const uniqueOptions = new Map();
  for (const item of validItems) {
    for (const opt of item.옵션 || []) {
      if (opt.ID === 0 || uniqueOptions.has(opt.ID)) continue;
      uniqueOptions.set(opt.ID, OPTION_NAMES[opt.ID] || opt.이름 || `옵션 #${opt.ID}`);
    }
  }

  // Collect unique skills (Korean name, deduplicated)
  const uniqueSkills = new Set();
  for (const item of validItems) {
    for (const skill of item.스킬 || []) {
      const name = skill['이름(한국어)'] || skill.이름;
      if (name) uniqueSkills.add(name);
    }
  }

  // Category counts
  const categoryCounts = { all: validItems.length };
  for (const item of validItems) {
    categoryCounts[item._category] = (categoryCounts[item._category] || 0) + 1;
  }

  db = {
    items: validItems,
    weaponMap,
    armorMap,
    legend,
    typesByCategory,
    subtypesByCategory,
    categoryCounts,
    uniqueOptions,
    uniqueSkills,
  };

  return db;
}

/** Get loaded db */
export function getDB() {
  return db;
}

/** Get weapon stats for item ID */
export function getWeaponStats(id) {
  return db?.weaponMap.get(id) || null;
}

/** Get armor stats for item ID */
export function getArmorStats(id) {
  return db?.armorMap.get(id) || null;
}
