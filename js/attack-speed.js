export async function renderAttackSpeed(container) {
  let data;
  try {
    const res = await fetch('/item/json/Oniro_AttackArea_Speed_Data.json');
    data = await res.json();
  } catch {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    return;
  }

  const speedSystem = data['공격 속도 시스템'];
  const attackArea = data['공격 범위'];
  const weaponSpeeds = speedSystem['구성요소']['무기 기본속도']['무기별 기본속도'];
  const dualWield = speedSystem['구성요소']['이도류 보너스'];
  const formula = speedSystem['추정 공식'];
  const defence = speedSystem['방어 관련 공식 (참고)'];

  let html = '';

  // Section 1: System summary cards
  html += '<h3 class="as-section-title">공격속도 시스템</h3>';
  html += '<div class="wr-constants">';
  html += buildCard('이도류 보너스', `+${dualWield['수치'] * 100}%`, dualWield['설명']);
  html += buildCard('속도 범위', speedSystem['구성요소']['무기 기본속도']['범위'], '무기 기본속도 범위');
  html += buildCard('방어력 계수', defence['방어력 계수'], defence['추정 방어 공식']);
  html += buildCard('저항 계수', defence['저항 계수'], defence['추정 저항 공식']);
  html += '</div>';

  // Formula box
  html += '<div class="as-formula-box">';
  html += '<div class="as-formula-label">추정 공식</div>';
  html += `<code class="as-formula">${formula['공식']}</code>`;
  html += `<div class="as-formula-example">${formula['예시']}</div>`;
  html += `<div class="as-formula-note">${formula['참고']}</div>`;
  if (formula['주의']) {
    html += `<div class="as-formula-note">${formula['주의']}</div>`;
  }
  html += '</div>';

  // Section 2: Weapon speed bar chart
  html += '<h3 class="as-section-title">무기별 기본 공격속도</h3>';
  html += buildBarChart(weaponSpeeds);

  // Section 3: Collision mode classification
  html += '<h3 class="as-section-title">무기별 판정 방식</h3>';
  html += buildCollisionModes(attackArea['무기별 판정 방식']);

  // Section 4: Projectile hit detection
  html += '<h3 class="as-section-title">투사체 적중 판정</h3>';
  html += buildProjectileSection(attackArea['투사체 적중 판정']);

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

  const entries = Object.entries(weaponSpeeds).sort((a, b) => {
    return Math.max(...b[1]) - Math.max(...a[1]);
  });

  let html = '<div class="as-bar-chart">';

  html += '<div class="as-bar-scale">';
  for (let v = 0.6; v <= 1.4; v += 0.1) {
    const pct = ((v - MIN) / range) * 100;
    html += `<span class="as-scale-label" style="left:${pct}%">${v.toFixed(1)}</span>`;
  }
  html += '</div>';

  for (const [weapon, speeds] of entries) {
    const minSpd = Math.min(...speeds);
    const maxSpd = Math.max(...speeds);
    const leftPct = ((minSpd - MIN) / range) * 100;
    const widthPct = ((maxSpd - minSpd) / range) * 100;

    html += '<div class="as-bar-row">';
    html += `<div class="as-bar-label">${weapon}</div>`;
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

function buildCollisionModes(modes) {
  const sections = [
    { key: '사각형 (직선형 찌르기)', cls: 'wr-cat-melee', icon: '▬', field: '무기' },
    { key: '원추형 (부채꼴 휘두르기)', cls: 'wr-cat-phys', icon: '◥', field: '근접무기' },
    { key: '투사체 (발사형)', cls: 'wr-cat-magic', icon: '→', field: '무기' },
  ];

  let html = '<div class="as-area-grid">';

  for (const sec of sections) {
    const data = modes[sec.key];
    if (!data) continue;
    const weapons = data[sec.field] || [];

    html += '<div class="as-area-card">';
    html += `<div class="as-area-card-title"><span class="${sec.cls}" style="margin-right:6px">${sec.icon}</span>${sec.key}</div>`;
    html += `<p>${data['설명']}</p>`;
    html += '<div class="as-collision-weapons">';
    for (const name of weapons) {
      html += `<span class="as-collision-tag">${name}</span>`;
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function buildProjectileSection(projectileData) {
  let html = '<div class="as-area-grid">';

  for (const [name, info] of Object.entries(projectileData)) {
    html += '<div class="as-area-card">';
    html += `<div class="as-area-card-title">${name}</div>`;
    html += `<div class="as-area-detail">판정 형태: ${info['판정 형태']}</div>`;
    if (info['크기']) {
      html += `<div class="as-area-detail">크기: ${info['크기']}</div>`;
    }
    if (info['반지름']) {
      html += `<div class="as-area-detail">반지름: ${info['반지름']}</div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}
