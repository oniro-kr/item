import { loadData, getDB } from './data.js?v=2.1.1';
import { filterItems, paginate } from './search.js?v=2.1.1';
import {
  showLoading,
  renderTable,
  renderPagination,
  updateTabCounts,
  renderTypeTags,
  renderSubtypeTags,
  renderOptionTags,
  renderSkillTags,
  renderActiveFilters,
} from './render.js?v=2.1.1';
import { initModal, openItemDetail, setOnRatingSubmitted } from './item-detail.js?v=2.1.1';
import { debounce, parseHash, writeHash } from './utils.js?v=2.1.1';
import { initSupabase, fetchAllRatingSummaries } from './supabase.js?v=2.1.1';
import { renderWeaponRange } from './weapon-range.js?v=2.2.0';

/** Application state */
const state = {
  query: '',
  category: 'all',
  types: [],
  subtypes: [],
  options: [],
  skills: [],
  lvMin: null,
  lvMax: null,
  sortKey: 'level-desc',
  page: 1,
  perPage: 30,
};

/** Cached filtered results */
let filteredItems = [];

// ──────────── Init ────────────

async function init() {
  showLoading(true);

  try {
    const db = await loadData();

    // Restore from hash
    const hashState = parseHash();
    Object.assign(state, hashState);
    if (hashState.sort && hashState.order) {
      state.sortKey = `${hashState.sort}-${hashState.order}`;
    }

    // Init Supabase (non-blocking, ratings are optional)
    const supabaseReady = initSupabase();
    if (supabaseReady) {
      await fetchAllRatingSummaries();
    }

    // Init UI
    initModal();
    setOnRatingSubmitted(() => applyFilters());
    updateTabCounts(db.categoryCounts);
    syncUIFromState();
    applyFilters();

    // If hash has item, open it
    if (hashState.itemId) {
      const item = db.items.find(i => i.아이템ID === hashState.itemId);
      if (item) openItemDetail(item);
    }

    bindEvents();
    showLoading(false);
  } catch (err) {
    showLoading(false);
    console.error('Failed to load data:', err);
    document.getElementById('resultCount').textContent = '데이터 로딩 실패';
  }
}

// ──────────── Events ────────────

function bindEvents() {
  // Search input
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  const debouncedSearch = debounce(() => {
    state.query = searchInput.value.trim();
    state.page = 1;
    searchClear.hidden = !state.query;
    applyFilters();
  });

  searchInput.addEventListener('input', debouncedSearch);
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    state.page = 1;
    searchClear.hidden = true;
    applyFilters();
  });

  // Main page tabs
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const page = tab.dataset.page;
      document.getElementById('itemsPage').hidden = page !== 'items';
      document.getElementById('weaponRangePage').hidden = page !== 'weapon-range';
      if (page === 'weapon-range') {
        renderWeaponRange(document.getElementById('weaponRangeContent'));
      }
    });
  });

  // Category tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.category = tab.dataset.cat;
      state.types = [];
      state.subtypes = [];
      state.page = 1;
      syncUIFromState();
      applyFilters();
    });
  });

  // Dropdown toggles
  setupDropdown('typeToggle', 'typeDropdown');
  setupDropdown('subtypeToggle', 'subtypeDropdown');
  setupDropdown('optionToggle', 'optionDropdown');
  setupDropdown('skillToggle', 'skillDropdown');

  // Option search + filter
  document.getElementById('optionSearch').addEventListener('input', debounce((e) => {
    const db = getDB();
    if (db) renderOptionTags(db.uniqueOptions, state.options, e.target.value, handleOptionToggle);
  }, 200));

  // Skill search + filter
  document.getElementById('skillSearch').addEventListener('input', debounce((e) => {
    const db = getDB();
    if (db) renderSkillTags(db.uniqueSkills, state.skills, e.target.value, handleSkillToggle);
  }, 200));

  // Level inputs
  const lvMin = document.getElementById('lvMin');
  const lvMax = document.getElementById('lvMax');
  const debouncedLevel = debounce(() => {
    state.lvMin = lvMin.value ? +lvMin.value : null;
    state.lvMax = lvMax.value ? +lvMax.value : null;
    state.page = 1;
    applyFilters();
  });
  lvMin.addEventListener('input', debouncedLevel);
  lvMax.addEventListener('input', debouncedLevel);

  // Sort
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sortKey = e.target.value;
    state.page = 1;
    applyFilters();
  });

  // Per page
  document.getElementById('perPageSelect').addEventListener('change', (e) => {
    state.perPage = +e.target.value;
    state.page = 1;
    applyFilters();
  });

  // Table row clicks
  document.getElementById('itemTableBody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const id = +tr.dataset.id;
    const item = getDB().items.find(i => i.아이템ID === id);
    if (item) openItemDetail(item);
  });

  // Hash change
  window.addEventListener('hashchange', () => {
    const hashState = parseHash();
    Object.assign(state, hashState);
    syncUIFromState();
    applyFilters();
  });
}

// ──────────── Filter & Render ────────────

