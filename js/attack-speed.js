let loaded = false;

export async function renderAttackSpeed(container) {
  if (loaded) return;
  loaded = true;

  let data;
  try {
    const res = await fetch('json/Oniro_AttackArea_Speed_Data.json');
    data = await res.json();
  } catch {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    loaded = false;
    return;
  }

  const speedSystem = data['공격 속도 시스템 (Attack Speed System)'];
  const attackArea = data['공격 범위 (Attack Area)'];
  const weaponSpeeds = speedSystem['구성요소']['무기_기본속도 (weaponBaseSpeed)']['무기별_기본속도'];
  const dualWield = speedSystem['구성요소']['이도류_보너스 (Dual Wield Bonus)'];
  const formula = speedSystem['추정_공식'];
  const defence = speedSystem['방어 공식 (참고)'];

  let html = '';

  // Section 1: System summary cards
  html += '<h3 class="as-section-title">공격속도 시스템</h3>';
  html += '<div class="wr-constants">';
  html += buildCard('이도류 보너스', '+15%', `상수: ${dualWield['상수']}`);
  html += buildCard('속도 범위', '0.6 ~ 1.35', '무기 기본속도 범위');
  html += buildCard('방어력 계수', defence.DEFENCE_REDUCTION_PARAMETER, defence['추정_방어공식']);
  html += buildCard('저항 계수', defence.RESISTENCE_REDUCTION_PARAMETER, defence['추정_저항공식']);
  html += '</div>';

  // Formula box
  html += '<div class="as-formula-box">';
  html += `<div class="as-formula-label">추정 공식</div>`;
  html += `<code class="as-formula">${formula['공식']}</code>`;
  html += `<div class="as-formula-example">${formula['예시']}</div>`;
  html += `<div class="as-formula-note">${formula['참고']}</div>`;
  html += '</div>';

  // Section 2: Weapon speed bar chart
  html += '<h3 class="as-section-title">무기별 기본 공격속도</h3>';
  html += buildBarChart(weaponSpeeds);

  // Section 3: Collision mode classification
  html += '<h3 class="as-section-title">무기별 충돌 모드 분류</h3>';
  html += buildCollisionModes(attackArea['무기별 충돌 모드 분류']);

  // Section 4: Attack area info
  html += '<h3 class="as-section-title">투사체 히트 판정</h3>';
  html += buildAttackAreaSection(attackArea);

  container.innerHTML = html;
}

function buildCard(title, value, desc) {
  return `<div class="wr-const-card">
    <div class="wr-const-value">${value}</div>
    <div class="wr-const-title">${title}</div>
    <div class="wr-const-desc">${desc}</div>
  </div>`;
}

function buildBarChart(weaponSpeeds) {
  const MIN = 0.5;
  const MAX = 1.4;
  const range = MAX - MIN;

  // Sort weapons by max speed descending
  const entries = Object.entries(weaponSpeeds).sort((a, b) => {
    return Math.max(...b[1]) - Math.max(...a[1]);
  });

  let html = '<div class="as-bar-chart">';

  // Scale labels
  html += '<div class="as-bar-scale">';
  for (let v = 0.6; v <= 1.4; v += 0.1) {
    const pct = ((v - MIN) / range) * 100;
    html += `<span class="as-scale-label" style="left:${pct}%">${v.toFixed(1)}</span>`;
  }
  html += '</div>';

  for (const [weapon, speeds] of entries) {
    const name = weapon.replace(/\s*\(.*\)/, '');
    const minSpd = Math.min(...speeds);
    const maxSpd = Math.max(...speeds);
    const leftPct = ((minSpd - MIN) / range) * 100;
    const widthPct = ((maxSpd - minSpd) / range) * 100;

    html += '<div class="as-bar-row">';
    html += `<div class="as-bar-label">${name}</div>`;
    html += '<div class="as-bar-track">';

    if (speeds.length === 1) {
      // Single dot
      const dotPct = ((speeds[0] - MIN) / range) * 100;
      html += `<div class="as-bar-dot" style="left:${dotPct}%" title="${speeds[0]}"></div>`;
    } else {
      // Range bar with dots
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

function buildCollisionModes(modes) {
  const sections = [
    { key: '사각형 (Rectangle) — rectWidth 사용', cls: 'wr-cat-melee', icon: '▬' },
    { key: '원추형 (Cone) — maxAngle 사용', cls: 'wr-cat-phys', icon: '◥' },
    { key: '투사체 (Projectile) — 별도 충돌체', cls: 'wr-cat-magic', icon: '→' },
  ];

  let html = '<div class="as-area-grid">';

  for (const sec of sections) {
    const data = modes[sec.key];
    if (!data) continue;
    const weapons = data['무기'] || data['근접무기'] || {};
    const weaponNames = Object.keys(weapons).map(w => {
      const name = w.replace(/.*\((.+)\)/, '$1');
      return name;
    });

    html += '<div class="as-area-card">';
    html += `<div class="as-area-card-title"><span class="${sec.cls}" style="margin-right:6px">${sec.icon}</span>${sec.key.split('—')[0].trim()}</div>`;
    html += `<p>${data['설명']}</p>`;
    html += '<div class="as-collision-weapons">';
    for (const name of weaponNames) {
      html += `<span class="as-collision-tag">${name}</span>`;
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function buildAttackAreaSection(attackArea) {
  const projectile = attackArea['원거리 투사체 히트 판정'];
  const arrow = projectile['화살/창/마법탄'];
  const shuriken = projectile['수리검/쿠나이'];

  let html = '<div class="as-area-grid">';

  // Arrow/Spear projectile
  html += '<div class="as-area-card">';
  html += '<div class="as-area-card-title">화살 / 창 / 마법탄</div>';
  html += `<div class="as-area-detail">충돌체: ${arrow['충돌체']}</div>`;
  html += `<div class="as-area-detail">크기: ${arrow['크기'].x} x ${arrow['크기'].y} x ${arrow['크기'].z} ${arrow['단위']}</div>`;
  html += '</div>';

  // Shuriken/Kunai
  html += '<div class="as-area-card">';
  html += '<div class="as-area-card-title">수리검 / 쿠나이</div>';
  html += `<div class="as-area-detail">충돌체: ${shuriken['충돌체']}</div>`;
  html += `<div class="as-area-detail">반지름: ${shuriken['반지름']} ${shuriken['단위']}</div>`;
  html += '</div>';

  html += '</div>';
  return html;
}
