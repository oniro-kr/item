import { rarityClass, optionDisplayName, formatOptionValue, OPTION_NAMES } from './utils.js?v=2.0.0';
import { getRatingSummary } from './supabase.js?v=2.0.0';

const tbody = document.getElementById('itemTableBody');
const paginationEl = document.getElementById('pagination');
const resultCountEl = document.getElementById('resultCount');
const loadingEl = document.getElementById('loading');
const noResultsEl = document.getElementById('noResults');

/** Render star icons for a rating (0-5) */
function renderStars(avg) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(avg)) {
      html += '<span class="star star-full">★</span>';
    } else if (i - avg < 1 && i - avg > 0) {
      html += '<span class="star star-half">★</span>';
    } else {
      html += '<span class="star star-empty">☆</span>';
    }
  }
  return html;
}

/** Exportable renderStars for item-detail */
export { renderStars };

/** Show/hide loading spinner */
export function showLoading(show) {
  loadingEl.hidden = !show;
}

/** Render the item table */
export function renderTable(pageItems, totalItems) {
  loadingEl.hidden = true;

  if (totalItems === 0) {
    tbody.innerHTML = '';
    noResultsEl.hidden = false;
    resultCountEl.textContent = '검색 결과가 없습니다';
    return;
  }

  noResultsEl.hidden = true;
  resultCountEl.textContent = `총 ${totalItems.toLocaleString()}건`;

  const fragment = document.createDocumentFragment();

  for (const item of pageItems) {
    const tr = document.createElement('tr');
    tr.dataset.id = item.아이템ID;

    // Level
    const tdLevel = document.createElement('td');
    tdLevel.className = 'col-level';
    tdLevel.textContent = item.레벨;

    // Name (with thumbnail)
    const tdName = document.createElement('td');
    tdName.className = 'col-name';
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'item-name-wrapper';
    const thumb = document.createElement('img');
    thumb.className = 'item-thumb';
    thumb.src = item.이미지 || 'img/no_image.svg';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.width = 36;
    thumb.height = 36;
    nameWrapper.appendChild(thumb);
    const nameText = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.className = `item-name rarity-text-${rarityClass(item.표시희귀도)}`;
    nameDiv.textContent = item.한국어이름 || item.내부이름;
    nameText.appendChild(nameDiv);
    const enDiv = document.createElement('div');
    enDiv.className = 'item-name-en';
    enDiv.textContent = item.에디터이름 || '';
    nameText.appendChild(enDiv);
    nameWrapper.appendChild(nameText);
    tdName.appendChild(nameWrapper);

    // Type
    const tdType = document.createElement('td');
    tdType.className = 'col-type';
    tdType.textContent = item.타입;

    // Subtype
    const tdSub = document.createElement('td');
    tdSub.className = 'col-subtype';
    tdSub.textContent = item.세부타입 || '-';

    // Rating
    const tdRating = document.createElement('td');
    tdRating.className = 'col-rating';
    const rs = getRatingSummary(item.아이템ID);
    if (rs.count > 0) {
      tdRating.innerHTML = `<span class="rating-stars">${renderStars(rs.avg)}</span> <span class="rating-avg">${rs.avg}</span><span class="rating-count">(${rs.count})</span>`;
    } else {
      tdRating.innerHTML = '<span class="rating-empty">-</span>';
    }

    // Options
    const tdOptions = document.createElement('td');
    tdOptions.className = 'col-options';
    if (item.옵션?.length) {
      const pills = document.createElement('div');
      pills.className = 'option-pills';
      const visibleOptions = item.옵션.filter(o => o.ID !== 0).slice(0, 4);
      for (const opt of visibleOptions) {
        const pill = document.createElement('span');
        pill.className = 'option-pill';
        const name = optionDisplayName(opt);
        const val = formatOptionValue(opt);
        pill.textContent = val ? `${name} ${val}` : name;
        pills.appendChild(pill);
      }
      if (item.옵션.filter(o => o.ID !== 0).length > 4) {
        const more = document.createElement('span');
        more.className = 'option-pill';
        more.textContent = `+${item.옵션.filter(o => o.ID !== 0).length - 4}`;
        pills.appendChild(more);
      }
      tdOptions.appendChild(pills);
    }

    // Skills
    const tdSkills = document.createElement('td');
    tdSkills.className = 'col-skills';
    if (item.스킬?.length) {
      const pills = document.createElement('div');
      pills.className = 'skill-pills';
      for (const skill of item.스킬) {
        const pill = document.createElement('span');
        pill.className = 'skill-pill';
        pill.textContent = skill['이름(한국어)'] || skill.이름;
        pills.appendChild(pill);
      }
      tdSkills.appendChild(pills);
    }

    tr.append(tdLevel, tdName, tdType, tdSub, tdRating, tdOptions, tdSkills);
    fragment.appendChild(tr);
  }

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

/** Render pagination */
export function renderPagination(currentPage, totalPages, onPageChange) {
  paginationEl.innerHTML = '';
  if (totalPages <= 1) return;

  const createBtn = (text, page, active = false, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = `page-btn${active ? ' active' : ''}`;
    btn.textContent = text;
    btn.disabled = disabled;
    if (!disabled && !active) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  };

  // Prev
  paginationEl.appendChild(createBtn('‹', currentPage - 1, false, currentPage <= 1));

  // Page numbers with ellipsis
  const pages = buildPageNumbers(currentPage, totalPages);
  for (const p of pages) {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '...';
      paginationEl.appendChild(span);
    } else {
      paginationEl.appendChild(createBtn(String(p), p, p === currentPage));
    }
  }

  // Next
  paginationEl.appendChild(createBtn('›', currentPage + 1, false, currentPage >= totalPages));
}

