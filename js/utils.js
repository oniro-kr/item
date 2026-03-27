/** Debounce function */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Rarity display name → CSS class suffix */
export function rarityClass(rarity) {
  const map = { '일반': 'normal', '마법': 'magic', '희귀': 'rare', '전설': 'legendary' };
  return map[rarity] || 'normal';
}

/** Rarity sort weight (higher = rarer) */
export function rarityWeight(rarity) {
  const map = { '일반': 0, '마법': 1, '희귀': 2, '전설': 3 };
  return map[rarity] ?? 0;
}

/** Category grouping: 타입 → 대분류 */
export function categoryOf(type) {
  if (type === '무기') return '무기';
  if (['갑옷', '투구', '장갑', '신발', '벨트'].includes(type)) return '방어구';
  if (['반지', '부적', '귀걸이'].includes(type)) return '장신구';
  if (type === '보조무기') return '보조';
  return '기타';
}

/** Option ID → Korean display name (인게임 용어 기준) */
export const OPTION_NAMES = {
  0: 'None',
  1: '힘', 2: '정신', 3: '민첩성', 4: '의지', 5: '행운',
  6: '피해 보너스', 7: '물리적 피해', 8: '화염 피해', 9: '공기 피해',
  10: '수 피해', 11: '독 피해', 12: '빛 피해', 13: '어둠 피해',
  14: '인간 피해', 15: '오니 피해', 16: '언데드 피해', 17: '영혼 피해',
  18: '짐승 피해', 19: '파충류 피해', 20: '곤충 피해', 21: '해양 피해',
  22: '공격 속도', 23: '치명타 확률', 24: '치명타 피해 보너스',
  25: '최대 중량', 26: '화염 기술 피해', 27: '공기 기술 피해',
  28: '수 기술 피해', 29: '독 기술 피해', 30: '빛 기술 피해',
  31: '어둠 기술 피해', 32: '물리 기술 피해',
  34: '행운의 타격', 35: '행운의 반응',
  36: '방어', 37: '피해 감소',
  38: '물리적 저항', 39: '화염 저항', 40: '공기 저항',
  41: '수 저항', 42: '독 저항', 43: '빛 저항', 44: '어둠 저항',
  45: '인간 저항', 46: '오니 저항', 47: '언데드 저항', 48: '영혼 저항',
  49: '짐승 저항', 50: '파충류 저항', 51: '곤충 저항', 52: '해양 저항',
  53: '회피 확률', 54: '차단 확률', 55: '막기 피해 감소',
  56: '변경 감소', 57: '기절 저항', 58: '뿌리 저항', 59: '감속 저항',
  60: '동결 저항', 61: '화상 저항', 62: '출혈 저항', 63: '중독 저항',
  64: '공포 저항', 65: '불균형 저항', 66: '실명 저항', 67: '넉백 저항',
  68: '약화 저항', 69: '저주 저항', 70: '침묵 저항',
  71: '건강', 72: '건강 재생', 73: '치유 보너스', 74: '치유 기술 보너스',
  75: '이동속도', 76: '생명력 흡수', 77: '타격 시 생명', 78: '킬 시 생명',
  79: '가시',
  80: '에너지 흡수', 81: '에너지 비용 감소', 82: '에너지 재생',
  83: '킬 시 에너지', 85: '마법 찾기', 86: '금 발견',
  87: '구슬 드롭 확률', 88: '경험치 보너스', 89: '킬 시 경험치',
  90: '방어 관통', 91: '물리 관통', 92: '화염 관통',
  93: '공기 관통', 94: '수 관통', 96: '빛 관통', 97: '어둠 관통',
  98: '물리적 피해 범위', 99: '화염 피해 범위', 100: '공기 피해 범위',
  101: '수 피해 범위', 102: '독 피해 범위', 103: '빛 피해 범위',
  104: '어둠 피해 범위',
  105: '모든 통계', 106: '모든 저항',
};

/** Get display name for an option */
export function optionDisplayName(opt) {
  return OPTION_NAMES[opt.ID] || opt.이름 || `옵션 #${opt.ID}`;
}

/** Format option value */
export function formatOptionValue(opt) {
  if (opt.ID === 0) return '';
  const val = opt.실제값;
  // Percentage-like values
  if (opt.이름 && (opt.이름.includes('Chance') || opt.이름.includes('Speed') ||
      opt.이름.includes('Reduction') || opt.이름.includes('Bonus') ||
      opt.이름.includes('Steal') || opt.이름.includes('Find'))) {
    if (Math.abs(val) < 10 && val !== Math.floor(val)) {
      return `${val}`;
    }
  }
  return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, '');
}

/** Show toast notification */
export function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 2500);
}

/** Parse URL hash into state object */
export function parseHash() {
  const hash = location.hash.slice(1);
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const state = {};
  if (params.get('q')) state.query = params.get('q');
  if (params.get('cat')) state.category = params.get('cat');
  if (params.get('sub')) state.subtypes = params.get('sub').split(',');
  if (params.get('lvMin')) state.lvMin = +params.get('lvMin');
  if (params.get('lvMax')) state.lvMax = +params.get('lvMax');
  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('order')) state.order = params.get('order');
  if (params.get('page')) state.page = +params.get('page');
  if (params.get('item')) state.itemId = +params.get('item');
  return state;
}

/** Write state to URL hash */
export function writeHash(state) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.category && state.category !== 'all') params.set('cat', state.category);
  if (state.subtypes?.length) params.set('sub', state.subtypes.join(','));
  if (state.lvMin) params.set('lvMin', state.lvMin);
  if (state.lvMax) params.set('lvMax', state.lvMax);
  if (state.sort && state.sort !== 'level') params.set('sort', state.sort);
  if (state.order && state.order !== 'asc') params.set('order', state.order);
  if (state.page && state.page > 1) params.set('page', state.page);
  const str = params.toString();
  history.replaceState(null, '', str ? '#' + str : location.pathname);
}
