import { t, tGame } from './i18n.js?v=3.1.0';

const CAT_STYLES = {
  '근접': { cls: 'wr-cat-melee', labelKey: 'weapons.catMelee' },
  '물리 원거리': { cls: 'wr-cat-phys', labelKey: 'weapons.catPhysRanged' },
  '마법 원거리': { cls: 'wr-cat-magic', labelKey: 'weapons.catMagicRanged' },
};

const JUDGE_ICONS = {
  '원추형': '◥',
  '사각형': '▬',
  '투사체': '→',
};

export async function renderWeapons(container) {
  let data;
  try {
    const res = await fetch('/item/json/Oniro_Guide_MasterData.json');
    data = await res.json();
  } catch {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:2rem;">${t('weapons.loadFailed')}</p>`;
    return;
  }

  const weaponSystem = data['무기 시스템'];
  const rangeData = data['사정거리'];
  const speedData = data['공격 속도'];
  const judgeData = data['공격 판정 방식'];
  const weapons = weaponSystem['무기 종합 비교표'];

  let html = '';

  // Section 1: Range constants
  html += `<h3 class="as-section-title">${t('weapons.range')}</h3>`;
  html += '<div class="wr-constants">';
  html += buildCard(t('weapons.melee'), rangeData['근접 무기'], t('weapons.meleeDesc'));
  html += buildCard(t('weapons.rangedPlayer'), rangeData['물리 원거리 (플레이어)'], t('weapons.rangedPlayerDesc'));
  html += buildCard(t('weapons.rangedNpc'), rangeData['물리 원거리 (NPC)'], t('weapons.rangedNpcDesc'));
  html += buildCard(t('weapons.tolerance'), rangeData['사정거리 허용 오차'], t('weapons.toleranceDesc'));
  html += '</div>';

  // Section 2: Weapon comparison table
  html += `<h3 class="as-section-title">${t('weapons.comparison')}</h3>`;
  html += buildWeaponTable(weapons);

  // Section 3: Attack speed bar chart
  html += `<h3 class="as-section-title">${t('weapons.atkSpeed')}</h3>`;
  html += buildBarChart(weapons);

  // Section 4: Attack speed formula
  html += '<div class="as-formula-box">';
  html += `<div class="as-formula-label">${t('weapons.formula')}</div>`;
  html += `<code class="as-formula">${speedData['추정 공식']}</code>`;
  html += `<div class="as-formula-example">${t('weapons.dualBonus')}: ${speedData['이도류 보너스']} | ${t('weapons.speedRange')}: ${speedData['범위']}</div>`;
  html += '</div>';

  // Section 5: Attack detection modes
  html += `<h3 class="as-section-title">${t('weapons.judgement')}</h3>`;
  html += buildJudgeModes(judgeData);

  container.innerHTML = html;
}

function buildCard(title, value, desc) {
  return `<div class="wr-const-card">
    <div class="wr-const-value">${value}</div>
    <div class="wr-const-title">${title}</div>
    <div class="wr-const-desc">${desc}</div>
  </div>`;
}

function buildWeaponTable(weapons) {
  let html = '<div class="table-wrapper"><table class="item-table wr-table"><thead><tr>';
  html += `<th>${t('weapons.thWeapon')}</th><th>${t('weapons.thHand')}</th><th>${t('weapons.thCategory')}</th><th>${t('weapons.thJudge')}</th><th>${t('weapons.thRange')}</th><th>${t('weapons.thBaseSpeed')}</th><th>${t('weapons.thProjSpeed')}</th>`;
  html += '</tr></thead><tbody>';

  for (const w of weapons) {
    const cat = CAT_STYLES[w.카테고리] || { cls: '', labelKey: '' };
    const catLabel = cat.labelKey ? t(cat.labelKey) : tGame(w.카테고리);
    const icon = JUDGE_ICONS[w.판정] || '';
    const judgeLabel = tGame(w.판정);
    html += '<tr>';
    html += `<td><strong>${tGame(w.무기)}</strong></td>`;
    html += `<td>${w.손}</td>`;
    html += `<td><span class="wr-cat-badge ${cat.cls}">${catLabel}</span></td>`;
    html += `<td>${icon} ${judgeLabel}</td>`;
    html += `<td class="wr-num">${w.사정거리}</td>`;
    html += `<td class="wr-num">${w.기본속도.join(', ')}</td>`;
    html += `<td class="wr-num">${w['투사체 속도'] ?? '—'}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function buildBarChart(weapons) {
  const MIN = 0.5;
  const MAX = 1.4;
  const range = MAX - MIN;

  const entries = weapons
    .map(w => ({ name: w.무기, speeds: w.기본속도 }))
    .sort((a, b) => Math.max(...b.speeds) - Math.max(...a.speeds));

  let html = '<div class="as-bar-chart">';

  html += '<div class="as-bar-scale">';
  for (let v = 0.6; v <= 1.4; v += 0.1) {
    const pct = ((v - MIN) / range) * 100;
    html += `<span class="as-scale-label" style="left:${pct}%">${v.toFixed(1)}</span>`;
  }
  html += '</div>';

  for (const { name, speeds } of entries) {
    const minSpd = Math.min(...speeds);
    const maxSpd = Math.max(...speeds);
    const leftPct = ((minSpd - MIN) / range) * 100;
    const widthPct = ((maxSpd - minSpd) / range) * 100;

    html += '<div class="as-bar-row">';
    html += `<div class="as-bar-label">${tGame(name)}</div>`;
    html += '<div class="as-bar-track">';

    if (speeds.length === 1) {
      const dotPct = ((speeds[0] - MIN) / range) * 100;
      html += `<div class="as-bar-dot" style="left:${dotPct}%" title="${speeds[0]}"></div>`;
    } else {
      html += `<div class="as-bar-fill" style="left:${leftPct}%;width:${Math.max(widthPct, 0.5)}%"></div>`;
      for (const spd of speeds) {
        const dotPct = ((spd - MIN) / range) * 100;
        html += `<div class="as-bar-dot" style="left:${dotPct}%" title="${spd}"></div>`;
      }
    }

    html += '</div>';
    html += `<div class="as-bar-values">${speeds.join(', ')}</div>`;
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function buildJudgeModes(judgeData) {
  const sections = [
    { key: '원추형 (부채꼴)', cls: 'wr-cat-phys', icon: '◥' },
    { key: '사각형 (직선)', cls: 'wr-cat-melee', icon: '▬' },
    { key: '투사체', cls: 'wr-cat-magic', icon: '→' },
  ];

  let html = '<div class="as-area-grid">';

  for (const sec of sections) {
    const d = judgeData[sec.key];
    if (!d) continue;

    html += '<div class="as-area-card">';
    html += `<div class="as-area-card-title"><span class="${sec.cls}" style="margin-right:6px">${sec.icon}</span>${sec.key}</div>`;
    html += `<p>${d['설명']}</p>`;

    const weapons = d['무기'] || [];
    if (weapons.length) {
      html += '<div class="as-collision-weapons">';
      for (const w of weapons) {
        html += `<span class="as-collision-tag">${tGame(w)}</span>`;
      }
      html += '</div>';
    }

    if (d['투사체 크기']) {
      html += '<div style="margin-top:8px">';
      for (const [k, v] of Object.entries(d['투사체 크기'])) {
        html += `<div class="as-area-detail">${k}: ${v}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}