/** Build smart page number array */
function buildPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}

/** Update category tab counts */
export function updateTabCounts(counts) {
  const tabs = document.querySelectorAll('.tab');
  for (const tab of tabs) {
    const cat = tab.dataset.cat;
    const countEl = tab.querySelector('.tab-count');
    const count = counts[cat] ?? 0;
    countEl.textContent = `(${count.toLocaleString()})`;
  }
}

/** Render subtype filter tags */
export function renderSubtypeTags(subtypes, activeSubtypes, onToggle) {
  const container = document.getElementById('subtypeTags');
  container.innerHTML = '';
  if (!subtypes || subtypes.size === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">해당 카테고리에 세부타입이 없습니다</span>';
    return;
  }

  const sorted = [...subtypes].sort();
  for (const sub of sorted) {
    const btn = document.createElement('button');
    btn.className = `filter-tag${activeSubtypes.includes(sub) ? ' active' : ''}`;
    btn.textContent = sub;
    btn.addEventListener('click', () => onToggle(sub));
    container.appendChild(btn);
  }
}

/** Render option filter tags */
export function renderOptionTags(uniqueOptions, activeOptions, searchQuery, onToggle) {
  const container = document.getElementById('optionTags');
  container.innerHTML = '';
  const q = (searchQuery || '').toLowerCase();

  // Sort by Korean name
  const sorted = [...uniqueOptions.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  for (const [id, name] of sorted) {
    if (q && !name.toLowerCase().includes(q)) continue;
    const btn = document.createElement('button');
    btn.className = `filter-tag${activeOptions.includes(id) ? ' active' : ''}`;
    btn.textContent = name;
    btn.addEventListener('click', () => onToggle(id));
    container.appendChild(btn);
  }
  if (container.children.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">검색 결과 없음</span>';
  }
}

/** Render skill filter tags */
export function renderSkillTags(uniqueSkills, activeSkills, searchQuery, onToggle) {
  const container = document.getElementById('skillTags');
  container.innerHTML = '';
  const q = (searchQuery || '').toLowerCase();

  const sorted = [...uniqueSkills].sort((a, b) => a.localeCompare(b, 'ko'));
  for (const name of sorted) {
    if (q && !name.toLowerCase().includes(q)) continue;
    const btn = document.createElement('button');
    btn.className = `filter-tag${activeSkills.includes(name) ? ' active' : ''}`;
    btn.textContent = name;
    btn.addEventListener('click', () => onToggle(name));
    container.appendChild(btn);
  }
  if (container.children.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">검색 결과 없음</span>';
  }
}

/** Update active filters display */
export function renderActiveFilters(state, onRemove, onClearAll) {
  const container = document.getElementById('activeFilters');
  const list = document.getElementById('activeFiltersList');
  list.innerHTML = '';

  const badges = [];

  if (state.subtypes?.length) {
    for (const sub of state.subtypes) {
      badges.push({ label: `세부: ${sub}`, remove: () => onRemove('subtype', sub) });
    }
  }
  if (state.options?.length) {
    for (const optId of state.options) {
      badges.push({ label: `옵션: ${OPTION_NAMES[optId] || optId}`, remove: () => onRemove('option', optId) });
    }
  }
  if (state.skills?.length) {
    for (const sk of state.skills) {
      badges.push({ label: `스킬: ${sk}`, remove: () => onRemove('skill', sk) });
    }
  }
  if (state.lvMin) {
    badges.push({ label: `최소Lv ${state.lvMin}`, remove: () => onRemove('lvMin') });
  }
  if (state.lvMax) {
    badges.push({ label: `최대Lv ${state.lvMax}`, remove: () => onRemove('lvMax') });
  }

  if (badges.length === 0) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  for (const b of badges) {
    const el = document.createElement('span');
    el.className = 'active-filter-badge';
    el.innerHTML = `${b.label} <button class="active-filter-remove">&times;</button>`;
    el.querySelector('button').addEventListener('click', b.remove);
    list.appendChild(el);
  }

  document.getElementById('clearAllFilters').onclick = onClearAll;
}
