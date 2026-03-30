import { t, tGame } from './i18n.js?v=3.0.0';

const GUIDE_SECTIONS = [
  { key: '능력치 시스템', title: '능력치 시스템' },
  { key: '속성 시스템', title: '속성 시스템' },
  { key: '상태이상 시스템', title: '상태이상 시스템' },
  { key: '아이템 시스템', title: '아이템 시스템' },
  { key: '아이템 강화 시스템', title: '아이템 강화 시스템' },
  { key: '제작 시스템', title: '제작 시스템' },
  { key: '전투 공식', title: '전투 공식' },
  { key: '스킬 시스템', title: '스킬 시스템' },
  { key: '몬스터 시스템', title: '몬스터 시스템' },
  { key: '던전 시스템', title: '던전 시스템' },
  { key: '드랍 시스템', title: '드랍 시스템' },
  { key: '화폐 시스템', title: '화폐 시스템' },
  { key: '상점 시스템', title: '상점 시스템' },
];

export async function renderGuide(container) {
  let data;
  try {
    const res = await fetch('/item/json/Oniro_Guide_MasterData.json');
    data = await res.json();
  } catch {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:2rem;">${t('guide.loadFailed')}</p>`;
    return;
  }

  // Game info header
  const info = data['게임 정보'];
  let html = `<div class="guide-game-info">
    <span>${info['게임명']} v${info['버전']}</span>
    <span>${t('guide.dev')} ${info['개발사']}</span>
    <span>${info['데이터 출처']}</span>
  </div>`;

  // Accordion sections
  for (const sec of GUIDE_SECTIONS) {
    const sectionData = data[sec.key];
    if (!sectionData) continue;

    html += `<details class="guide-section" open>
      <summary class="guide-section-title">${tGame(sec.title)}</summary>
      <div class="guide-section-body">
        ${renderValue(sectionData)}
      </div>
    </details>`;
  }

  // 장비별 보조 옵션 풀 (별도 JSON)
  try {
    const slotRes = await fetch('/item/json/Oniro_ItemOptions_BySlot.json');
    const slotData = await slotRes.json();
    html += renderSlotOptions(slotData);
  } catch { /* 파일 없으면 무시 */ }

  // Limitations
  const limits = data['데이터 한계 및 미확인'];
  if (limits) {
    html += `<details class="guide-section">
      <summary class="guide-section-title">${t('guide.limits')}</summary>
      <div class="guide-section-body">
        ${renderValue(limits)}
      </div>
    </details>`;
  }

  container.innerHTML = html;
}

function renderValue(val, depth = 0) {
  if (val === null || val === undefined) return '';

  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return `<span class="guide-val">${val}</span>`;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    if (typeof val[0] !== 'object') {
      return '<div class="guide-tags">' +
        val.map(v => `<span class="guide-tag">${v}</span>`).join('') +
        '</div>';
    }
    return renderObjectArray(val);
  }

  let html = '<div class="guide-entries">';
  for (const [key, value] of Object.entries(val)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      html += `<div class="guide-entry">
        <span class="guide-key">${tGame(key)}</span>
        <span class="guide-val">${value}</span>
      </div>`;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] !== 'object') {
      html += `<div class="guide-entry">
        <span class="guide-key">${tGame(key)}</span>
        <div class="guide-tags">${value.map(v => `<span class="guide-tag">${v}</span>`).join('')}</div>
      </div>`;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      html += `<div class="guide-subsection">
        <div class="guide-subheading">${tGame(key)}</div>
        ${renderObjectArray(value)}
      </div>`;
    } else if (typeof value === 'object' && value !== null) {
      html += `<div class="guide-subsection">
        <div class="guide-subheading">${tGame(key)}</div>
        ${renderValue(value, depth + 1)}
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

function renderSlotOptions(data) {
  const pools = data['장비별 옵션 풀'];
  if (!pools) return '';

  let html = `<details class="guide-section" open>
    <summary class="guide-section-title">${t('guide.slotOptionsTitle')}</summary>
    <div class="guide-section-body">
      <p class="guide-slot-desc">${data['설명'] || ''}</p>
      <p class="guide-slot-source">${t('guide.source')} ${data['추출 방법'] || ''}</p>
      <div class="table-wrapper"><table class="item-table wr-table">
        <thead><tr>
          <th>${t('guide.slotEquip')}</th>
          <th>${t('guide.slotCat')}</th>
          <th>${t('guide.slotCount')}</th>
          <th>${t('guide.slotList')}</th>
          <th>${t('guide.slotStatus')}</th>
        </tr></thead><tbody>`;

  for (const [name, info] of Object.entries(pools)) {
    const optList = Array.isArray(info['옵션 목록'])
      ? info['옵션 목록'].map(o => {
          const optName = typeof o === 'string' ? o : o['옵션명'];
          return `<span class="guide-tag">${tGame(optName)}</span>`;
        }).join('')
      : `<span class="guide-val" style="font-size:0.75rem;color:var(--text-muted)">${info['옵션 목록'] || '—'}</span>`;

    const status = info['추출 상태'] === '완료'
      ? '<span style="color:var(--success)">완료</span>'
      : `<span style="color:var(--warning)">${info['추출 상태']}</span>`;

    html += `<tr>
      <td><strong>${tGame(name)}</strong></td>
      <td>${tGame(info['카테고리'] || '')}</td>
      <td style="text-align:center">${info['옵션 수']}</td>
      <td><div class="guide-tags">${optList}</div></td>
      <td>${status}</td>
    </tr>`;
  }

  html += `</tbody></table></div>`;

  const ref = data['참고'];
  if (ref) {
    html += `<div class="guide-entries" style="margin-top:var(--gap-md)">`;
    for (const [k, v] of Object.entries(ref)) {
      html += `<div class="guide-entry"><span class="guide-key">${k}</span><span class="guide-val">${v}</span></div>`;
    }
    html += '</div>';
  }

  html += '</div></details>';
  return html;
}

function renderObjectArray(arr) {
  if (arr.length === 0) return '';
  const keys = Object.keys(arr[0]);

  let html = '<div class="table-wrapper"><table class="item-table wr-table"><thead><tr>';
  for (const k of keys) {
    html += `<th>${tGame(k)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of arr) {
    html += '<tr>';
    for (const k of keys) {
      const v = row[k];
      if (Array.isArray(v)) {
        html += `<td>${v.join(', ')}</td>`;
      } else {
        html += `<td>${v ?? '—'}</td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}