function applyFilters() {
  const db = getDB();
  if (!db) return;

  filteredItems = filterItems(db.items, state);
  const paged = paginate(filteredItems, state.page, state.perPage);

  renderTable(paged.items, paged.totalItems);
  renderPagination(paged.currentPage, paged.totalPages, (page) => {
    state.page = page;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Active filters
  renderActiveFilters(state, handleRemoveFilter, handleClearAll);

  // Update hash
  const [sort, order] = state.sortKey.split('-');
  writeHash({ ...state, sort, order });
}

function handleRemoveFilter(type, value) {
  switch (type) {
    case 'type':
      state.types = state.types.filter(t => t !== value);
      break;
    case 'subtype':
      state.subtypes = state.subtypes.filter(s => s !== value);
      break;
    case 'lvMin':
      state.lvMin = null;
      document.getElementById('lvMin').value = '';
      break;
    case 'option':
      state.options = state.options.filter(o => o !== value);
      break;
    case 'skill':
      state.skills = state.skills.filter(s => s !== value);
      break;
    case 'lvMax':
      state.lvMax = null;
      document.getElementById('lvMax').value = '';
      break;
  }
  state.page = 1;
  syncUIFromState();
  applyFilters();
}

function handleOptionToggle(optId) {
  toggleArrayItem(state.options, optId);
  updateToggleState('optionToggle', state.options);
  state.page = 1;
  syncUIFromState();
  applyFilters();
}

function handleSkillToggle(skillName) {
  toggleArrayItem(state.skills, skillName);
  updateToggleState('skillToggle', state.skills);
  state.page = 1;
  syncUIFromState();
  applyFilters();
}

function handleClearAll() {
  state.types = [];
  state.subtypes = [];
  state.options = [];
  state.skills = [];
  state.lvMin = null;
  state.lvMax = null;
  document.getElementById('lvMin').value = '';
  document.getElementById('lvMax').value = '';
  document.getElementById('optionSearch').value = '';
  document.getElementById('skillSearch').value = '';
  state.page = 1;
  syncUIFromState();
  applyFilters();
}

// ──────────── UI Sync ────────────

function syncUIFromState() {
  // Active tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === state.category);
  });

  // Search input
  document.getElementById('searchInput').value = state.query || '';
  document.getElementById('searchClear').hidden = !state.query;

  // Sort
  document.getElementById('sortSelect').value = state.sortKey;

  // Per page
  document.getElementById('perPageSelect').value = state.perPage;

  // Level
  document.getElementById('lvMin').value = state.lvMin || '';
  document.getElementById('lvMax').value = state.lvMax || '';

  // Type & Subtype tags
  const db = getDB();
  if (db) {
    const cat = state.category === 'all' ? null : state.category;

    // Type tags
    let types;
    if (cat) {
      types = db.typesByCategory[cat] || new Set();
    } else {
      types = new Set();
      for (const s of Object.values(db.typesByCategory)) {
        for (const v of s) types.add(v);
      }
    }
    renderTypeTags(types, state.types, (t) => {
      toggleArrayItem(state.types, t);
      updateToggleState('typeToggle', state.types);
      state.page = 1;
      syncUIFromState();
      applyFilters();
    });
    updateToggleState('typeToggle', state.types);

    // Subtype tags
    let subtypes;
    if (cat) {
      subtypes = db.subtypesByCategory[cat] || new Set();
    } else {
      subtypes = new Set();
      for (const s of Object.values(db.subtypesByCategory)) {
        for (const v of s) subtypes.add(v);
      }
    }
    renderSubtypeTags(subtypes, state.subtypes, (sub) => {
      toggleArrayItem(state.subtypes, sub);
      updateToggleState('subtypeToggle', state.subtypes);
      state.page = 1;
      syncUIFromState();
      applyFilters();
    });
    updateToggleState('subtypeToggle', state.subtypes);

    // Option tags
    renderOptionTags(db.uniqueOptions, state.options, document.getElementById('optionSearch').value, handleOptionToggle);
    updateToggleState('optionToggle', state.options);

    // Skill tags
    renderSkillTags(db.uniqueSkills, state.skills, document.getElementById('skillSearch').value, handleSkillToggle);
    updateToggleState('skillToggle', state.skills);
  }

}

// ──────────── Helpers ────────────

function toggleArrayItem(arr, item) {
  const idx = arr.indexOf(item);
  if (idx === -1) arr.push(item);
  else arr.splice(idx, 1);
}

function setupDropdown(toggleId, dropdownId) {
  const toggle = document.getElementById(toggleId);
  const dropdown = document.getElementById(dropdownId);

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    closeAllDropdowns();
    if (!isOpen) {
      dropdown.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
    }
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());
}

function closeAllDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(d => d.hidden = true);
  document.querySelectorAll('.filter-toggle').forEach(t => t.setAttribute('aria-expanded', 'false'));
}

function updateToggleState(toggleId, arr) {
  const toggle = document.getElementById(toggleId);
  toggle.classList.toggle('has-active', arr.length > 0);
}

// Close dropdowns on outside click
document.addEventListener('click', closeAllDropdowns);

// ──────────── Start ────────────
init();
