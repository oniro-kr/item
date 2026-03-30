/**
 * i18n Core Module
 * - t(key, ...args): UI string translation
 * - tGame(koText): Game data translation via LanguagePack
 * - setLanguage(lang): Switch language + re-render
 * - translatePage(): Translate all data-i18n elements
 */

const SUPPORTED_LANGS = ['ko','en','ja','zh','fr','de','es','it','pt','ru','tr','ar','id','pl'];
const LANG_LABELS = {
  ko: '한국어', en: 'English', ja: '日本語', zh: '中文',
  fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano',
  pt: 'Português', ru: 'Русский', tr: 'Türkçe', ar: 'العربية',
  id: 'Indonesia', pl: 'Polski',
};

let currentLang = 'ko';
let uiStrings = {};          // { lang: { key: value } }
let gameIndex = new Map();   // Map<koText, { lang: translatedText }>
let onLanguageChange = null; // callback

/** Detect initial language */
function detectLanguage() {
  const saved = localStorage.getItem('oniro_lang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGS.includes(nav)) return nav;
  return 'ko';
}

/** Load UI strings JSON */
async function loadUIStrings() {
  try {
    const resp = await fetch(getBasePath() + 'json/ui-strings.json?v=3.2.0');
    uiStrings = await resp.json();
  } catch (e) {
    console.warn('Failed to load ui-strings.json:', e);
  }
}

/** Load game language pack and build ko→{lang} index */
async function loadGameLanguagePack() {
  try {
    const resp = await fetch(getBasePath() + 'json/Oniro_LanguagePack_Full.json?v=3.2.0');
    const pack = await resp.json();
    const entries = pack['데이터'] || [];
    for (const entry of entries) {
      const ko = entry.translations?.ko;
      if (!ko) continue;
      gameIndex.set(ko, entry.translations);
    }
  } catch (e) {
    console.warn('Failed to load LanguagePack:', e);
  }
}

/** Get base path (handles subpages like /guide/ or /weapons/) */
function getBasePath() {
  const path = location.pathname;
  if (path.includes('/guide/') || path.includes('/weapons/')) return '../';
  return '';
}

/** Initialize i18n */
export async function initI18n(onChangeCb) {
  onLanguageChange = onChangeCb;
  currentLang = detectLanguage();
  await Promise.all([loadUIStrings(), loadGameLanguagePack()]);
  document.documentElement.lang = currentLang;
  if (currentLang === 'ar') document.documentElement.dir = 'rtl';
  return currentLang;
}

/** Get current language */
export function getLang() {
  return currentLang;
}

/** Set language and re-render */
export function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('oniro_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  translatePage();
  if (onLanguageChange) onLanguageChange(lang);
}

/** Translate a UI string key with optional placeholder args */
export function t(key, ...args) {
  const str = uiStrings[currentLang]?.[key]
    || uiStrings['en']?.[key]
    || uiStrings['ko']?.[key]
    || key;
  if (args.length === 0) return str;
  return str.replace(/\{(\d+)\}/g, (_, i) => args[+i] ?? '');
}

/** Translate game data (Korean text → current language) */
export function tGame(koText) {
  if (!koText) return koText;
  if (currentLang === 'ko') return koText;
  const translations = gameIndex.get(koText);
  if (translations?.[currentLang]) return translations[currentLang];
  // Try supplementary map
  const sup = SUPPLEMENTARY[koText];
  if (sup?.[currentLang]) return sup[currentLang];
  // Fallback: return original
  return koText;
}

/** Build a sorted list of known Korean terms for in-text replacement (longest first) */
let _termCache = null;
function getTermList() {
  if (_termCache) return _termCache;
  const seen = new Set();
  const terms = [];
  // Collect from SUPPLEMENTARY first (higher priority, allow 1-char terms)
  for (const ko of Object.keys(SUPPLEMENTARY)) {
    if (ko.length >= 1 && !seen.has(ko)) { terms.push(ko); seen.add(ko); }
  }
  // Collect from game language pack (min 2 chars to avoid false matches)
  for (const [ko] of gameIndex) {
    if (ko.length >= 2 && !seen.has(ko)) { terms.push(ko); seen.add(ko); }
  }
  // Sort longest first to avoid partial replacements
  terms.sort((a, b) => b.length - a.length);
  _termCache = terms;
  return terms;
}

/** Translate a block of Korean game text (e.g. affix descriptions) line by line.
 *  Replaces known Korean terms within each line with translated equivalents. */
export function tGameBlock(koText) {
  if (!koText || currentLang === 'ko') return koText;
  const terms = getTermList();
  return koText.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    // Try full line match first
    const full = tGame(trimmed);
    if (full !== trimmed) return full;
    // Replace known terms within the line (longest first)
    let result = line;
    for (const term of terms) {
      if (result.includes(term)) {
        const translated = tGame(term);
        if (translated !== term) {
          result = result.replaceAll(term, translated);
        }
      }
    }
    // Remove Korean particles (을/를/에/의/이/가) that appear between translated words
    result = result.replace(/([A-Za-z0-9%).])\s*을\s*/g, '$1 ');
    result = result.replace(/([A-Za-z0-9%).])\s*를\s*/g, '$1 ');
    result = result.replace(/([A-Za-z0-9%).])\s*에\s*/g, '$1 ');
    result = result.replace(/([A-Za-z0-9%).])\s*의\s*/g, '$1 ');
    // Clean up: "한" remnant from "신성한" → "Holy한" (한 after Latin text)
    result = result.replace(/([A-Za-z])한\s/g, '$1 ');
    result = result.replace(/([A-Za-z])한$/g, '$1');
    return result;
  }).join('\n');
}

/** Translate all elements with data-i18n attribute */
export function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // Update <title> tag
  const titleKey = document.querySelector('meta[name="i18n-title"]')?.content;
  if (titleKey) document.title = t(titleKey);
}

/** Get supported languages list for UI */
export function getSupportedLanguages() {
  return SUPPORTED_LANGS.map(code => ({ code, label: LANG_LABELS[code] }));
}

/** Build and insert language selector into a container */
export function createLanguageSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const select = document.createElement('select');
  select.className = 'lang-select';
  select.id = 'langSelect';
  select.setAttribute('aria-label', 'Language');

  for (const { code, label } of getSupportedLanguages()) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    if (code === currentLang) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', (e) => setLanguage(e.target.value));
  container.appendChild(select);
}

/** Translate a skill name by parsing its structure.
 *  Pattern: [trigger prefix] + base ability + suffix (+N, 시전, 시전 확률, 확률, 장착)
 */
export function tSkillName(koName) {
  if (!koName || currentLang === 'ko') return koName;

  // Try direct match first
  const direct = tGame(koName);
  if (direct !== koName) return direct;

  // Parse suffix
  let base = koName;
  let suffix = '';
  const suffixPatterns = [
    [/\s*시전\s*확률$/, () => ` ${tUI('skill.suffix.castChance')}`],
    [/\s*시전$/, () => ` ${tUI('skill.suffix.cast')}`],
    [/\s*확률$/, () => ` ${tUI('skill.suffix.chance')}`],
    [/\s*장착$/, () => ` ${tUI('skill.suffix.equip')}`],
    [/\s*\+(\d+(?:-\d+)?)$/, (m) => ` +${m[1]}`],
  ];
  for (const [pattern, builder] of suffixPatterns) {
    const m = base.match(pattern);
    if (m) {
      suffix = builder(m);
      base = base.slice(0, m.index).trim();
      break;
    }
  }

  // Parse trigger prefix (타격 시, 피격 시, 시전 시)
  let prefix = '';
  const triggerPatterns = [
    [/^타격\s*시\s*/, () => `${tUI('skill.prefix.onHit')} `],
    [/^피격\s*시\s*/, () => `${tUI('skill.prefix.whenHit')} `],
    [/^시전\s*시\s*/, () => `${tUI('skill.prefix.onCast')} `],
  ];
  for (const [pattern, builder] of triggerPatterns) {
    const m = base.match(pattern);
    if (m) {
      prefix = builder(m);
      base = base.slice(m[0].length).trim();
      break;
    }
  }

  // Translate base ability name
  let translatedBase = tGame(base);
  // If tGame didn't translate, try tGameBlock for compound bases like "공기 기술", "랜덤 어둠 기술"
  if (translatedBase === base && base.includes(' ')) {
    translatedBase = tGameBlock(base);
  }

  return `${prefix}${translatedBase}${suffix}`;
}

/** Internal: get skill-related UI strings */
function tUI(key) {
  const map = {
    'skill.suffix.castChance': { en:'Cast Chance', ja:'発動確率', zh:'施法概率', fr:'Chance de lancement', de:'Wirkungschance', es:'Prob. lanzamiento', it:'Prob. lancio', pt:'Chance conjuração', ru:'Шанс применения', tr:'Büyü Şansı', ar:'فرصة الإلقاء', id:'Peluang Cast', pl:'Szansa rzucenia' },
    'skill.suffix.cast': { en:'Cast', ja:'発動', zh:'施法', fr:'Lancement', de:'Wirken', es:'Lanzar', it:'Lancio', pt:'Conjurar', ru:'Применение', tr:'Büyü', ar:'إلقاء', id:'Cast', pl:'Rzucenie' },
    'skill.suffix.chance': { en:'Chance', ja:'確率', zh:'概率', fr:'Chance', de:'Chance', es:'Prob.', it:'Prob.', pt:'Chance', ru:'Шанс', tr:'Şans', ar:'فرصة', id:'Peluang', pl:'Szansa' },
    'skill.suffix.equip': { en:'(Equip)', ja:'(装備時)', zh:'(装备)', fr:'(Équipé)', de:'(Angelegt)', es:'(Equipar)', it:'(Equipaggiato)', pt:'(Equipar)', ru:'(Экип.)', tr:'(Kuşanınca)', ar:'(تجهيز)', id:'(Dipakai)', pl:'(Założ.)' },
    'skill.prefix.onHit': { en:'On Hit:', ja:'命中時:', zh:'命中时:', fr:'Au toucher:', de:'Bei Treffer:', es:'Al golpear:', it:'Al colpo:', pt:'Ao acertar:', ru:'При ударе:', tr:'Vurunca:', ar:'عند الضرب:', id:'Saat Hit:', pl:'Przy trafieniu:' },
    'skill.prefix.whenHit': { en:'When Hit:', ja:'被弾時:', zh:'被击时:', fr:'Quand touché:', de:'Bei erh. Treffer:', es:'Al ser golpeado:', it:'Quando colpito:', pt:'Ao ser atingido:', ru:'При получ. удара:', tr:'Vurulunca:', ar:'عند التعرض:', id:'Saat Terkena:', pl:'Przy otrzymaniu:' },
    'skill.prefix.onCast': { en:'On Cast:', ja:'詠唱時:', zh:'施法时:', fr:'Au lancement:', de:'Beim Wirken:', es:'Al lanzar:', it:'Al lancio:', pt:'Ao conjurar:', ru:'При применении:', tr:'Büyü Atınca:', ar:'عند الإلقاء:', id:'Saat Cast:', pl:'Przy rzucaniu:' },
  };
  const entry = map[key];
  if (!entry) return key;
  return entry[currentLang] || entry['en'] || key;
}

