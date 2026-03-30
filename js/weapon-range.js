const CATEGORY_LABELS = {
  '근접': { label: '근접', cls: 'wr-cat-melee' },
  '물리원거리': { label: '물리 원거리', cls: 'wr-cat-phys' },
  '마법원거리': { label: '마법 원거리', cls: 'wr-cat-magic' },
};

export async function renderWeaponRange(container) {
  let data;
  try {
    const res = await fetch('/item/json/Oniro_WeaponRange_Data.json');
    data = await res.json();
  } catch {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    return;
  }

  const constants = data['글로벌 상수'];
  const summary = data['요약 테이블'];

  // Build HTML
  let html = '';

  // Global constants cards
  html += '<div class="wr-constants">';
  html += buildConstantCard('근접 사정거리', constants.MELEE_DISTANCE.값, '모든 근접 무기 공통');
  html += buildConstantCard('원거리 사정거리 (NPC)', constants.RANGED_DISTANCE.값, 'NPC 기준');
  html += buildConstantCard('원거리 사정거리 (플레이어)', constants.PLAYER_RANGED_DISTANCE.값, '플레이어 기준');
  html += buildConstantCard('사정거리 허용 오차', constants.RANGE_TOLLERANCE.값, 'Dash 클래스');
  html += '</div>';

  // Weapon table
  html += '<div class="table-wrapper">';
  html += '<table class="item-table wr-table">';
  html += '<thead><tr>';
  html += '<th>무기</th><th>영문</th><th>카테고리</th><th>사정거리</th><th>투사체 속도</th><th>투사체 최대거리</th>';
  html += '</tr></thead><tbody>';

  for (const row of summary) {
    const cat = CATEGORY_LABELS[row.카테고리] || { label: row.카테고리, cls: '' };
    html += `<tr>`;
    html += `<td>${row.무기}</td>`;
    html += `<td class="wr-en">${row.영문}</td>`;
    html += `<td><span class="wr-cat-badge ${cat.cls}">${cat.label}</span></td>`;
    html += `<td class="wr-num">${row.사정거리}</td>`;
    html += `<td class="wr-num">${row.투사체속도 ?? '—'}</td>`;
    html += `<td class="wr-num">${row.투사체최대거리 ?? '—'}</td>`;
    html += `</tr>`;
  }

  html += '</tbody></table></div>';

  // Source info
  html += `<p class="wr-source">출처: ${data['메타정보']['소스']}</p>`;

  container.innerHTML = html;
}

function buildConstantCard(title, value, desc) {
  return `<div class="wr-const-card">
    <div class="wr-const-value">${value}</div>
    <div class="wr-const-title">${title}</div>
    <div class="wr-const-desc">${desc}</div>
  </div>`;
}
