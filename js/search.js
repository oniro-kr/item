import { getRatingSummary } from './supabase.js?v=2.0.0';

/**
 * Filter and sort items based on current state.
 * Returns a new filtered/sorted array.
 */
export function filterItems(items, state) {
  let result = items;

  // Category filter
  if (state.category && state.category !== 'all') {
    result = result.filter(item => item._category === state.category);
  }

  // Subtype filter
  if (state.subtypes?.length) {
    const subs = new Set(state.subtypes);
    result = result.filter(item => item.세부타입 && subs.has(item.세부타입));
  }

  // Level range
  if (state.lvMin) {
    result = result.filter(item => item.레벨 >= state.lvMin);
  }
  if (state.lvMax) {
    result = result.filter(item => item.레벨 <= state.lvMax);
  }

  // Option filter (AND: must have all selected options)
  if (state.options?.length) {
    const optIds = new Set(state.options.map(Number));
    result = result.filter(item =>
      item.옵션 && optIds.size > 0 &&
      [...optIds].every(id => item.옵션.some(o => o.ID === id))
    );
  }

  // Skill filter (OR: must have at least one selected skill)
  if (state.skills?.length) {
    const skillSet = new Set(state.skills);
    result = result.filter(item =>
      item.스킬 && item.스킬.some(s =>
        skillSet.has(s['이름(한국어)'] || s.이름)
      )
    );
  }

  // Text search (spaces ignored)
  if (state.query) {
    const q = state.query.replace(/\s/g, '').toLowerCase();
    result = result.filter(item =>
      (item.한국어이름 || '').replace(/\s/g, '').toLowerCase().includes(q) ||
      (item.에디터이름 || '').replace(/\s/g, '').toLowerCase().includes(q) ||
      (item.내부이름 || '').replace(/\s/g, '').toLowerCase().includes(q)
    );
  }

  // Sort
  const [sortField, sortDir] = (state.sortKey || 'level-asc').split('-');
  const dir = sortDir === 'desc' ? -1 : 1;

  result.sort((a, b) => {
    switch (sortField) {
      case 'level':
        return (a.레벨 - b.레벨) * dir;
      case 'name':
        return a.한국어이름.localeCompare(b.한국어이름, 'ko') * dir;
      case 'rating': {
        const ra = getRatingSummary(a.아이템ID);
        const rb = getRatingSummary(b.아이템ID);
        return (ra.avg - rb.avg || ra.count - rb.count) * dir;
      }
      case 'id':
        return (a.아이템ID - b.아이템ID) * dir;
      default:
        return (a.레벨 - b.레벨) * dir;
    }
  });

  return result;
}

/**
 * Paginate results.
 * Returns { items, totalPages, currentPage }
 */
export function paginate(items, page = 1, perPage = 30) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.max(1, Math.min(page, totalPages));
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    totalPages,
    currentPage: current,
    totalItems: items.length,
  };
}