// ── Supplementary translations for terms NOT in the LanguagePack ──
// Covers rarity names, category names, option type badges, and a few missing option names.
const SUPPLEMENTARY = {
  // Rarity display names
  '일반': { en:'Normal', ja:'ノーマル', zh:'普通', fr:'Normal', de:'Normal', es:'Normal', it:'Normale', pt:'Normal', ru:'Обычный', tr:'Normal', ar:'عادي', id:'Normal', pl:'Normalny' },
  '마법': { en:'Magic', ja:'マジック', zh:'魔法', fr:'Magique', de:'Magisch', es:'Mágico', it:'Magico', pt:'Mágico', ru:'Магический', tr:'Büyülü', ar:'سحري', id:'Sihir', pl:'Magiczny' },
  '희귀': { en:'Rare', ja:'レア', zh:'稀有', fr:'Rare', de:'Selten', es:'Raro', it:'Raro', pt:'Raro', ru:'Редкий', tr:'Nadir', ar:'نادر', id:'Langka', pl:'Rzadki' },
  '전설': { en:'Legendary', ja:'レジェンダリー', zh:'传说', fr:'Légendaire', de:'Legendär', es:'Legendario', it:'Leggendario', pt:'Lendário', ru:'Легендарный', tr:'Efsanevi', ar:'أسطوري', id:'Legendaris', pl:'Legendarny' },
  '전설적인': { en:'Legendary', ja:'レジェンダリー', zh:'传说级', fr:'Légendaire', de:'Legendär', es:'Legendario', it:'Leggendario', pt:'Lendário', ru:'Легендарный', tr:'Efsanevi', ar:'أسطوري', id:'Legendaris', pl:'Legendarny' },

  // Category names
  '무기': { en:'Weapon', ja:'武器', zh:'武器', fr:'Arme', de:'Waffe', es:'Arma', it:'Arma', pt:'Arma', ru:'Оружие', tr:'Silah', ar:'سلاح', id:'Senjata', pl:'Broń' },
  '갑옷': { en:'Armor', ja:'鎧', zh:'铠甲', fr:'Armure', de:'Rüstung', es:'Armadura', it:'Armatura', pt:'Armadura', ru:'Доспех', tr:'Zırh', ar:'درع', id:'Baju Besi', pl:'Zbroja' },
  '투구': { en:'Helmet', ja:'兜', zh:'头盔', fr:'Casque', de:'Helm', es:'Casco', it:'Elmo', pt:'Elmo', ru:'Шлем', tr:'Miğfer', ar:'خوذة', id:'Helm', pl:'Hełm' },
  '장갑': { en:'Gloves', ja:'手袋', zh:'手套', fr:'Gants', de:'Handschuhe', es:'Guantes', it:'Guanti', pt:'Luvas', ru:'Перчатки', tr:'Eldiven', ar:'قفازات', id:'Sarung Tangan', pl:'Rękawice' },
  '신발': { en:'Boots', ja:'靴', zh:'靴子', fr:'Bottes', de:'Stiefel', es:'Botas', it:'Stivali', pt:'Botas', ru:'Сапоги', tr:'Çizmeler', ar:'أحذية', id:'Sepatu', pl:'Buty' },
  '벨트': { en:'Belt', ja:'ベルト', zh:'腰带', fr:'Ceinture', de:'Gürtel', es:'Cinturón', it:'Cintura', pt:'Cinto', ru:'Пояс', tr:'Kemer', ar:'حزام', id:'Sabuk', pl:'Pas' },
  '반지': { en:'Ring', ja:'指輪', zh:'戒指', fr:'Anneau', de:'Ring', es:'Anillo', it:'Anello', pt:'Anel', ru:'Кольцо', tr:'Yüzük', ar:'خاتم', id:'Cincin', pl:'Pierścień' },
  '부적': { en:'Amulet', ja:'お守り', zh:'护身符', fr:'Amulette', de:'Amulett', es:'Amuleto', it:'Amuleto', pt:'Amuleto', ru:'Амулет', tr:'Muska', ar:'تعويذة', id:'Jimat', pl:'Amulet' },
  '귀걸이': { en:'Earring', ja:'イヤリング', zh:'耳环', fr:'Boucle d\'oreille', de:'Ohrring', es:'Pendiente', it:'Orecchino', pt:'Brinco', ru:'Серьга', tr:'Küpe', ar:'قرط', id:'Anting', pl:'Kolczyk' },
  '보조무기': { en:'Off-hand', ja:'補助武器', zh:'副武器', fr:'Arme secondaire', de:'Nebenhand', es:'Mano secundaria', it:'Mano secondaria', pt:'Mão secundária', ru:'Второстепенное', tr:'Yardımcı Silah', ar:'سلاح ثانوي', id:'Senjata Pendukung', pl:'Broń dodatkowa' },
  '방어구': { en:'Armor', ja:'防具', zh:'防具', fr:'Armure', de:'Rüstung', es:'Armadura', it:'Armatura', pt:'Armadura', ru:'Доспехи', tr:'Zırh', ar:'دروع', id:'Pelindung', pl:'Zbroja' },
  '장신구': { en:'Accessory', ja:'装飾品', zh:'饰品', fr:'Accessoire', de:'Schmuck', es:'Accesorio', it:'Accessorio', pt:'Acessório', ru:'Аксессуар', tr:'Aksesuar', ar:'إكسسوار', id:'Aksesoris', pl:'Akcesorium' },
  '보조': { en:'Off-hand', ja:'補助', zh:'辅助', fr:'Secondaire', de:'Nebenhand', es:'Secundario', it:'Secondario', pt:'Secundário', ru:'Вспомогательное', tr:'Yardımcı', ar:'مساعد', id:'Pendukung', pl:'Dodatkowe' },

  // Weapon subtypes
  '검': { en:'Sword', ja:'剣', zh:'剑', fr:'Épée', de:'Schwert', es:'Espada', it:'Spada', pt:'Espada', ru:'Меч', tr:'Kılıç', ar:'سيف', id:'Pedang', pl:'Miecz' },
  '석궁': { en:'Crossbow', ja:'クロスボウ', zh:'弩', fr:'Arbalète', de:'Armbrust', es:'Ballesta', it:'Balestra', pt:'Besta', ru:'Арбалет', tr:'Tatar Yayı', ar:'قوس نشاب', id:'Panah Silang', pl:'Kusza' },
  '활': { en:'Bow', ja:'弓', zh:'弓', fr:'Arc', de:'Bogen', es:'Arco', it:'Arco', pt:'Arco', ru:'Лук', tr:'Yay', ar:'قوس', id:'Busur', pl:'Łuk' },
  '도끼': { en:'Axe', ja:'斧', zh:'斧', fr:'Hache', de:'Axt', es:'Hacha', it:'Ascia', pt:'Machado', ru:'Топор', tr:'Balta', ar:'فأس', id:'Kapak', pl:'Topór' },
  '양손검': { en:'Two-handed Sword', ja:'両手剣', zh:'双手剑', fr:'Épée à deux mains', de:'Zweihänder', es:'Espadón', it:'Spadone', pt:'Espadão', ru:'Двуручный меч', tr:'Çift El Kılıcı', ar:'سيف بيدين', id:'Pedang Dua Tangan', pl:'Miecz dwuręczny' },
  '양손도끼': { en:'Two-handed Axe', ja:'両手斧', zh:'双手斧', fr:'Hache à deux mains', de:'Zweihandaxt', es:'Hacha a dos manos', it:'Ascia a due mani', pt:'Machado a duas mãos', ru:'Двуручный топор', tr:'Çift El Baltası', ar:'فأس بيدين', id:'Kapak Dua Tangan', pl:'Topór dwuręczny' },
  '양손철퇴': { en:'Two-handed Mace', ja:'両手メイス', zh:'双手锤', fr:'Masse à deux mains', de:'Zweihandkeule', es:'Maza a dos manos', it:'Mazza a due mani', pt:'Maça a duas mãos', ru:'Двуручная булава', tr:'Çift El Topuzu', ar:'صولجان بيدين', id:'Gada Dua Tangan', pl:'Maczuga dwuręczna' },
  '양손봉': { en:'Two-handed Staff', ja:'両手杖', zh:'双手杖', fr:'Bâton à deux mains', de:'Zweihandstab', es:'Bastón a dos manos', it:'Bastone a due mani', pt:'Cajado a duas mãos', ru:'Двуручный посох', tr:'Çift El Asası', ar:'عصا بيدين', id:'Tongkat Dua Tangan', pl:'Laska dwuręczna' },
  '철퇴': { en:'Mace', ja:'メイス', zh:'锤', fr:'Masse', de:'Keule', es:'Maza', it:'Mazza', pt:'Maça', ru:'Булава', tr:'Topuz', ar:'صولجان', id:'Gada', pl:'Maczuga' },
  '봉': { en:'Staff', ja:'杖', zh:'杖', fr:'Bâton', de:'Stab', es:'Bastón', it:'Bastone', pt:'Cajado', ru:'Посох', tr:'Asa', ar:'عصا', id:'Tongkat', pl:'Laska' },
  '장창': { en:'Spear', ja:'槍', zh:'长矛', fr:'Lance', de:'Speer', es:'Lanza', it:'Lancia', pt:'Lança', ru:'Копьё', tr:'Mızrak', ar:'رمح', id:'Tombak', pl:'Włócznia' },
  '단검': { en:'Dagger', ja:'短剣', zh:'匕首', fr:'Dague', de:'Dolch', es:'Daga', it:'Pugnale', pt:'Adaga', ru:'Кинжал', tr:'Hançer', ar:'خنجر', id:'Belati', pl:'Sztylet' },
  '너클': { en:'Knuckle', ja:'ナックル', zh:'拳套', fr:'Poing', de:'Schlagring', es:'Puño', it:'Tirapugni', pt:'Soqueira', ru:'Кастет', tr:'Muşta', ar:'قبضة', id:'Cakar', pl:'Kastet' },
  '수리검': { en:'Shuriken', ja:'手裏剣', zh:'手里剑', fr:'Shuriken', de:'Shuriken', es:'Shuriken', it:'Shuriken', pt:'Shuriken', ru:'Сюрикен', tr:'Shuriken', ar:'شوريكن', id:'Shuriken', pl:'Shuriken' },
  '투창': { en:'Javelin', ja:'投槍', zh:'投枪', fr:'Javelot', de:'Wurfspeer', es:'Jabalina', it:'Giavellotto', pt:'Dardo', ru:'Дротик', tr:'Cirit', ar:'رمح قذف', id:'Lembing', pl:'Oszczep' },
  '쿠나이': { en:'Kunai', ja:'クナイ', zh:'苦无', fr:'Kunai', de:'Kunai', es:'Kunai', it:'Kunai', pt:'Kunai', ru:'Кунай', tr:'Kunai', ar:'كوناي', id:'Kunai', pl:'Kunai' },
  '완드': { en:'Wand', ja:'ワンド', zh:'魔杖', fr:'Baguette', de:'Zauberstab', es:'Varita', it:'Bacchetta', pt:'Varinha', ru:'Жезл', tr:'Değnek', ar:'عصا سحرية', id:'Tongkat Sihir', pl:'Różdżka' },
  '지팡이': { en:'Staff', ja:'スタッフ', zh:'法杖', fr:'Bâton', de:'Stab', es:'Bastón', it:'Bastone', pt:'Cajado', ru:'Посох', tr:'Asa', ar:'عصا', id:'Tongkat', pl:'Laska' },
  '마법도구': { en:'Magic Tool', ja:'魔法道具', zh:'魔法道具', fr:'Outil magique', de:'Magiewerkzeug', es:'Herramienta mágica', it:'Strumento magico', pt:'Ferramenta mágica', ru:'Магический инструмент', tr:'Büyü Aleti', ar:'أداة سحرية', id:'Alat Sihir', pl:'Narzędzie magiczne' },
  '두루마리': { en:'Scroll', ja:'巻物', zh:'卷轴', fr:'Parchemin', de:'Schriftrolle', es:'Pergamino', it:'Pergamena', pt:'Pergaminho', ru:'Свиток', tr:'Parşömen', ar:'لفافة', id:'Gulungan', pl:'Zwój' },
  '책': { en:'Book', ja:'本', zh:'书', fr:'Livre', de:'Buch', es:'Libro', it:'Libro', pt:'Livro', ru:'Книга', tr:'Kitap', ar:'كتاب', id:'Buku', pl:'Książka' },
  '경장': { en:'Light', ja:'軽装', zh:'轻甲', fr:'Léger', de:'Leicht', es:'Ligero', it:'Leggero', pt:'Leve', ru:'Лёгкий', tr:'Hafif', ar:'خفيف', id:'Ringan', pl:'Lekki' },
  '중갑': { en:'Medium', ja:'中装', zh:'中甲', fr:'Moyen', de:'Mittel', es:'Medio', it:'Medio', pt:'Médio', ru:'Средний', tr:'Orta', ar:'متوسط', id:'Sedang', pl:'Średni' },
  '중장': { en:'Heavy', ja:'重装', zh:'重甲', fr:'Lourd', de:'Schwer', es:'Pesado', it:'Pesante', pt:'Pesado', ru:'Тяжёлый', tr:'Ağır', ar:'ثقيل', id:'Berat', pl:'Ciężki' },

  // Option type badges
  '고정': { en:'Fixed', ja:'固定', zh:'固定', fr:'Fixe', de:'Fest', es:'Fijo', it:'Fisso', pt:'Fixo', ru:'Фиксир.', tr:'Sabit', ar:'ثابت', id:'Tetap', pl:'Stały' },
  '변동': { en:'Variable', ja:'変動', zh:'浮动', fr:'Variable', de:'Variabel', es:'Variable', it:'Variabile', pt:'Variável', ru:'Перемен.', tr:'Değişken', ar:'متغير', id:'Variabel', pl:'Zmienny' },
  '랜덤변동': { en:'Rand. Var.', ja:'ランダム変動', zh:'随机浮动', fr:'Aléat. Var.', de:'Zuf. Var.', es:'Aleat. Var.', it:'Rand. Var.', pt:'Aleat. Var.', ru:'Случ. Пер.', tr:'Rast. Değ.', ar:'عشوائي متغير', id:'Acak Var.', pl:'Los. Zm.' },
  '랜덤부여': { en:'Rand. Grant', ja:'ランダム付与', zh:'随机赋予', fr:'Aléat. Octr.', de:'Zuf. Verg.', es:'Aleat. Otor.', it:'Rand. Conc.', pt:'Aleat. Conc.', ru:'Случ. Нач.', tr:'Rast. Ver.', ar:'عشوائي ممنوح', id:'Acak Beri', pl:'Los. Nad.' },

  // Missing option names (18 terms not in language pack)
  '의지': { en:'Willpower', ja:'意志力', zh:'意志', fr:'Volonté', de:'Willenskraft', es:'Voluntad', it:'Volontà', pt:'Vontade', ru:'Воля', tr:'İrade', ar:'إرادة', id:'Kemauan', pl:'Siła woli' },
  '수 피해': { en:'Water Damage', ja:'水のダメージ', zh:'水损伤', fr:"Dégâts d'eau", de:'Wasserschaden', es:'Daño de agua', it:"Danno d'Acqua", pt:'Dano de água', ru:'Водяной урон', tr:'Su Hasarı', ar:'ضرر مائي', id:'Kerusakan Air', pl:'Obrażenia od wody' },
  '해양 피해': { en:'Marine Damage', ja:'海洋ダメージ', zh:'海洋伤害', fr:'Dégâts marins', de:'Meeresschaden', es:'Daño marino', it:'Danno marino', pt:'Dano marinho', ru:'Морской урон', tr:'Deniz Hasarı', ar:'ضرر بحري', id:'Kerusakan Laut', pl:'Obrażenia morskie' },
  '화염 기술 피해': { en:'Fire Skills Damage', ja:'火の技能のダメージ', zh:'火焰技能伤害', fr:"Dégâts d'Abilités de Feu", de:'Schaden durch Feuerfähigkeiten', es:'Daño de Habilidades de Fuego', it:'Danno Abilità Fuoco', pt:'Dano de Habilidades de Fogo', ru:'Урон Огненным Умениям', tr:'Ateş Becerileri Hasarı', ar:'ضرر المهارات النارية', id:'Kerusakan Keterampilan Api', pl:'Obrażenia umiej. Ognia' },
  '수 기술 피해': { en:'Water Skills Damage', ja:'水の技能のダメージ', zh:'水技能伤害', fr:"Dégâts d'Abilités d'Eau", de:'Schaden durch Wasserfähigkeiten', es:'Daño de Habilidades de Agua', it:'Danno Abilità Acqua', pt:'Dano de Habilidades de Água', ru:'Урон Водным Умениям', tr:'Su Becerileri Hasarı', ar:'ضرر المهارات المائية', id:'Kerusakan Keterampilan Air', pl:'Obrażenia umiej. Wody' },
  '중독 저항': { en:'Poisoning Resistance', ja:'毒耐性', zh:'毒抗', fr:'Résistance au Poison', de:'Giftresistenz', es:'Resistencia al Envenenamiento', it:"Resistenza all'Avvelenamento", pt:'Resistência ao Envenenamento', ru:'Сопр. к яду', tr:'Zehirlenmeye Direnç', ar:'مقاومة للتسمم', id:'Resistensi Racun', pl:'Odporność na Zatrucie' },
  '넉백 저항': { en:'Knockback Resistance', ja:'ノックバック耐性', zh:'击退抗性', fr:'Résistance au Recul', de:'Rückstoßresistenz', es:'Resistencia al Retroceso', it:'Resistenza al Rinculo', pt:'Resistência ao Recuo', ru:'Сопр. к отбрасыванию', tr:'Geri İtme Direnci', ar:'مقاومة الارتداد', id:'Resistensi Knockback', pl:'Odporność na odrzut' },
  '이동속도': { en:'Movement Speed', ja:'移動速度', zh:'移动速度', fr:'Vitesse de Déplacement', de:'Bewegungsgeschwindigkeit', es:'Velocidad de Movimiento', it:'Velocità di Movimento', pt:'Velocidade de Movimento', ru:'Скорость Передвижения', tr:'Hareket Hızı', ar:'سرعة الحركة', id:'Kecepatan Gerak', pl:'Szybkość Ruchu' },
  '생명력 흡수': { en:'Life Steal', ja:'ライフスティール', zh:'生命偷取', fr:'Vol de Vie', de:'Lebensraub', es:'Robo de Vida', it:'Rubavita', pt:'Roubo de Vida', ru:'Кража Жизни', tr:'Hayat Çalma', ar:'سرقة حياة', id:'Mencuri Kehidupan', pl:'Kradzież Życia' },
  '타격 시 생명': { en:'Life On Hit', ja:'ヒットごとのライフ', zh:'每击回复生命', fr:'Vie par Coup', de:'Leben pro Treffer', es:'Vida por Golpe', it:'Vita per Colpo', pt:'Vida por Acerto', ru:'Жизнь за Удар', tr:'Vurulduğunda Hayat', ar:'الحياة عند الضرب', id:'Kehidupan per Serangan', pl:'Życie za Uderzenie' },
  '에너지 흡수': { en:'Energy Steal', ja:'エネルギー盗取', zh:'能量偷取', fr:"Vol d'Énergie", de:'Energieraub', es:'Robo de Energía', it:'Furto di Energia', pt:'Roubo de Energia', ru:'Кража Энергии', tr:'Enerji Çalma', ar:'سرقة طاقة', id:'Mencuri Energi', pl:'Kradzież Energii' },
  '마법 찾기': { en:'Magic Find', ja:'魔法の発見', zh:'魔法发现', fr:'Trouvaille Magique', de:'Magischer Fund', es:'Encontrar Magia', it:'Ritrovamento Magico', pt:'Descoberta Mágica', ru:'Магическая Находка', tr:'Büyü Bulma', ar:'العثور على السحر', id:'Penemuan Sihir', pl:'Magiczne Znalezisko' },
  '구슬 드롭 확률': { en:'Orb Drop Chance', ja:'オーブドロップ率', zh:'宝珠掉落率', fr:"Chance d'Orbe", de:'Kugelabwurfchance', es:'Prob. Orbe', it:'Prob. Sfera', pt:'Chance de Orbe', ru:'Шанс Выпадения Сферы', tr:'Küre Düşme Şansı', ar:'فرصة سقوط الكرة', id:'Peluang Orb', pl:'Szansa na Kulę' },
  '화염 관통': { en:'Fire Penetration', ja:'炎の貫通', zh:'火焰穿透', fr:'Pénétration de Feu', de:'Feuerpenetration', es:'Penetración de Fuego', it:'Penetrazione Fuoco', pt:'Penetração de Fogo', ru:'Проникновение Огня', tr:'Ateş Penetrasyonu', ar:'اختراق النار', id:'Penetrasi Api', pl:'Penetracja Ognia' },
  '수 관통': { en:'Water Penetration', ja:'水の浸透', zh:'水的穿透', fr:'Pénétration Eau', de:'Wasserdurchdringung', es:'Penetración Agua', it:'Penetrazione Acqua', pt:'Penetração Água', ru:'Проникновение Воды', tr:'Su Sızdırma', ar:'اختراق الماء', id:'Penetrasi Air', pl:'Przenikanie Wody' },
  '물리적 피해 범위': { en:'Physical Damage Range', ja:'物理的なダメージ範囲', zh:'物理伤害范围', fr:'Portée Dégâts Physiques', de:'Reichweite Physischer Schaden', es:'Rango Daño Físico', it:'Portata Danno Fisico', pt:'Alcance Dano Físico', ru:'Диапазон Физического Урона', tr:'Fiziksel Hasar Aralığı', ar:'نطاق الضرر الجسدي', id:'Rentang Kerusakan Fisik', pl:'Zasięg Obrażeń Fizycznych' },
  '화염 피해 범위': { en:'Fire Damage Range', ja:'火のダメージ範囲', zh:'火焰伤害范围', fr:'Portée Dégâts Feu', de:'Reichweite Feuerschaden', es:'Rango Daño Fuego', it:'Portata Danno Fuoco', pt:'Alcance Dano Fogo', ru:'Диапазон Огненного Урона', tr:'Ateş Hasar Aralığı', ar:'نطاق الضرر الناري', id:'Rentang Kerusakan Api', pl:'Zasięg Obrażeń Ognia' },
  '수 피해 범위': { en:'Water Damage Range', ja:'水のダメージ範囲', zh:'水的伤害范围', fr:'Portée Dégâts Eau', de:'Reichweite Wasserschaden', es:'Rango Daño Agua', it:"Portata Danno d'Acqua", pt:'Alcance Dano Água', ru:'Диапазон Урона Воды', tr:'Su Hasar Aralığı', ar:'نطاق الضرر المائي', id:'Rentang Kerusakan Air', pl:'Zasięg Obrażeń Wody' },

  // Skill/ability names (item data → LP mapping)
  '갈고리 사슬': { en:'Hooked Chains', ja:'フックチェーン', zh:'钩链', fr:'Chaînes Accrochées', de:'Hakenketten', es:'Cadenas Enganchadas', it:'Catene Uncinate', pt:'Correntes Ganchadas', ru:'Кованные Цепи', tr:'Kancalı Zincirler', ar:'سلاسل مخططة', id:'Rantai Terikat', pl:'Łańcuchy Haczyka' },
  '감싸는 강풍': { en:'Wrapping Gale', ja:'包み込む嵐', zh:'包裹的风', fr:'Tempête Enveloppante', de:'Umhüllender Sturm', es:'Tormenta Abrasadora', it:'Tempesta Avvolgente', pt:'Tempestade Envolvente', ru:'Обвивает Ветры', tr:'Saran Fırtına', ar:'عاصفة ملتفة', id:'Angin Membungkus', pl:'Owiewająca Burza' },
  '강화 타격': { en:'Empowered Strike', ja:'強化された一撃', zh:'强化打击', fr:'Frappe Renforcée', de:'Ermächtigter Schlag', es:'Golpe Potenciado', it:'Colpo Potenziato', pt:'Golpe Aprimorado', ru:'Укрепленный Удар', tr:'Güçlendirilmiş Vuruş', ar:'ضربة معززة', id:'Serangan Ditingkatkan', pl:'Wzmocnione Uderzenie' },
  '기만': { en:'Deceit', ja:'欺瞞', zh:'欺骗', fr:'Traîtrise', de:'Täuschung', es:'Engaño', it:'Inganno', pt:'Engano', ru:'Обман', tr:'Aldatma', ar:'خداع', id:'Tipu Daya', pl:'Oszustwo' },
  '기술': { en:'Skills', ja:'技能', zh:'技能', fr:'Compétences', de:'Fähigkeiten', es:'Habilidades', it:'Abilità', pt:'Habilidades', ru:'Умения', tr:'Beceriler', ar:'مهارات', id:'Keterampilan', pl:'Umiejętności' },
  '날개 없는': { en:'Wingless', ja:'翼なし', zh:'无翼', fr:'Sans ailes', de:'Flügellos', es:'Sin alas', it:'Senza ali', pt:'Sem asas', ru:'Бескрылый', tr:'Kanatsız', ar:'بلا أجنحة', id:'Tanpa Sayap', pl:'Bezskrzydły' },
  '눈보라': { en:'Blizzard', ja:'吹雪', zh:'暴风雪', fr:'Tempête Neigeuse', de:'Schneesturm', es:'Tormenta de Nieve', it:'Bufera', pt:'Tempestade de Neve', ru:'Снегопад', tr:'Kar Fırtınası', ar:'عاصفة ثلجية', id:'Badai Salju', pl:'Burza Śnieżna' },
  '다중 미사일': { en:'Multishot', ja:'多重射撃', zh:'多重射击', fr:'Tirs Multiples', de:'Multipler Schuss', es:'Tiro Múltiple', it:'Tiro Multiplo', pt:'Tiro Múltiplo', ru:'Множественный Выстрел', tr:'Çoklu Atış', ar:'إطلاق متعدد', id:'Tembakan Ganda', pl:'Wielokrotny Strzał' },
  '대지 파쇄': { en:'Ground Stomp', ja:'地面への一撃', zh:'地面重击', fr:'Frappe au Sol', de:'Bodenstampf', es:'Golpe al Suelo', it:'Colpo al Suolo', pt:'Golpe no Solo', ru:'Удар по Земле', tr:'Zemin Darbesi', ar:'ضربة أرضية', id:'Pukulan Tanah', pl:'Cios w Ziemię' },
  '도약': { en:'Leap', ja:'ジャンプ', zh:'跳跃', fr:'Saut', de:'Sprung', es:'Salto', it:'Salto', pt:'Salto', ru:'Прыжок', tr:'Sıçrama', ar:'قفزة', id:'Lompatan', pl:'Skok' },
  '독 세례': { en:'Toxic Barrage', ja:'毒の弾幕', zh:'毒性轰击', fr:'Barrages Toxiques', de:'Toxischer Beschuss', es:'Barrage Tóxico', it:'Scarica Tossica', pt:'Barrage Tóxico', ru:'Токсическая атака', tr:'Toksik Bombardıman', ar:'قصف سام', id:'Barrage Toksik', pl:'Toksyczny ostrzał' },
  '독 타격': { en:'Poisoned Strike', ja:'毒の一撃', zh:'毒击', fr:'Frappe Toxique', de:'Vergifteter Schlag', es:'Golpe Envenenado', it:'Colpo Avvelenato', pt:'Golpe Envenenado', ru:'Ядовитый Удар', tr:'Zehirli Vuruş', ar:'ضربة مسمومة', id:'Serangan Beracun', pl:'Zatruty Cios' },
  '메테오': { en:'Meteor', ja:'隕石', zh:'陨石', fr:'Météore', de:'Meteor', es:'Meteorito', it:'Meteorite', pt:'Meteorito', ru:'Метеорит', tr:'Meteor', ar:'نجم ساقط', id:'Meteor', pl:'Meteor' },
  '발구르기': { en:'Tumble', ja:'転がり', zh:'翻滚', fr:'Roulement', de:'Purzelbaum', es:'Rodar', it:'Rotolamento', pt:'Rolamento', ru:'Кувырок', tr:'Yuvarlanma', ar:'تدحرج', id:'Guling', pl:'Przewracanie' },
  '버서커': { en:'Berserker', ja:'バーサーカー', zh:'狂战士', fr:'Berserker', de:'Berserker', es:'Berserker', it:'Berserker', pt:'Berserker', ru:'Берсерк', tr:'Berserker', ar:'برسيركر', id:'Berserker', pl:'Berserker' },
  '불굴': { en:'Tenacity', ja:'粘り強さ', zh:'坚韧', fr:'Persévérance', de:'Beharrlichkeit', es:'Tenacidad', it:'Tenacia', pt:'Tenacidade', ru:'Упорство', tr:'Azim', ar:'إصرار', id:'Ketahanan', pl:'Wytrwałość' },
  '사냥꾼': { en:'Hunter', ja:'ハンター', zh:'猎人', fr:'Chasseur', de:'Jäger', es:'Cazador', it:'Cacciatore', pt:'Caçador', ru:'Охотник', tr:'Avcı', ar:'صياد', id:'Pemburu', pl:'Łowca' },
  '사역마': { en:'Familiar', ja:'ファミリア', zh:'熟悉', fr:'Familiar', de:'Vertrauter', es:'Familiar', it:'Famiglio', pt:'Familiar', ru:'Сослуживец', tr:'Yardımcı', ar:'مألوف', id:'Familiar', pl:'Towarzysz' },
  '속박': { en:'Root', ja:'根', zh:'束缚', fr:'Entraver', de:'Wurzel', es:'Raíz', it:'Immobilizzare', pt:'Raiz', ru:'Корень', tr:'Kök', ar:'جذور', id:'Akar', pl:'Korzeń' },
  '수련': { en:'Discipline', ja:'規律', zh:'纪律', fr:'Discipline', de:'Disziplin', es:'Disciplina', it:'Disciplina', pt:'Disciplina', ru:'Дисциплина', tr:'Disiplin', ar:'انضباط', id:'Disiplin', pl:'Dyscyplina' },
  '까마귀 변신': { en:'Crow', ja:'カラス', zh:'乌鸦', fr:'Corbeau', de:'Krähe', es:'Cuervo', it:'Corvo', pt:'Corvo', ru:'Ворон', tr:'Karga', ar:'غراب', id:'Gagak', pl:'Kruk' },
  '그림자 질주': { en:'Shadow Step', ja:'シャドウステップ', zh:'影步', fr:'Pas de l\'ombre', de:'Schattenschritt', es:'Paso de sombra', it:'Passo d\'ombra', pt:'Passo sombrio', ru:'Теневой шаг', tr:'Gölge Adımı', ar:'خطوة الظل', id:'Langkah Bayangan', pl:'Krok cienia' },
  '난도질': { en:'Massacre', ja:'虐殺', zh:'屠杀', fr:'Massacre', de:'Massaker', es:'Masacre', it:'Massacro', pt:'Massacre', ru:'Бойня', tr:'Katliam', ar:'مذبحة', id:'Pembantaian', pl:'Masakra' },
  '감속': { en:'Slow', ja:'スロウ', zh:'减速', fr:'Ralentissement', de:'Verlangsamung', es:'Ralentizar', it:'Rallentamento', pt:'Lentidão', ru:'Замедление', tr:'Yavaşlatma', ar:'إبطاء', id:'Perlambatan', pl:'Spowolnienie' },
  '구원': { en:'Salvation', ja:'救済', zh:'救赎', fr:'Salut', de:'Erlösung', es:'Salvación', it:'Salvezza', pt:'Salvação', ru:'Спасение', tr:'Kurtuluş', ar:'خلاص', id:'Keselamatan', pl:'Zbawienie' },
  '서리 구체': { en:'Ice Sphere', ja:'アイスボール', zh:'冰球', fr:'Sphère de glace', de:'Eiskugel', es:'Esfera de hielo', it:'Sfera di ghiaccio', pt:'Esfera de gelo', ru:'Ледяная сфера', tr:'Buz Küresi', ar:'كرة جليدية', id:'Bola Es', pl:'Lodowa kula' },
  '얼음 구체': { en:'Ice Sphere', ja:'アイスボール', zh:'冰球', fr:'Sphère de glace', de:'Eiskugel', es:'Esfera de hielo', it:'Sfera di ghiaccio', pt:'Esfera de gelo', ru:'Ледяная сфера', tr:'Buz Küresi', ar:'كرة جليدية', id:'Bola Es', pl:'Lodowa kula' },
  '전기 구체': { en:'Lightning Orb', ja:'雷球', zh:'闪电球', fr:'Orbe de foudre', de:'Blitzkugel', es:'Orbe de rayo', it:'Sfera fulminea', pt:'Orbe de raio', ru:'Молниевый шар', tr:'Yıldırım Küresi', ar:'كرة البرق', id:'Bola Petir', pl:'Kula błyskawic' },
  '유령 늑대': { en:'Ghost Wolf', ja:'ゴーストウルフ', zh:'幽灵狼', fr:'Loup fantôme', de:'Geisterwolf', es:'Lobo fantasma', it:'Lupo fantasma', pt:'Lobo fantasma', ru:'Призрачный волк', tr:'Hayalet Kurt', ar:'ذئب شبحي', id:'Serigala Hantu', pl:'Widmowy wilk' },
  '유령 늑대 소환': { en:'Summon Ghost Wolf', ja:'ゴーストウルフ召喚', zh:'召唤幽灵狼', fr:'Invocation de loup', de:'Geisterwolf beschwören', es:'Invocar lobo', it:'Evoca lupo', pt:'Invocar lobo', ru:'Призвать волка', tr:'Kurt Çağır', ar:'استدعاء ذئب', id:'Panggil Serigala', pl:'Przywołaj wilka' },
  '유령 소환': { en:'Summon Ghost', ja:'ゴースト召喚', zh:'召唤幽灵', fr:'Invocation de fantôme', de:'Geist beschwören', es:'Invocar fantasma', it:'Evoca fantasma', pt:'Invocar fantasma', ru:'Призвать духа', tr:'Hayalet Çağır', ar:'استدعاء شبح', id:'Panggil Hantu', pl:'Przywołaj ducha' },
  '음속 사격': { en:'Sonic Shot', ja:'ソニックショット', zh:'音速射击', fr:'Tir sonique', de:'Schallschuss', es:'Disparo sónico', it:'Colpo sonico', pt:'Tiro sônico', ru:'Звуковой выстрел', tr:'Sonik Atış', ar:'طلقة صوتية', id:'Tembakan Sonik', pl:'Strzał dźwiękowy' },
  '음속 찌르기': { en:'Sonic Thrust', ja:'ソニックスラスト', zh:'音速刺击', fr:'Poussée sonique', de:'Schallstoß', es:'Empuje sónico', it:'Spinta sonica', pt:'Investida sônica', ru:'Звуковой удар', tr:'Sonik Saplama', ar:'طعنة صوتية', id:'Tusukan Sonik', pl:'Pchnięcie dźwiękowe' },
  '전투 함성': { en:'War Cry', ja:'ウォークライ', zh:'战吼', fr:'Cri de guerre', de:'Kriegsruf', es:'Grito de guerra', it:'Grido di guerra', pt:'Grito de guerra', ru:'Боевой клич', tr:'Savaş Narası', ar:'صيحة حرب', id:'Teriakan Perang', pl:'Okrzyk wojenny' },
  '죽음의 표식': { en:'Mark of Death', ja:'死の印', zh:'死亡标记', fr:'Marque de mort', de:'Todeszeichen', es:'Marca de muerte', it:'Marchio di morte', pt:'Marca da morte', ru:'Метка смерти', tr:'Ölüm İşareti', ar:'علامة الموت', id:'Tanda Kematian', pl:'Znak śmierci' },
  '즉사': { en:'Instant Kill', ja:'即死', zh:'即死', fr:'Mort instantanée', de:'Soforttod', es:'Muerte instantánea', it:'Morte istantanea', pt:'Morte instantânea', ru:'Мгновенная смерть', tr:'Anında Öldür', ar:'قتل فوري', id:'Bunuh Instan', pl:'Natychmiastowa śmierć' },
  '차단': { en:'Block', ja:'ブロック', zh:'格挡', fr:'Blocage', de:'Blocken', es:'Bloqueo', it:'Blocco', pt:'Bloqueio', ru:'Блок', tr:'Blok', ar:'صد', id:'Blok', pl:'Blok' },
  '천둥': { en:'Thunder', ja:'雷', zh:'雷', fr:'Tonnerre', de:'Donner', es:'Trueno', it:'Tuono', pt:'Trovão', ru:'Гром', tr:'Gök Gürültüsü', ar:'رعد', id:'Guntur', pl:'Grzmot' },
  '천둥 낙하': { en:'Thunder Drop', ja:'サンダードロップ', zh:'雷落', fr:'Chute de tonnerre', de:'Donnerschlag', es:'Caída de trueno', it:'Caduta di tuono', pt:'Queda de trovão', ru:'Удар грома', tr:'Gök Düşüşü', ar:'سقوط الرعد', id:'Jatuhan Petir', pl:'Upadek pioruna' },
  '치명': { en:'Critical', ja:'クリティカル', zh:'暴击', fr:'Critique', de:'Kritisch', es:'Crítico', it:'Critico', pt:'Crítico', ru:'Крит.', tr:'Kritik', ar:'حرجة', id:'Kritis', pl:'Krytyczny' },
  '칼날 부채': { en:'Blade Fan', ja:'ブレードファン', zh:'刃扇', fr:'Éventail de lames', de:'Klingenfächer', es:'Abanico de cuchillas', it:'Ventaglio di lame', pt:'Leque de lâminas', ru:'Веер клинков', tr:'Bıçak Yelpazesi', ar:'مروحة شفرات', id:'Kipas Pisau', pl:'Wachlarz ostrzy' },
  '토네이도': { en:'Tornado', ja:'トルネード', zh:'龙卷风', fr:'Tornade', de:'Tornado', es:'Tornado', it:'Tornado', pt:'Tornado', ru:'Торнадо', tr:'Kasırga', ar:'إعصار', id:'Tornado', pl:'Tornado' },
  '파수꾼': { en:'Sentinel', ja:'センチネル', zh:'哨兵', fr:'Sentinelle', de:'Wächter', es:'Centinela', it:'Sentinella', pt:'Sentinela', ru:'Страж', tr:'Nöbetçi', ar:'حارس', id:'Penjaga', pl:'Strażnik' },
  '폭발 봉인': { en:'Explosion Seal', ja:'爆発封印', zh:'爆裂封印', fr:'Sceau explosif', de:'Explosionssiegel', es:'Sello explosivo', it:'Sigillo esplosivo', pt:'Selo explosivo', ru:'Печать взрыва', tr:'Patlama Mühürü', ar:'ختم الانفجار', id:'Segel Ledakan', pl:'Pieczęć eksplozji' },
  '폭발 쿠나이': { en:'Explosive Kunai', ja:'爆発クナイ', zh:'爆裂苦无', fr:'Kunai explosif', de:'Explosiver Kunai', es:'Kunai explosivo', it:'Kunai esplosivo', pt:'Kunai explosivo', ru:'Взрывной кунай', tr:'Patlayıcı Kunai', ar:'كوناي متفجر', id:'Kunai Ledak', pl:'Wybuchowy kunai' },
  '혈우병': { en:'Hemophilia', ja:'血友病', zh:'血友病', fr:'Hémophilie', de:'Hämophilie', es:'Hemofilia', it:'Emofilia', pt:'Hemofilia', ru:'Гемофилия', tr:'Hemofili', ar:'هيموفيليا', id:'Hemofilia', pl:'Hemofilia' },
  '화상': { en:'Burn', ja:'火傷', zh:'燃烧', fr:'Brûlure', de:'Verbrennung', es:'Quemadura', it:'Bruciatura', pt:'Queimadura', ru:'Ожог', tr:'Yanık', ar:'حرق', id:'Luka Bakar', pl:'Poparzenie' },
  '얼리다': { en:'Freeze', ja:'凍結', zh:'冻结', fr:'Geler', de:'Einfrieren', es:'Congelar', it:'Congelare', pt:'Congelar', ru:'Заморозить', tr:'Dondurmak', ar:'تجميد', id:'Membekukan', pl:'Zamrożenie' },
  '불타는 바닥': { en:'Burning Ground', ja:'燃える地面', zh:'燃烧地面', fr:'Sol brûlant', de:'Brennender Boden', es:'Suelo ardiente', it:'Terreno infuocato', pt:'Chão ardente', ru:'Горящая земля', tr:'Yanan Zemin', ar:'أرض محترقة', id:'Tanah Terbakar', pl:'Płonąca ziemia' },
  '전위': { en:'Charge', ja:'チャージ', zh:'冲锋', fr:'Charge', de:'Ladung', es:'Carga', it:'Carica', pt:'Carga', ru:'Рывок', tr:'Hücum', ar:'شحنة', id:'Tubrukan', pl:'Szarża' },
  '전투 깃발': { en:'War Banner', ja:'戦旗', zh:'战旗', fr:'Bannière de guerre', de:'Kriegsbanner', es:'Estandarte de guerra', it:'Stendardo di guerra', pt:'Bandeira de guerra', ru:'Боевое знамя', tr:'Savaş Bayrağı', ar:'راية الحرب', id:'Bendera Perang', pl:'Sztandar wojenny' },
  '감지': { en:'Detect', ja:'探知', zh:'探测', fr:'Détecter', de:'Erkennen', es:'Detectar', it:'Rilevare', pt:'Detectar', ru:'Обнаружение', tr:'Tespit', ar:'كشف', id:'Deteksi', pl:'Wykrycie' },
  '연막': { en:'Smoke Screen', ja:'煙幕', zh:'烟幕', fr:'Écran de fumée', de:'Nebelwand', es:'Pantalla de humo', it:'Cortina di fumo', pt:'Cortina de fumaça', ru:'Дымовая завеса', tr:'Duman Perdesi', ar:'ستار دخاني', id:'Tabir Asap', pl:'Zasłona dymna' },
  '얼음 갑옷': { en:'Ice Armor', ja:'アイスアーマー', zh:'冰甲', fr:'Armure de glace', de:'Eispanzer', es:'Armadura de hielo', it:'Armatura di ghiaccio', pt:'Armadura de gelo', ru:'Ледяная броня', tr:'Buz Zırhı', ar:'درع جليدي', id:'Baju Besi Es', pl:'Lodowa zbroja' },
  '텔레포트': { en:'Teleport', ja:'テレポート', zh:'传送', fr:'Téléportation', de:'Teleportation', es:'Teletransporte', it:'Teletrasporto', pt:'Teletransporte', ru:'Телепортация', tr:'Işınlanma', ar:'انتقال آني', id:'Teleportasi', pl:'Teleportacja' },
  '성역': { en:'Sanctuary', ja:'聖域', zh:'圣域', fr:'Sanctuaire', de:'Heiligtum', es:'Santuario', it:'Santuario', pt:'Santuário', ru:'Святилище', tr:'Sığınak', ar:'ملاذ', id:'Tempat Suci', pl:'Sanktuarium' },
  '노바': { en:'Nova', ja:'ノヴァ', zh:'新星', fr:'Nova', de:'Nova', es:'Nova', it:'Nova', pt:'Nova', ru:'Нова', tr:'Nova', ar:'نوفا', id:'Nova', pl:'Nova' },
  '화상 (카노)': { en:'Burn (Kano)', ja:'火傷 (カノ)', zh:'燃烧 (卡诺)', fr:'Brûlure (Kano)', de:'Verbrennung (Kano)', es:'Quemadura (Kano)', it:'Bruciatura (Kano)', pt:'Queimadura (Kano)', ru:'Ожог (Кано)', tr:'Yanık (Kano)', ar:'حرق (كانو)', id:'Luka Bakar (Kano)', pl:'Poparzenie (Kano)' },
  '활력 부여': { en:'Invigorate', ja:'活力付与', zh:'注入活力', fr:'Revigorer', de:'Beleben', es:'Vigorizar', it:'Rinvigorire', pt:'Revigorar', ru:'Оживление', tr:'Canlandırma', ar:'تنشيط', id:'Memberi Energi', pl:'Dodać wigoru' },
  '회전 칼날': { en:'Spinning Blade', ja:'回転刃', zh:'旋转之刃', fr:'Lame tournante', de:'Rotierendes Schwert', es:'Cuchilla giratoria', it:'Lama rotante', pt:'Lâmina giratória', ru:'Вращающееся лезвие', tr:'Döner Bıçak', ar:'شفرة دوارة', id:'Pisau Berputar', pl:'Wirujące ostrze' },
  '영혼 분리': { en:'Soul Separation', ja:'魂の分離', zh:'灵魂分离', fr:'Séparation de l\'âme', de:'Seelentrennung', es:'Separación de alma', it:'Separazione dell\'anima', pt:'Separação de alma', ru:'Разделение души', tr:'Ruh Ayrımı', ar:'فصل الروح', id:'Pemisahan Jiwa', pl:'Oddzielenie duszy' },
  '영혼 폭발': { en:'Soul Explosion', ja:'魂の爆発', zh:'灵魂爆发', fr:'Explosion de l\'âme', de:'Seelenexplosion', es:'Explosión de alma', it:'Esplosione dell\'anima', pt:'Explosão de alma', ru:'Взрыв души', tr:'Ruh Patlaması', ar:'انفجار الروح', id:'Ledakan Jiwa', pl:'Eksplozja duszy' },
  '영혼결속사': { en:'Soulbinder', ja:'ソウルバインダー', zh:'灵魂缚者', fr:'Lieur d\'âmes', de:'Seelenbinder', es:'Ataalmas', it:'Vincola-anime', pt:'Ata-almas', ru:'Связыватель душ', tr:'Ruh Bağlayıcı', ar:'رابط الأرواح', id:'Pengikat Jiwa', pl:'Łącznik dusz' },
  '모두': { en:'All', ja:'全て', zh:'全部', fr:'Tous', de:'Alle', es:'Todos', it:'Tutti', pt:'Todos', ru:'Все', tr:'Hepsi', ar:'الكل', id:'Semua', pl:'Wszystko' },
  '아우렐리온 솔': { en:'Solar Flare', ja:'ソーラーフレア', zh:'太阳耀斑', fr:'Éruption solaire', de:'Sonneneruption', es:'Llamarada solar', it:'Eruzione solare', pt:'Erupção solar', ru:'Солнечная вспышка', tr:'Güneş Patlaması', ar:'توهج شمسي', id:'Suar Matahari', pl:'Rozbłysk słoneczny' },
  '화염 파도': { en:'Flame Spread', ja:'炎の伝播', zh:'火焰传播', fr:'Propagation de flamme', de:'Flammenausbreitung', es:'Propagación de llamas', it:'Diffusione di fiamma', pt:'Propagação de chama', ru:'Распространение огня', tr:'Alev Yayılımı', ar:'انتشار اللهب', id:'Penyebaran Api', pl:'Rozprzestrzenianie ognia' },
  '얼음 구체': { en:'Ice Sphere', ja:'アイスボール', zh:'冰球', fr:'Sphère de glace', de:'Eiskugel', es:'Esfera de hielo', it:'Sfera di ghiaccio', pt:'Esfera de gelo', ru:'Ледяная сфера', tr:'Buz Küresi', ar:'كرة جليدية', id:'Bola Es', pl:'Lodowa kula' },
  '악마 군단': { en:'Demon Legion', ja:'悪魔軍団', zh:'恶魔军团', fr:'Légion démoniaque', de:'Dämonenlegion', es:'Legión demoníaca', it:'Legione demoniaca', pt:'Legião demoníaca', ru:'Легион демонов', tr:'Şeytan Lejyonu', ar:'فيلق شيطاني', id:'Legiun Iblis', pl:'Legion demonów' },
  '신성한 대지': { en:'Holy Ground', ja:'聖なる地', zh:'神圣大地', fr:'Terre sacrée', de:'Heiliger Boden', es:'Tierra sagrada', it:'Terra sacra', pt:'Terra sagrada', ru:'Святая земля', tr:'Kutsal Toprak', ar:'أرض مقدسة', id:'Tanah Suci', pl:'Święta ziemia' },
  '속성 공명': { en:'Elemental Resonance', ja:'属性共鳴', zh:'元素共鸣', fr:'Résonance élémentaire', de:'Elementarresonanz', es:'Resonancia elemental', it:'Risonanza elementale', pt:'Ressonância elemental', ru:'Элементальный резонанс', tr:'Elemental Rezonans', ar:'رنين عنصري', id:'Resonansi Elemen', pl:'Rezonans żywiołów' },
  '시간 거품': { en:'Time Bubble', ja:'タイムバブル', zh:'时间泡泡', fr:'Bulle temporelle', de:'Zeitblase', es:'Burbuja temporal', it:'Bolla temporale', pt:'Bolha temporal', ru:'Временной пузырь', tr:'Zaman Balonu', ar:'فقاعة زمنية', id:'Gelembung Waktu', pl:'Bańka czasu' },
  '화염구': { en:'Fireball', ja:'ファイアボール', zh:'火球', fr:'Boule de Feu', de:'Feuerball', es:'Bola de Fuego', it:'Palla di Fuoco', pt:'Bola de Fogo', ru:'Огненный Шар', tr:'Ateş Topu', ar:'كرة النار', id:'Bola Api', pl:'Kula Ognia' },
  '번개 노바': { en:'Lightning Nova', ja:'ライトニングノヴァ', zh:'闪电新星', fr:'Nova de foudre', de:'Blitznova', es:'Nova de rayo', it:'Nova fulminea', pt:'Nova de raio', ru:'Молниеносная нова', tr:'Yıldırım Novası', ar:'نوفا البرق', id:'Nova Petir', pl:'Nova błyskawic' },
  '감속': { en:'Slow', ja:'スロウ', zh:'减速', fr:'Ralentissement', de:'Verlangsamung', es:'Ralentizar', it:'Rallentamento', pt:'Lentidão', ru:'Замедление', tr:'Yavaşlatma', ar:'إبطاء', id:'Perlambatan', pl:'Spowolnienie' },

  // Common skill/affix terms
  '시전 확률': { en:'cast chance', ja:'発動確率', zh:'施法概率', fr:'chance de lancement', de:'Wirkungschance', es:'prob. de lanzamiento', it:'prob. di lancio', pt:'chance de conjuração', ru:'шанс применения', tr:'büyü şansı', ar:'فرصة الإلقاء', id:'peluang cast', pl:'szansa rzucenia' },
  '시전 시': { en:'on cast', ja:'詠唱時', zh:'施法时', fr:'au lancement', de:'beim Wirken', es:'al lanzar', it:'al lancio', pt:'ao conjurar', ru:'при применении', tr:'büyü atınca', ar:'عند الإلقاء', id:'saat cast', pl:'przy rzucaniu' },
  '타격 시': { en:'on hit', ja:'命中時', zh:'命中时', fr:'au toucher', de:'bei Treffer', es:'al golpear', it:'al colpo', pt:'ao acertar', ru:'при ударе', tr:'vurulduğunda', ar:'عند الضرب', id:'saat mengenai', pl:'przy trafieniu' },
  '피격 시': { en:'when hit', ja:'被弾時', zh:'被击时', fr:'quand touché', de:'bei erh. Treffer', es:'al ser golpeado', it:'quando colpito', pt:'ao ser atingido', ru:'при получ. удара', tr:'vurulunca', ar:'عند التعرض', id:'saat terkena', pl:'przy otrzymaniu' },
  '모든 기술': { en:'all skills', ja:'全スキル', zh:'全技能', fr:'toutes compétences', de:'alle Fähigkeiten', es:'todas las habilidades', it:'tutte le abilità', pt:'todas habilidades', ru:'все умения', tr:'tüm beceriler', ar:'جميع المهارات', id:'semua skill', pl:'wszystkie umiejętności' },
  '확률': { en:'chance', ja:'確率', zh:'概率', fr:'chance', de:'Chance', es:'prob.', it:'prob.', pt:'chance', ru:'шанс', tr:'şans', ar:'فرصة', id:'peluang', pl:'szansa' },

  // Affix text patterns
  '만큼 증가': { en:'increased by', ja:'増加', zh:'增加', fr:'augmenté de', de:'erhöht um', es:'aumentado en', it:'aumentato di', pt:'aumentado em', ru:'увеличен на', tr:'artış', ar:'زيادة بمقدار', id:'meningkat sebesar', pl:'zwiększone o' },
  '유일무이:': { en:'Unique:', ja:'ユニーク:', zh:'唯一:', fr:'Unique :', de:'Einzigartig:', es:'Único:', it:'Unico:', pt:'Único:', ru:'Уникальный:', tr:'Eşsiz:', ar:'فريد:', id:'Unik:', pl:'Unikatowy:' },
  '세트:': { en:'Set:', ja:'セット:', zh:'套装:', fr:'Ensemble :', de:'Set:', es:'Conjunto:', it:'Set:', pt:'Conjunto:', ru:'Набор:', tr:'Set:', ar:'طقم:', id:'Set:', pl:'Zestaw:' },
  '기술에 더함': { en:'added to skills', ja:'技能に追加', zh:'添加到技能', fr:'ajouté aux compétences', de:'zu Fähigkeiten hinzugefügt', es:'añadido a habilidades', it:'aggiunto alle abilità', pt:'adicionado a habilidades', ru:'добавлено к умениям', tr:'becerilere eklendi', ar:'مضاف إلى المهارات', id:'ditambahkan ke keterampilan', pl:'dodane do umiejętności' },
  '발동 확률': { en:'activation chance', ja:'発動確率', zh:'触发概率', fr:'chance d\'activation', de:'Aktivierungschance', es:'probabilidad de activación', it:'probabilità di attivazione', pt:'chance de ativação', ru:'шанс активации', tr:'tetikleme şansı', ar:'فرصة تفعيل', id:'peluang aktivasi', pl:'szansa aktywacji' },

  // Skill trigger conditions
  '사용시': { en:'On Use', ja:'使用時', zh:'使用时', fr:'À l\'utilisation', de:'Bei Nutzung', es:'Al usar', it:'All\'uso', pt:'Ao usar', ru:'При использ.', tr:'Kullanımda', ar:'عند الاستخدام', id:'Saat Digunakan', pl:'Przy użyciu' },
  '시전시': { en:'On Cast', ja:'詠唱時', zh:'施法时', fr:'Au lancement', de:'Beim Wirken', es:'Al lanzar', it:'Al lancio', pt:'Ao conjurar', ru:'При применении', tr:'Büyü Atınca', ar:'عند الإلقاء', id:'Saat Cast', pl:'Przy rzucaniu' },
  '장착시': { en:'On Equip', ja:'装備時', zh:'装备时', fr:'À l\'équipement', de:'Beim Anlegen', es:'Al equipar', it:'All\'equipaggiamento', pt:'Ao equipar', ru:'При экипировке', tr:'Kuşanınca', ar:'عند التجهيز', id:'Saat Dipakai', pl:'Przy założeniu' },
  '타격시': { en:'On Hit', ja:'命中時', zh:'命中时', fr:'Au toucher', de:'Bei Treffer', es:'Al golpear', it:'Al colpo', pt:'Ao acertar', ru:'При ударе', tr:'Vurulduğunda', ar:'عند الضرب', id:'Saat Mengenai', pl:'Przy trafieniu' },
  '피격시': { en:'When Hit', ja:'被弾時', zh:'被击时', fr:'Quand touché', de:'Bei Treffer erhalten', es:'Al ser golpeado', it:'Quando colpito', pt:'Ao ser atingido', ru:'При получ. удара', tr:'Vurulunca', ar:'عند التعرض للضرب', id:'Saat Terkena', pl:'Przy otrzymaniu' },

  // Short stat/term names (in LP but may be filtered by gameIndex length)
  '힘': { en:'Strength', ja:'力', zh:'力量', fr:'Force', de:'Stärke', es:'Fuerza', it:'Forza', pt:'Força', ru:'Сила', tr:'Güç', ar:'قوة', id:'Kekuatan', pl:'Siła' },
  '정신': { en:'Spirits', ja:'精神', zh:'精神', fr:'Esprits', de:'Geist', es:'Espíritu', it:'Spirito', pt:'Espírito', ru:'Дух', tr:'Ruh', ar:'روح', id:'Semangat', pl:'Duch' },
  '치명타': { en:'Crit', ja:'クリティカル', zh:'暴击', fr:'Critique', de:'Kritisch', es:'Crítico', it:'Critico', pt:'Crítico', ru:'Крит.', tr:'Kritik', ar:'حرجة', id:'Kritis', pl:'Krytyczny' },
  '보너스': { en:'Bonus', ja:'ボーナス', zh:'加成', fr:'Bonus', de:'Bonus', es:'Bono', it:'Bonus', pt:'Bônus', ru:'Бонус', tr:'Bonus', ar:'مكافأة', id:'Bonus', pl:'Bonus' },
  '민첩성': { en:'Agility', ja:'敏捷性', zh:'敏捷', fr:'Agilité', de:'Beweglichkeit', es:'Agilidad', it:'Agilità', pt:'Agilidade', ru:'Ловкость', tr:'Çeviklik', ar:'رشاقة', id:'Kelincahan', pl:'Zwinność' },
  '피해': { en:'Damage', ja:'ダメージ', zh:'伤害', fr:'Dégâts', de:'Schaden', es:'Daño', it:'Danno', pt:'Dano', ru:'Урон', tr:'Hasar', ar:'ضرر', id:'Kerusakan', pl:'Obrażenia' },
  '방어': { en:'Defence', ja:'防御', zh:'防御', fr:'Défense', de:'Verteidigung', es:'Defensa', it:'Difesa', pt:'Defesa', ru:'Защита', tr:'Savunma', ar:'دفاع', id:'Pertahanan', pl:'Obrona' },

  // Affix text grammar/common words
  '내구성': { en:'Durability', ja:'耐久性', zh:'耐久', fr:'Durabilité', de:'Haltbarkeit', es:'Durabilidad', it:'Durabilità', pt:'Durabilidade', ru:'Прочность', tr:'Dayanıklılık', ar:'متانة', id:'Ketahanan', pl:'Wytrzymałość' },
  '증가': { en:'increased by', ja:'増加', zh:'增加', fr:'augmenté de', de:'erhöht um', es:'aumentado en', it:'aumentato di', pt:'aumentado em', ru:'увеличено на', tr:'artırıldı', ar:'زيادة', id:'meningkat', pl:'zwiększone o' },
  '부여': { en:'granted', ja:'付与', zh:'赋予', fr:'octroyé', de:'gewährt', es:'otorgado', it:'concesso', pt:'concedido', ru:'даровано', tr:'verildi', ar:'ممنوح', id:'diberikan', pl:'przyznano' },
  '장착 시': { en:'on equip', ja:'装備時', zh:'装备时', fr:'à l\'équipement', de:'beim Anlegen', es:'al equipar', it:'all\'equipaggiamento', pt:'ao equipar', ru:'при экипировке', tr:'kuşanınca', ar:'عند التجهيز', id:'saat dipakai', pl:'przy założeniu' },
  // Affix grammar words & short stat terms
  '원소': { en:'Elemental', ja:'属性', zh:'元素', fr:'Élémentaire', de:'Elementar', es:'Elemental', it:'Elementale', pt:'Elemental', ru:'Стихийный', tr:'Elemental', ar:'عنصري', id:'Elemen', pl:'Żywiołowy' },
  '스킬': { en:'Skills', ja:'スキル', zh:'技能', fr:'Compétences', de:'Fähigkeiten', es:'Habilidades', it:'Abilità', pt:'Habilidades', ru:'Умения', tr:'Beceriler', ar:'مهارات', id:'Skill', pl:'Umiejętności' },
  '건강': { en:'Health', ja:'体力', zh:'生命', fr:'Santé', de:'Gesundheit', es:'Salud', it:'Salute', pt:'Saúde', ru:'Здоровье', tr:'Sağlık', ar:'صحة', id:'Kesehatan', pl:'Zdrowie' },
  '생명': { en:'Life', ja:'生命', zh:'生命', fr:'Vie', de:'Leben', es:'Vida', it:'Vita', pt:'Vida', ru:'Жизнь', tr:'Hayat', ar:'حياة', id:'Kehidupan', pl:'Życie' },
  '에너지': { en:'Energy', ja:'エネルギー', zh:'能量', fr:'Énergie', de:'Energie', es:'Energía', it:'Energia', pt:'Energia', ru:'Энергия', tr:'Enerji', ar:'طاقة', id:'Energi', pl:'Energia' },
  '영혼': { en:'Soul', ja:'魂', zh:'灵魂', fr:'Âme', de:'Seele', es:'Alma', it:'Anima', pt:'Alma', ru:'Душа', tr:'Ruh', ar:'روح', id:'Jiwa', pl:'Dusza' },
  '행운의': { en:'Lucky', ja:'幸運の', zh:'幸运', fr:'Chanceux', de:'Glücks-', es:'Afortunado', it:'Fortunato', pt:'Sortudo', ru:'Удачный', tr:'Şanslı', ar:'محظوظ', id:'Beruntung', pl:'Szczęśliwy' },
  '이동': { en:'Movement', ja:'移動', zh:'移动', fr:'Déplacement', de:'Bewegung', es:'Movimiento', it:'Movimento', pt:'Movimento', ru:'Движение', tr:'Hareket', ar:'حركة', id:'Gerakan', pl:'Ruch' },
  '비용': { en:'Cost', ja:'コスト', zh:'消耗', fr:'Coût', de:'Kosten', es:'Coste', it:'Costo', pt:'Custo', ru:'Стоимость', tr:'Maliyet', ar:'تكلفة', id:'Biaya', pl:'Koszt' },
  '변경': { en:'Alteration', ja:'変化', zh:'变化', fr:'Altération', de:'Veränderung', es:'Alteración', it:'Alterazione', pt:'Alteração', ru:'Изменение', tr:'Değişim', ar:'تغيير', id:'Perubahan', pl:'Zmiana' },
  '발견': { en:'Find', ja:'発見', zh:'发现', fr:'Découverte', de:'Fund', es:'Hallazgo', it:'Trovata', pt:'Descoberta', ru:'Находка', tr:'Bulma', ar:'اكتشاف', id:'Penemuan', pl:'Znalezisko' },
  '구슬': { en:'Orb', ja:'オーブ', zh:'宝珠', fr:'Orbe', de:'Kugel', es:'Orbe', it:'Sfera', pt:'Orbe', ru:'Сфера', tr:'Küre', ar:'كرة', id:'Orb', pl:'Kula' },
  '드롭': { en:'Drop', ja:'ドロップ', zh:'掉落', fr:'Butin', de:'Drop', es:'Caída', it:'Caduta', pt:'Drop', ru:'Выпадение', tr:'Düşme', ar:'سقوط', id:'Drop', pl:'Drop' },
  '무게': { en:'Weight', ja:'重量', zh:'重量', fr:'Poids', de:'Gewicht', es:'Peso', it:'Peso', pt:'Peso', ru:'Вес', tr:'Ağırlık', ar:'وزن', id:'Berat', pl:'Waga' },
  '찾기': { en:'Find', ja:'発見', zh:'寻找', fr:'Trouver', de:'Finden', es:'Buscar', it:'Trovare', pt:'Encontrar', ru:'Поиск', tr:'Bul', ar:'بحث', id:'Cari', pl:'Szukaj' },
  '경험치': { en:'EXP', ja:'経験値', zh:'经验', fr:'EXP', de:'EXP', es:'EXP', it:'ESP', pt:'EXP', ru:'Опыт', tr:'EXP', ar:'خبرة', id:'EXP', pl:'EXP' },
  '회피': { en:'Evasion', ja:'回避', zh:'闪避', fr:'Esquive', de:'Ausweichen', es:'Evasión', it:'Evasione', pt:'Evasão', ru:'Уклонение', tr:'Kaçınma', ar:'مراوغة', id:'Menghindar', pl:'Unik' },
  '막기': { en:'Block', ja:'ブロック', zh:'格挡', fr:'Blocage', de:'Blocken', es:'Bloqueo', it:'Blocco', pt:'Bloqueio', ru:'Блок', tr:'Blok', ar:'صد', id:'Blok', pl:'Blok' },
  '최대': { en:'Max', ja:'最大', zh:'最大', fr:'Max', de:'Max', es:'Máx', it:'Max', pt:'Máx', ru:'Макс.', tr:'Maks', ar:'أقصى', id:'Maks', pl:'Maks' },
  '중량': { en:'Weight', ja:'重量', zh:'重量', fr:'Poids', de:'Gewicht', es:'Peso', it:'Peso', pt:'Peso', ru:'Вес', tr:'Ağırlık', ar:'وزن', id:'Berat', pl:'Waga' },
  '구체': { en:'Sphere', ja:'球体', zh:'球体', fr:'Sphère', de:'Kugel', es:'Esfera', it:'Sfera', pt:'Esfera', ru:'Сфера', tr:'Küre', ar:'كرة', id:'Bola', pl:'Kula' },
  '킬 시': { en:'on kill', ja:'キル時', zh:'击杀时', fr:'au kill', de:'bei Kill', es:'al matar', it:'all\'uccisione', pt:'ao matar', ru:'при убийстве', tr:'öldürünce', ar:'عند القتل', id:'saat membunuh', pl:'przy zabiciu' },
  '공격': { en:'Attack', ja:'攻撃', zh:'攻击', fr:'Attaque', de:'Angriff', es:'Ataque', it:'Attacco', pt:'Ataque', ru:'Атака', tr:'Saldırı', ar:'هجوم', id:'Serangan', pl:'Atak' },
  '훔치기': { en:'Steal', ja:'スティール', zh:'偷取', fr:'Vol', de:'Raub', es:'Robo', it:'Furto', pt:'Roubo', ru:'Кража', tr:'Çalma', ar:'سرقة', id:'Mencuri', pl:'Kradzież' },
  '통계': { en:'Stats', ja:'ステータス', zh:'属性', fr:'Stats', de:'Werte', es:'Estadísticas', it:'Statistiche', pt:'Atributos', ru:'Статы', tr:'İstatistikler', ar:'إحصائيات', id:'Status', pl:'Statystyki' },
  '물리적': { en:'Physical', ja:'物理的', zh:'物理', fr:'Physique', de:'Physisch', es:'Físico', it:'Fisico', pt:'Físico', ru:'Физический', tr:'Fiziksel', ar:'فيزيائي', id:'Fisik', pl:'Fizyczny' },
  '생명력': { en:'Vitality', ja:'生命力', zh:'生命力', fr:'Vitalité', de:'Vitalität', es:'Vitalidad', it:'Vitalità', pt:'Vitalidade', ru:'Жизненная сила', tr:'Canlılık', ar:'حيوية', id:'Vitalitas', pl:'Witalność' },
  '출혈': { en:'Bleed', ja:'出血', zh:'流血', fr:'Saignement', de:'Blutung', es:'Sangrado', it:'Sanguinamento', pt:'Sangramento', ru:'Кровотечение', tr:'Kanama', ar:'نزيف', id:'Pendarahan', pl:'Krwawienie' },
  '인간': { en:'Human', ja:'人間', zh:'人类', fr:'Humain', de:'Mensch', es:'Humano', it:'Umano', pt:'Humano', ru:'Человек', tr:'İnsan', ar:'بشري', id:'Manusia', pl:'Człowiek' },
  '행운': { en:'Luck', ja:'幸運', zh:'幸运', fr:'Chance', de:'Glück', es:'Suerte', it:'Fortuna', pt:'Sorte', ru:'Удача', tr:'Şans', ar:'حظ', id:'Keberuntungan', pl:'Szczęście' },
  '오니': { en:'Oni', ja:'オニ', zh:'鬼', fr:'Oni', de:'Oni', es:'Oni', it:'Oni', pt:'Oni', ru:'Они', tr:'Oni', ar:'أوني', id:'Oni', pl:'Oni' },
  '짐승': { en:'Beast', ja:'獣', zh:'野兽', fr:'Bête', de:'Bestie', es:'Bestia', it:'Bestia', pt:'Besta', ru:'Зверь', tr:'Canavar', ar:'وحش', id:'Binatang', pl:'Bestia' },
  '치유': { en:'Healing', ja:'治癒', zh:'治疗', fr:'Soin', de:'Heilung', es:'Curación', it:'Cura', pt:'Cura', ru:'Исцеление', tr:'İyileştirme', ar:'شفاء', id:'Penyembuhan', pl:'Leczenie' },
  '곤충': { en:'Insect', ja:'昆虫', zh:'昆虫', fr:'Insecte', de:'Insekt', es:'Insecto', it:'Insetto', pt:'Inseto', ru:'Насекомое', tr:'Böcek', ar:'حشرة', id:'Serangga', pl:'Owad' },
  '언데드': { en:'Undead', ja:'アンデッド', zh:'亡灵', fr:'Mort-vivant', de:'Untot', es:'No-muerto', it:'Non-morto', pt:'Morto-vivo', ru:'Нежить', tr:'Ölümsüz', ar:'موتى أحياء', id:'Undead', pl:'Nieumarły' },
  '파충류': { en:'Reptile', ja:'爬虫類', zh:'爬行动物', fr:'Reptile', de:'Reptil', es:'Reptil', it:'Rettile', pt:'Réptil', ru:'Рептилия', tr:'Sürüngen', ar:'زاحف', id:'Reptil', pl:'Gad' },
  '금': { en:'Gold', ja:'金', zh:'金', fr:'Or', de:'Gold', es:'Oro', it:'Oro', pt:'Ouro', ru:'Золото', tr:'Altın', ar:'ذهب', id:'Emas', pl:'Złoto' },
  '가시': { en:'Thorns', ja:'棘', zh:'荆棘', fr:'Épines', de:'Dornen', es:'Espinas', it:'Spine', pt:'Espinhos', ru:'Шипы', tr:'Dikenler', ar:'أشواك', id:'Duri', pl:'Ciernie' },
  '해양': { en:'Marine', ja:'海洋', zh:'海洋', fr:'Marin', de:'Meeres-', es:'Marino', it:'Marino', pt:'Marinho', ru:'Морской', tr:'Deniz', ar:'بحري', id:'Laut', pl:'Morski' },
  '제자': { en:'Disciple', ja:'弟子', zh:'弟子', fr:'Disciple', de:'Schüler', es:'Discípulo', it:'Discepolo', pt:'Discípulo', ru:'Ученик', tr:'Çırak', ar:'تلميذ', id:'Murid', pl:'Uczeń' },
  '계약자': { en:'Contractor', ja:'契約者', zh:'契约者', fr:'Contracteur', de:'Auftragnehmer', es:'Contratista', it:'Appaltatore', pt:'Contratante', ru:'Подрядчик', tr:'Yüklenici', ar:'متعاقد', id:'Kontraktor', pl:'Kontrahent' },
  '신성한': { en:'Holy', ja:'神聖な', zh:'神圣的', fr:'Sacré', de:'Heilig', es:'Sagrado', it:'Sacro', pt:'Sagrado', ru:'Священный', tr:'Kutsal', ar:'مقدس', id:'Suci', pl:'Święty' },
  '악마': { en:'Demon', ja:'悪魔', zh:'恶魔', fr:'Démon', de:'Dämon', es:'Demonio', it:'Demone', pt:'Demônio', ru:'Демон', tr:'Şeytan', ar:'شيطان', id:'Iblis', pl:'Demon' },
  '열상': { en:'Lacerate', ja:'裂傷', zh:'撕裂', fr:'Lacération', de:'Riss', es:'Laceración', it:'Lacerazione', pt:'Laceração', ru:'Рваная рана', tr:'Yırtık', ar:'تمزق', id:'Robek', pl:'Szarpnięcie' },
  '번개 화살': { en:'Lightning Arrow', ja:'雷矢', zh:'闪电箭', fr:'Flèche de foudre', de:'Blitzpfeil', es:'Flecha de rayo', it:'Freccia fulminea', pt:'Flecha de raio', ru:'Молниевая стрела', tr:'Yıldırım Oku', ar:'سهم البرق', id:'Panah Petir', pl:'Błyskawiczny strzał' },
  '돌진': { en:'Flurry', ja:'突進', zh:'突进', fr:'Rafale', de:'Sturm', es:'Embestida', it:'Carica', pt:'Investida', ru:'Натиск', tr:'Hücum', ar:'اندفاع', id:'Serbu', pl:'Szarża' },
  '방패': { en:'Shield', ja:'盾', zh:'盾', fr:'Bouclier', de:'Schild', es:'Escudo', it:'Scudo', pt:'Escudo', ru:'Щит', tr:'Kalkan', ar:'درع', id:'Perisai', pl:'Tarcza' },
  '전사': { en:'Warrior', ja:'戦士', zh:'战士', fr:'Guerrier', de:'Krieger', es:'Guerrero', it:'Guerriero', pt:'Guerreiro', ru:'Воин', tr:'Savaşçı', ar:'محارب', id:'Prajurit', pl:'Wojownik' },
  '탐욕': { en:'Greed', ja:'強欲', zh:'贪婪', fr:'Avidité', de:'Gier', es:'Avaricia', it:'Avidità', pt:'Ganância', ru:'Жадность', tr:'Açgözlülük', ar:'طمع', id:'Keserakahan', pl:'Chciwość' },
  '집중': { en:'Focus', ja:'集中', zh:'专注', fr:'Concentration', de:'Fokus', es:'Concentración', it:'Concentrazione', pt:'Foco', ru:'Фокус', tr:'Odaklanma', ar:'تركيز', id:'Fokus', pl:'Skupienie' },
  '사무라이': { en:'Samurai', ja:'侍', zh:'武士', fr:'Samouraï', de:'Samurai', es:'Samurái', it:'Samurai', pt:'Samurai', ru:'Самурай', tr:'Samuray', ar:'ساموراي', id:'Samurai', pl:'Samuraj' },
  '영혼결속자': { en:'Soulbinder', ja:'ソウルバインダー', zh:'灵魂缚者', fr:'Lieur d\'âmes', de:'Seelenbinder', es:'Ataalmas', it:'Vincola-anime', pt:'Ata-almas', ru:'Связыватель душ', tr:'Ruh Bağlayıcı', ar:'رابط الأرواح', id:'Pengikat Jiwa', pl:'Łącznik dusz' },
  '독성학': { en:'Toxicology', ja:'毒性学', zh:'毒理学', fr:'Toxicologie', de:'Toxikologie', es:'Toxicología', it:'Tossicologia', pt:'Toxicologia', ru:'Токсикология', tr:'Toksikoloji', ar:'سموم', id:'Toksikologi', pl:'Toksykologia' },
  '블랙홀': { en:'Black Hole', ja:'ブラックホール', zh:'黑洞', fr:'Trou noir', de:'Schwarzes Loch', es:'Agujero negro', it:'Buco nero', pt:'Buraco negro', ru:'Чёрная дыра', tr:'Kara Delik', ar:'ثقب أسود', id:'Lubang Hitam', pl:'Czarna dziura' },
  '흐름': { en:'Flow', ja:'フロー', zh:'流', fr:'Flux', de:'Fluss', es:'Flujo', it:'Flusso', pt:'Fluxo', ru:'Поток', tr:'Akış', ar:'تدفق', id:'Aliran', pl:'Przepływ' },
  '도탄': { en:'Ricochet', ja:'跳弾', zh:'跳弹', fr:'Ricochet', de:'Abpraller', es:'Rebote', it:'Rimbalzo', pt:'Ricochete', ru:'Рикошет', tr:'Sekme', ar:'ارتداد', id:'Pantulan', pl:'Rykoszet' },
  '심판': { en:'Judgement', ja:'審判', zh:'审判', fr:'Jugement', de:'Urteil', es:'Juicio', it:'Giudizio', pt:'Julgamento', ru:'Суд', tr:'Yargı', ar:'حكم', id:'Penghakiman', pl:'Sąd' },
  '암살': { en:'Assassinate', ja:'暗殺', zh:'暗杀', fr:'Assassinat', de:'Meuchelmord', es:'Asesinato', it:'Assassinio', pt:'Assassinato', ru:'Убийство', tr:'Suikast', ar:'اغتيال', id:'Pembunuhan', pl:'Zabójstwo' },
  '완전 방어': { en:'Perfect Guard', ja:'完全防御', zh:'完美防御', fr:'Garde parfaite', de:'Perfekte Parade', es:'Guardia perfecta', it:'Guardia perfetta', pt:'Guarda perfeita', ru:'Идеальная защита', tr:'Mükemmel Savunma', ar:'دفاع كامل', id:'Pertahanan Sempurna', pl:'Doskonała obrona' },
  '독화살': { en:'Venom Arrow', ja:'毒矢', zh:'毒箭', fr:'Flèche empoisonnée', de:'Giftpfeil', es:'Flecha venenosa', it:'Freccia avvelenata', pt:'Flecha venenosa', ru:'Ядовитая стрела', tr:'Zehir Oku', ar:'سهم سام', id:'Panah Beracun', pl:'Zatruta strzała' },
  '무모한 분노': { en:'Reckless Fury', ja:'無謀な怒り', zh:'鲁莽之怒', fr:'Fureur téméraire', de:'Rücksichtsloser Zorn', es:'Furia temeraria', it:'Furia sconsiderata', pt:'Fúria imprudente', ru:'Безрассудная ярость', tr:'Pervasız Öfke', ar:'غضب متهور', id:'Amukan Nekat', pl:'Lekkomyślna furia' },
  '약탈': { en:'Plunder', ja:'略奪', zh:'掠夺', fr:'Pillage', de:'Plünderung', es:'Saqueo', it:'Saccheggio', pt:'Saque', ru:'Грабёж', tr:'Yağma', ar:'نهب', id:'Jarahan', pl:'Grabież' },
  '파괴적': { en:'Destructive', ja:'破壊的', zh:'毁灭性', fr:'Destructeur', de:'Zerstörerisch', es:'Destructivo', it:'Distruttivo', pt:'Destrutivo', ru:'Разрушительный', tr:'Yıkıcı', ar:'مدمر', id:'Merusak', pl:'Niszczycielski' },
  '뱀': { en:'Serpent', ja:'蛇', zh:'蛇', fr:'Serpent', de:'Schlange', es:'Serpiente', it:'Serpente', pt:'Serpente', ru:'Змей', tr:'Yılan', ar:'ثعبان', id:'Ular', pl:'Wąż' },
  '휩쓸기': { en:'Sweep', ja:'スウィープ', zh:'横扫', fr:'Balayage', de:'Fegen', es:'Barrido', it:'Spazzata', pt:'Varredura', ru:'Размах', tr:'Süpürme', ar:'كسح', id:'Sapuan', pl:'Zamach' },
  '영혼 수확': { en:'Soul Harvest', ja:'魂の収穫', zh:'灵魂收割', fr:'Récolte d\'âmes', de:'Seelenernte', es:'Cosecha de almas', it:'Raccolta anime', pt:'Colheita de almas', ru:'Жатва душ', tr:'Ruh Hasadı', ar:'حصاد الأرواح', id:'Panen Jiwa', pl:'Żniwa dusz' },
  '천둥폭풍': { en:'Thunderstorm', ja:'雷嵐', zh:'雷暴', fr:'Orage', de:'Gewitter', es:'Tormenta eléctrica', it:'Temporale', pt:'Tempestade', ru:'Гроза', tr:'Gök Gürültüsü Fırtınası', ar:'عاصفة رعدية', id:'Badai Petir', pl:'Burza' },
  // Weapon page terms
  '양손': { en:'Two-hand', ja:'両手', zh:'双手', fr:'Deux mains', de:'Zweihand', es:'Dos manos', it:'Due mani', pt:'Duas mãos', ru:'Двуруч.', tr:'Çift El', ar:'يدين', id:'Dua Tangan', pl:'Dwuręczne' },
  '한손': { en:'One-hand', ja:'片手', zh:'单手', fr:'Une main', de:'Einhand', es:'Una mano', it:'Una mano', pt:'Uma mão', ru:'Одноруч.', tr:'Tek El', ar:'يد واحدة', id:'Satu Tangan', pl:'Jednoręczne' },
  '두 손 망치': { en:'Two-handed Mace', ja:'両手メイス', zh:'双手锤', fr:'Masse à deux mains', de:'Zweihandkeule', es:'Maza a dos manos', it:'Mazza a due mani', pt:'Maça a duas mãos', ru:'Двуручная булава', tr:'Çift El Topuzu', ar:'صولجان بيدين', id:'Gada Dua Tangan', pl:'Maczuga dwuręczna' },
  '망치': { en:'Mace', ja:'メイス', zh:'锤', fr:'Masse', de:'Keule', es:'Maza', it:'Mazza', pt:'Maça', ru:'Булава', tr:'Topuz', ar:'صولجان', id:'Gada', pl:'Maczuga' },

  '서리': { en:'Frost', ja:'霜', zh:'霜', fr:'Givre', de:'Frost', es:'Escarcha', it:'Gelo', pt:'Geada', ru:'Мороз', tr:'Ayaz', ar:'صقيع', id:'Es', pl:'Mróz' },
  '소환': { en:'Summon', ja:'召喚', zh:'召唤', fr:'Invocation', de:'Beschwörung', es:'Invocación', it:'Evocazione', pt:'Invocação', ru:'Призыв', tr:'Çağırma', ar:'استدعاء', id:'Pemanggilan', pl:'Przywołanie' },
  '화살': { en:'Arrow', ja:'矢', zh:'箭', fr:'Flèche', de:'Pfeil', es:'Flecha', it:'Freccia', pt:'Flecha', ru:'Стрела', tr:'Ok', ar:'سهم', id:'Panah', pl:'Strzała' },
  '번개': { en:'Lightning', ja:'雷', zh:'闪电', fr:'Foudre', de:'Blitz', es:'Rayo', it:'Fulmine', pt:'Raio', ru:'Молния', tr:'Yıldırım', ar:'برق', id:'Petir', pl:'Błyskawica' },
  '신속': { en:'Haste', ja:'迅速', zh:'迅捷', fr:'Hâte', de:'Eile', es:'Prisa', it:'Fretta', pt:'Pressa', ru:'Спешка', tr:'Acele', ar:'عجلة', id:'Tergesa', pl:'Pośpiech' },
  '수': { en:'Water', ja:'水', zh:'水', fr:'Eau', de:'Wasser', es:'Agua', it:'Acqua', pt:'Água', ru:'Вода', tr:'Su', ar:'ماء', id:'Air', pl:'Woda' },
  '불균형': { en:'Imbalance', ja:'不均衡', zh:'失衡', fr:'Déséquilibre', de:'Ungleichgewicht', es:'Desequilibrio', it:'Squilibrio', pt:'Desequilíbrio', ru:'Дисбаланс', tr:'Dengesizlik', ar:'اختلال', id:'Ketidakseimbangan', pl:'Nierównowaga' },
  '기절': { en:'Stun', ja:'気絶', zh:'眩晕', fr:'Étourdissement', de:'Betäubung', es:'Aturdimiento', it:'Stordimento', pt:'Atordoamento', ru:'Оглушение', tr:'Sersemletme', ar:'صعق', id:'Setrum', pl:'Ogłuszenie' },
  '뿌리': { en:'Root', ja:'根', zh:'束缚', fr:'Racine', de:'Wurzel', es:'Raíz', it:'Radice', pt:'Raiz', ru:'Корень', tr:'Kök', ar:'جذر', id:'Akar', pl:'Korzeń' },
  '동결': { en:'Freeze', ja:'凍結', zh:'冻结', fr:'Gel', de:'Einfrieren', es:'Congelación', it:'Congelamento', pt:'Congelamento', ru:'Заморозка', tr:'Dondurma', ar:'تجميد', id:'Pembekuan', pl:'Zamrożenie' },
  '화상 저항': { en:'Burn Resistance', ja:'火傷耐性', zh:'灼烧抗性', fr:'Résistance brûlure', de:'Verbrennungswiderstand', es:'Resistencia quemadura', it:'Resistenza bruciatura', pt:'Resistência queimadura', ru:'Сопр. ожогу', tr:'Yanık Direnci', ar:'مقاومة الحروق', id:'Resistensi Luka Bakar', pl:'Odporność na poparzenie' },
  '공포': { en:'Fear', ja:'恐怖', zh:'恐惧', fr:'Peur', de:'Angst', es:'Miedo', it:'Paura', pt:'Medo', ru:'Страх', tr:'Korku', ar:'خوف', id:'Ketakutan', pl:'Strach' },
  '약화': { en:'Weaken', ja:'弱体化', zh:'虚弱', fr:'Affaiblir', de:'Schwächen', es:'Debilitar', it:'Indebolire', pt:'Enfraquecer', ru:'Ослабление', tr:'Zayıflatma', ar:'إضعاف', id:'Melemahkan', pl:'Osłabienie' },
  '저주': { en:'Curse', ja:'呪い', zh:'诅咒', fr:'Malédiction', de:'Fluch', es:'Maldición', it:'Maledizione', pt:'Maldição', ru:'Проклятие', tr:'Lanet', ar:'لعنة', id:'Kutukan', pl:'Klątwa' },
  '침묵': { en:'Silence', ja:'沈黙', zh:'沉默', fr:'Silence', de:'Stille', es:'Silencio', it:'Silenzio', pt:'Silêncio', ru:'Молчание', tr:'Sessizlik', ar:'صمت', id:'Diam', pl:'Cisza' },
  '반응': { en:'Reaction', ja:'反応', zh:'反应', fr:'Réaction', de:'Reaktion', es:'Reacción', it:'Reazione', pt:'Reação', ru:'Реакция', tr:'Tepki', ar:'تفاعل', id:'Reaksi', pl:'Reakcja' },
  '타격': { en:'Hit', ja:'打撃', zh:'打击', fr:'Coup', de:'Treffer', es:'Golpe', it:'Colpo', pt:'Golpe', ru:'Удар', tr:'Vuruş', ar:'ضربة', id:'Pukulan', pl:'Cios' },
  '재생': { en:'Regen', ja:'再生', zh:'再生', fr:'Régénération', de:'Regeneration', es:'Regeneración', it:'Rigenerazione', pt:'Regeneração', ru:'Регенерация', tr:'Yenilenme', ar:'تجدد', id:'Regenerasi', pl:'Regeneracja' },
  '흡수': { en:'Steal', ja:'吸収', zh:'吸收', fr:'Vol', de:'Raub', es:'Robo', it:'Furto', pt:'Roubo', ru:'Кража', tr:'Çalma', ar:'سرقة', id:'Serap', pl:'Kradzież' },
  '저항': { en:'Resistance', ja:'耐性', zh:'抗性', fr:'Résistance', de:'Widerstand', es:'Resistencia', it:'Resistenza', pt:'Resistência', ru:'Сопротивление', tr:'Direnç', ar:'مقاومة', id:'Resistensi', pl:'Odporność' },
  '관통': { en:'Penetration', ja:'貫通', zh:'穿透', fr:'Pénétration', de:'Durchdringung', es:'Penetración', it:'Penetrazione', pt:'Penetração', ru:'Проникновение', tr:'Penetrasyon', ar:'اختراق', id:'Penetrasi', pl:'Penetracja' },
  '범위': { en:'Range', ja:'範囲', zh:'范围', fr:'Portée', de:'Reichweite', es:'Rango', it:'Portata', pt:'Alcance', ru:'Диапазон', tr:'Aralık', ar:'نطاق', id:'Jangkauan', pl:'Zasięg' },
  '속도': { en:'Speed', ja:'速度', zh:'速度', fr:'Vitesse', de:'Geschwindigkeit', es:'Velocidad', it:'Velocità', pt:'Velocidade', ru:'Скорость', tr:'Hız', ar:'سرعة', id:'Kecepatan', pl:'Szybkość' },
  '감소': { en:'Reduction', ja:'減少', zh:'减少', fr:'Réduction', de:'Reduktion', es:'Reducción', it:'Riduzione', pt:'Redução', ru:'Снижение', tr:'Azaltma', ar:'تقليل', id:'Pengurangan', pl:'Redukcja' },
  '모든': { en:'All', ja:'全', zh:'全', fr:'Tous', de:'Alle', es:'Todos', it:'Tutti', pt:'Todos', ru:'Все', tr:'Tüm', ar:'جميع', id:'Semua', pl:'Wszystkie' },
  '에 더함': { en:'added to', ja:'に追加', zh:'添加到', fr:'ajouté à', de:'hinzugefügt', es:'añadido a', it:'aggiunto a', pt:'adicionado a', ru:'добавлено к', tr:'eklendi', ar:'مضاف إلى', id:'ditambahkan ke', pl:'dodane do' },
  '스킬에 더함': { en:'added to skills', ja:'スキルに追加', zh:'添加到技能', fr:'ajouté aux compétences', de:'zu Fähigkeiten hinzugefügt', es:'añadido a habilidades', it:'aggiunto alle abilità', pt:'adicionado a habilidades', ru:'добавлено к умениям', tr:'becerilere eklendi', ar:'مضاف للمهارات', id:'ditambahkan ke skill', pl:'dodane do umiejętności' },

  // Single/short terms for skill name composition
  '넉백': { en:'Knockback', ja:'ノックバック', zh:'击退', fr:'Recul', de:'Rückstoß', es:'Retroceso', it:'Rinculo', pt:'Recuo', ru:'Отбрасывание', tr:'Geri İtme', ar:'ارتداد', id:'Knockback', pl:'Odrzut' },
  '랜덤': { en:'Random', ja:'ランダム', zh:'随机', fr:'Aléatoire', de:'Zufällig', es:'Aleatorio', it:'Casuale', pt:'Aleatório', ru:'Случайный', tr:'Rastgele', ar:'عشوائي', id:'Acak', pl:'Losowy' },
  '신성': { en:'Holy', ja:'神聖', zh:'神圣', fr:'Sacré', de:'Heilig', es:'Sagrado', it:'Sacro', pt:'Sagrado', ru:'Священный', tr:'Kutsal', ar:'مقدس', id:'Suci', pl:'Święty' },
  '변신': { en:'Transform', ja:'変身', zh:'变身', fr:'Transformation', de:'Verwandlung', es:'Transformación', it:'Trasformazione', pt:'Transformação', ru:'Превращение', tr:'Dönüşüm', ar:'تحويل', id:'Transformasi', pl:'Przemiana' },
  '불': { en:'Fire', ja:'火', zh:'火', fr:'Feu', de:'Feuer', es:'Fuego', it:'Fuoco', pt:'Fogo', ru:'Огонь', tr:'Ateş', ar:'نار', id:'Api', pl:'Ogień' },
  '속성': { en:'Elemental', ja:'属性', zh:'属性', fr:'Élémentaire', de:'Element', es:'Elemental', it:'Elementale', pt:'Elemental', ru:'Стихийный', tr:'Elemental', ar:'عنصري', id:'Elemen', pl:'Żywiołowy' },
  '실명': { en:'Blind', ja:'盲目', zh:'致盲', fr:'Aveugler', de:'Blenden', es:'Cegar', it:'Accecare', pt:'Cegar', ru:'Ослепление', tr:'Kör etme', ar:'عمى', id:'Buta', pl:'Oślepienie' },
  '연타': { en:'Flurry', ja:'乱れ打ち', zh:'连击', fr:'Rafale', de:'Hagel', es:'Ráfaga', it:'Raffica', pt:'Rajada', ru:'Порыв', tr:'Fırtına', ar:'سلسلة', id:'Serangan Cepat', pl:'Seria uderzeń' },
  '열정': { en:'Rampage', ja:'狂乱', zh:'狂暴', fr:'Rage', de:'Raserei', es:'Furia', it:'Furia', pt:'Fúria', ru:'Ярость', tr:'Hiddet', ar:'هياج', id:'Amukan', pl:'Szał' },
  '용의 숨결': { en:'Dragon Breath', ja:'ドラゴンブレス', zh:'龙息', fr:'Souffle de Dragon', de:'Drachenatem', es:'Aliento de Dragón', it:'Soffio del Drago', pt:'Sopro do Dragão', ru:'Дыхание Дракона', tr:'Ejderha Nefesi', ar:'أنفاس التنين', id:'Nafas Naga', pl:'Oddech Smoka' },
  '용의 발톱': { en:'Dragon Claw', ja:'ドラゴンクロー', zh:'龙爪', fr:'Griffe de Dragon', de:'Drachenklaue', es:'Garra de Dragón', it:'Artiglio del Drago', pt:'Garra do Dragão', ru:'Коготь Дракона', tr:'Ejderha Pençesi', ar:'مخلب التنين', id:'Cakar Naga', pl:'Smocza Łapa' },
  '이중 일격': { en:'Double Strike', ja:'ダブルストライク', zh:'双重打击', fr:'Double Frappe', de:'Doppelter Schlag', es:'Doble Golpe', it:'Doppio Colpo', pt:'Golpe Duplo', ru:'Двойной Удар', tr:'Çifte Vuruş', ar:'ضربة مزدوجة', id:'Serangan Ganda', pl:'Podwójny Cios' },
  '이중 타격': { en:'Double Strike', ja:'ダブルストライク', zh:'双重打击', fr:'Double Frappe', de:'Doppelter Schlag', es:'Doble Golpe', it:'Doppio Colpo', pt:'Golpe Duplo', ru:'Двойной Удар', tr:'Çifte Vuruş', ar:'ضربة مزدوجة', id:'Serangan Ganda', pl:'Podwójny Cios' },
  '중독': { en:'Poison', ja:'中毒', zh:'中毒', fr:'Poison', de:'Gift', es:'Veneno', it:'Veleno', pt:'Veneno', ru:'Яд', tr:'Zehir', ar:'سم', id:'Racun', pl:'Trucizna' },
  '화염 타격': { en:'Flame Strike', ja:'フレイムストライク', zh:'烈焰打击', fr:'Frappe enflammée', de:'Flammenstoß', es:'Golpe de llamas', it:'Colpo di Fiamma', pt:'Golpe Flamejante', ru:'Удар пламени', tr:'Alev Vuruşu', ar:'ضربة لهب', id:'Serangan Api', pl:'Ognisty cios' },
  '눈부신 섬광': { en:'Blinding Flash', ja:'眩い閃光', zh:'致盲闪光', fr:'Éclat éblouissant', de:'Blendender Blitz', es:'Destello cegador', it:'Lampo accecante', pt:'Clarão ofuscante', ru:'Ослепляющая вспышка', tr:'Kör Edici Işık', ar:'ومضة مبهرة', id:'Kilatan Silau', pl:'Oślepiający błysk' },
  '원소술사': { en:'Elementalist', ja:'エレメンタリスト', zh:'元素师', fr:'Élémentaliste', de:'Elementarist', es:'Elementalista', it:'Elementalista', pt:'Elementalista', ru:'Элементалист', tr:'Elementalist', ar:'عنصري', id:'Elementalis', pl:'Elementalista' },
  '궁수': { en:'Archer', ja:'弓手', zh:'弓手', fr:'Archer', de:'Bogenschütze', es:'Arquero', it:'Arciere', pt:'Arqueiro', ru:'Лучник', tr:'Okçu', ar:'رامي', id:'Pemanah', pl:'Łucznik' },
  '도적': { en:'Bandit', ja:'盗賊', zh:'盗贼', fr:'Bandit', de:'Bandit', es:'Bandido', it:'Bandito', pt:'Bandido', ru:'Бандит', tr:'Haydut', ar:'لص', id:'Bandit', pl:'Bandyta' },
  '어둠': { en:'Dark', ja:'闇', zh:'暗', fr:'Ténèbres', de:'Dunkelheit', es:'Oscuridad', it:'Oscurità', pt:'Trevas', ru:'Тьма', tr:'Karanlık', ar:'ظلام', id:'Kegelapan', pl:'Ciemność' },

  // Element names
  '화염': { en:'Fire', ja:'火', zh:'火', fr:'Feu', de:'Feuer', es:'Fuego', it:'Fuoco', pt:'Fogo', ru:'Огонь', tr:'Ateş', ar:'نار', id:'Api', pl:'Ogień' },
  '공기': { en:'Air', ja:'風', zh:'风', fr:'Air', de:'Luft', es:'Aire', it:'Aria', pt:'Ar', ru:'Воздух', tr:'Hava', ar:'هواء', id:'Angin', pl:'Powietrze' },
  '물': { en:'Water', ja:'水', zh:'水', fr:'Eau', de:'Wasser', es:'Agua', it:'Acqua', pt:'Água', ru:'Вода', tr:'Su', ar:'ماء', id:'Air', pl:'Woda' },
  '독': { en:'Poison', ja:'毒', zh:'毒', fr:'Poison', de:'Gift', es:'Veneno', it:'Veleno', pt:'Veneno', ru:'Яд', tr:'Zehir', ar:'سم', id:'Racun', pl:'Trucizna' },
  '빛': { en:'Light', ja:'光', zh:'光', fr:'Lumière', de:'Licht', es:'Luz', it:'Luce', pt:'Luz', ru:'Свет', tr:'Işık', ar:'نور', id:'Cahaya', pl:'Światło' },
  '어둠': { en:'Dark', ja:'闇', zh:'暗', fr:'Ténèbres', de:'Dunkelheit', es:'Oscuridad', it:'Oscurità', pt:'Trevas', ru:'Тьма', tr:'Karanlık', ar:'ظلام', id:'Kegelapan', pl:'Ciemność' },
  '물리': { en:'Physical', ja:'物理', zh:'物理', fr:'Physique', de:'Physisch', es:'Físico', it:'Fisico', pt:'Físico', ru:'Физич.', tr:'Fiziksel', ar:'فيزيائي', id:'Fisik', pl:'Fizyczny' },
};
