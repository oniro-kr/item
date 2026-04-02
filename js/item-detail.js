import { getWeaponStats, getArmorStats } from './data.js?v=3.2.0';
import { rarityClass, optionDisplayName, formatOptionValue, showToast } from './utils.js?v=3.2.0';
import { isSupabaseReady, getRatingSummary, fetchItemRatings, submitRating, updateRating, deleteRating, hasAlreadyRated } from './supabase.js?v=3.2.0';
import { renderStars } from './render.js?v=3.2.0';
import { t, tGame, tGameBlock, tSkillName } from './i18n.js?v=3.2.0';

const overlay = document.getElementById('modalOverlay');
const modal = document.getElementById('itemModal');
const titleEl = document.getElementById('modalTitle');
const bodyEl = document.getElementById('modalBody');
const closeBtn = document.getElementById('modalClose');

/** Option type description keys */
const OPTION_TYPE_DESC_KEYS = {
  '고정': 'optType.fixed.desc',
  '변동': 'optType.variable.desc',
  '랜덤변동': 'optType.randVar.desc',
  '랜덤부여': 'optType.randGrant.desc',
};

/** Show/hide fixed tooltip popup */
function showOptionTooltip(el, text) {
  const existing = document.querySelector('.option-tooltip-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'option-tooltip-popup';
  popup.textContent = text;
  document.body.appendChild(popup);

  const rect = el.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${Math.max(8, Math.min(rect.left - popup.offsetWidth / 2, window.innerWidth - popup.offsetWidth - 8))}px`;

  const dismiss = () => { popup.remove(); document.removeEventListener('click', dismiss); };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
}

function hideOptionTooltip() {
  const existing = document.querySelector('.option-tooltip-popup');
  if (existing) existing.remove();
}

/** Initialize modal event listeners */
export function initModal() {
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });
}

/** Open modal for an item */
export function openItemDetail(item) {
  const itemName = tGame(item.한국어이름);
  titleEl.textContent = itemName;
  titleEl.className = `modal-title rarity-text-${rarityClass(item.표시희귀도)}`;
  bodyEl.innerHTML = '';

  // ── Tooltip Card ──
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-card';

  // Item name header
  const nameBar = document.createElement('div');
  nameBar.className = 'tooltip-name-bar';
  const nameEl = document.createElement('span');
  nameEl.className = `tooltip-item-name rarity-text-${rarityClass(item.표시희귀도)}`;
  nameEl.textContent = itemName;
  nameBar.appendChild(nameEl);
  tooltip.appendChild(nameBar);

  // Top row: image + weapon/armor core stats
  const topRow = document.createElement('div');
  topRow.className = 'tooltip-top';

  const imgEl = document.createElement('img');
  imgEl.className = 'tooltip-img';
  imgEl.src = item.이미지 || 'img/no_image.svg';
  imgEl.alt = '';
  topRow.appendChild(imgEl);

  const coreInfo = document.createElement('div');
  coreInfo.className = 'tooltip-core';

  // Rarity + subtype labels
  const rarityLabel = document.createElement('div');
  rarityLabel.className = 'tooltip-rarity';
  rarityLabel.textContent = item.표시희귀도 === '전설' ? tGame('전설적인') : tGame(item.표시희귀도);
  coreInfo.appendChild(rarityLabel);

  const subtypeLabel = document.createElement('div');
  subtypeLabel.className = 'tooltip-subtype';
  subtypeLabel.textContent = tGame(item.세부타입 || item.타입);
  coreInfo.appendChild(subtypeLabel);

  // Weapon / Armor info
  const isWeapon = item.타입 === '무기' || item._category === '무기';
  const isArmor = ['갑옷', '투구', '장갑', '신발', '벨트'].includes(item.타입);

  const ELEM_COLORS = {
    '화염': '#e8632b', '공기': '#a0d8a0', '물': '#4a90d9',
    '독': '#7dc850', '빛': '#f0e060', '어둠': '#b070d0', '물리': '#c8c8c8',
  };

  if (isWeapon) {
    const ws = getWeaponStats(item.아이템ID);

    const dmgRange = document.createElement('div');
    dmgRange.className = 'tooltip-upcoming';
    dmgRange.textContent = t('detail.dmgUpcoming');
    coreInfo.appendChild(dmgRange);

    if (ws) {
      const elemName = (ws.속성 || '물리').replace('바람', '공기').replace('신성', '빛').replace('암흑', '어둠').replace('기본(속성미지정)', '물리');
      const elemLabel = document.createElement('div');
      elemLabel.className = 'tooltip-dmg-type';
      elemLabel.textContent = t('detail.elemDmg', tGame(elemName));
      elemLabel.style.color = ELEM_COLORS[elemName] || ELEM_COLORS['물리'];
      coreInfo.appendChild(elemLabel);

      const atkSpd = document.createElement('div');
      atkSpd.className = 'tooltip-atkspd';
      atkSpd.textContent = t('detail.atkPerSec', ws.공격속도);
      coreInfo.appendChild(atkSpd);
    }
  } else if (isArmor) {
    const defUpcoming = document.createElement('div');
    defUpcoming.className = 'tooltip-upcoming';
    defUpcoming.textContent = t('detail.defUpcoming');
    coreInfo.appendChild(defUpcoming);
  }

  topRow.appendChild(coreInfo);
  tooltip.appendChild(topRow);

  // Info bar: required level + sockets
  const infoBar = document.createElement('div');
  infoBar.className = 'tooltip-info-bar';
  const lvlEl = document.createElement('span');
  lvlEl.textContent = t('detail.reqLevelShort', item.요구레벨);
  const socketEl = document.createElement('span');
  socketEl.className = 'tooltip-sockets';
  socketEl.innerHTML = `${item.최대소켓}<svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align:-2px;margin-left:2px"><circle cx="8" cy="8" r="6" fill="none" stroke="#6a6a82" stroke-width="1.5"/><circle cx="8" cy="8" r="2.5" fill="#6a6a82"/></svg>`;
  infoBar.append(lvlEl, socketEl);
  tooltip.appendChild(infoBar);

  // Affix text (접사 한국어)
  const affixText = item['접사(한국어)'] || '';
  if (affixText) {
    const affixSection = document.createElement('div');
    affixSection.className = 'tooltip-affix';
    const translatedAffix = tGameBlock(affixText);
    const lines = translatedAffix.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const p = document.createElement('div');
      p.className = 'tooltip-affix-line';
      if (line.startsWith('유일무이:') || line.startsWith('세트:')) {
        p.classList.add('tooltip-affix-skill');
      }
      p.textContent = line;
      affixSection.appendChild(p);
    }
    tooltip.appendChild(affixSection);
  }

  // English name footer
  const enFooter = document.createElement('div');
  enFooter.className = 'tooltip-en-name';
  enFooter.textContent = item.에디터이름;
  tooltip.appendChild(enFooter);

  // ── 2-column layout ──
  const layout = document.createElement('div');
  layout.className = 'modal-layout';

  const leftCol = document.createElement('div');
  leftCol.className = 'modal-col-left';

  leftCol.appendChild(tooltip);

  const visibleOptions = item.옵션?.filter(o => o.ID !== 0);
  if (visibleOptions?.length) {
    leftCol.appendChild(buildOptionsSection(visibleOptions));
  }
  if (item.스킬?.length) {
    leftCol.appendChild(buildSkillsSection(item.스킬));
  }
  leftCol.appendChild(buildBasicInfo(item));

  layout.appendChild(leftCol);

  // Right column: rating + bug report
  const rightCol = document.createElement('div');
  rightCol.className = 'modal-col-right';
  if (isSupabaseReady()) {
    rightCol.appendChild(buildRatingSection(item.아이템ID));
  }
  rightCol.appendChild(buildBugReportSection(item.아이템ID, item.한국어이름));
  layout.appendChild(rightCol);

  bodyEl.appendChild(layout);

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

/** Close modal */
export function closeModal() {
  overlay.hidden = true;
  document.body.style.overflow = '';
}

/** Build basic info section */
function buildBasicInfo(item) {
  const section = createSection(t('detail.basicInfo'));
  const grid = document.createElement('div');
  grid.className = 'detail-info-grid';

  const fields = [
    [t('detail.type'), tGame(item.타입)],
    [t('detail.subtype'), item.세부타입 ? tGame(item.세부타입) : '-'],
    [t('detail.rarity'), tGame(item.표시희귀도)],
    [t('detail.reqLevel'), item.요구레벨],
    [t('detail.sockets'), `${item.소켓수} / ${item.최대소켓}`],
    [t('detail.auxRatio'), item.보조배율],
    [t('detail.itemId'), item.아이템ID],
  ];

  for (const [label, value] of fields) {
    const labelEl = document.createElement('span');
    labelEl.className = 'detail-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'detail-value';
    if (label === t('detail.rarity')) {
      valueEl.innerHTML = `<span class="rarity-badge rarity-${rarityClass(item.표시희귀도)}">${value}</span>`;
    } else {
      valueEl.textContent = value;
    }

    grid.append(labelEl, valueEl);
  }

  section.appendChild(grid);
  return section;
}


/** Build options table */
function buildOptionsSection(options) {
  const section = createSection(t('detail.options', options.length));
  const table = document.createElement('table');
  table.className = 'option-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>${t('detail.optionCol')}</th><th>${t('detail.valueCol')}</th><th>${t('detail.typeCol')}</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const opt of options) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'option-name';
    tdName.textContent = optionDisplayName(opt);

    const tdValue = document.createElement('td');
    tdValue.className = 'option-value';
    if (opt.최소값 !== opt.최대값) {
      tdValue.textContent = `${opt.최소값} ~ ${opt.최대값}`;
    } else {
      tdValue.textContent = formatOptionValue(opt);
    }

    const tdType = document.createElement('td');
    tdType.className = 'option-type-cell';
    const typeBadge = document.createElement('span');
    const typeClass = { '고정': 'option-type-fixed', '변동': 'option-type-variable', '랜덤변동': 'option-type-rand-var', '랜덤부여': 'option-type-rand-grant' }[opt.유형] || 'option-type-fixed';
    typeBadge.className = `option-type-badge ${typeClass}`;
    typeBadge.textContent = tGame(opt.유형);
    tdType.appendChild(typeBadge);

    const descKey = OPTION_TYPE_DESC_KEYS[opt.유형];
    if (descKey) {
      const info = document.createElement('span');
      info.className = 'option-info-icon';
      info.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="7"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r="0.5" fill="currentColor"/></svg>';
      info.addEventListener('click', (e) => {
        e.stopPropagation();
        showOptionTooltip(info, t(descKey));
      });
      info.addEventListener('mouseenter', () => showOptionTooltip(info, t(descKey)));
      info.addEventListener('mouseleave', hideOptionTooltip);
      tdType.appendChild(info);
    }

    tr.append(tdName, tdValue, tdType);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

/** Build skills section */
function buildSkillsSection(skills) {
  const section = createSection(t('detail.skills', skills.length));

  for (const skill of skills) {
    const card = document.createElement('div');
    card.className = 'skill-card';

    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = tSkillName(skill['이름(한국어)'] || skill.이름);

    const meta = document.createElement('div');
    meta.className = 'skill-meta';

    const lvl = document.createElement('span');
    lvl.textContent = skill.최소레벨 === skill.최대레벨
      ? `Lv.${skill.최소레벨}`
      : `Lv.${skill.최소레벨}~${skill.최대레벨}`;

    const prob = document.createElement('span');
    if (skill['최소확률%'] !== undefined) {
      prob.textContent = skill['최소확률%'] === skill['최대확률%']
        ? t('detail.probability', skill['최소확률%'])
        : t('detail.probRange', skill['최소확률%'], skill['최대확률%']);
    }

    const trigger = document.createElement('span');
    trigger.textContent = tGame(skill.발동조건 || '');

    const type = document.createElement('span');
    type.textContent = tGame(skill.타입);
    type.style.color = 'var(--text-muted)';
    type.style.fontSize = '0.75rem';

    meta.append(lvl, prob, trigger, type);
    card.append(name, meta);
    section.appendChild(card);
  }

  return section;
}

/** Callback when a rating is submitted (set by app.js) */
let _onRatingSubmitted = null;
export function setOnRatingSubmitted(fn) {
  _onRatingSubmitted = fn;
}

/** Build rating section */
function buildRatingSection(itemId) {
  const section = createSection(t('rating.title'));

  // Current summary
  const summary = getRatingSummary(itemId);
  const summaryEl = document.createElement('div');
  summaryEl.className = 'rating-summary';
  if (summary.count > 0) {
    summaryEl.innerHTML = `<span class="rating-stars-lg">${renderStars(summary.avg)}</span> <span class="rating-avg-lg">${summary.avg}</span> <span class="rating-count-lg">${t('rating.count', summary.count)}</span>`;
  } else {
    summaryEl.innerHTML = `<span class="rating-empty-msg">${t('rating.noRatings')}</span>`;
  }
  section.appendChild(summaryEl);

  const formSlot = document.createElement('div');
  section.appendChild(formSlot);

  // Ratings list
  const listEl = document.createElement('div');
  listEl.className = 'rating-list';
  listEl.innerHTML = `<p class="rating-loading">${t('rating.loading')}</p>`;
  section.appendChild(listEl);

  (async () => {
    const already = await hasAlreadyRated(itemId);
    if (already) {
      formSlot.innerHTML = `<p class="rating-already">${t('rating.already')}</p>`;
    } else {
      formSlot.appendChild(buildRatingForm(itemId, summaryEl, listEl));
    }
  })();

  loadRatingsList(itemId, listEl, summaryEl);

  return section;
}

/** Build rating form */
function buildRatingForm(itemId, summaryEl, listEl) {
  const form = document.createElement('div');
  form.className = 'rating-form';

  // Star input
  const starInput = document.createElement('div');
  starInput.className = 'rating-star-input';
  let selectedRating = 0;
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.className = 'rating-star-btn';
    star.textContent = '☆';
    star.dataset.value = i;
    star.addEventListener('click', () => {
      selectedRating = i;
      starInput.querySelectorAll('.rating-star-btn').forEach((s, idx) => {
        s.textContent = idx < i ? '★' : '☆';
        s.classList.toggle('selected', idx < i);
      });
    });
    starInput.appendChild(star);
  }

  const nicknameInput = document.createElement('input');
  nicknameInput.type = 'text';
  nicknameInput.className = 'rating-nickname';
  nicknameInput.placeholder = t('rating.nickname');
  nicknameInput.maxLength = 20;
  nicknameInput.value = localStorage.getItem('oniro_nickname') || '';

  const commentInput = document.createElement('textarea');
  commentInput.className = 'rating-comment';
  commentInput.placeholder = t('rating.comment');
  commentInput.maxLength = 200;
  commentInput.rows = 2;

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.className = 'rating-password';
  passwordInput.placeholder = t('rating.password');
  passwordInput.maxLength = 30;

  const submitBtn = document.createElement('button');
  submitBtn.className = 'rating-submit';
  submitBtn.textContent = t('rating.submit');

  const errorMsg = document.createElement('p');
  errorMsg.className = 'rating-error';

  submitBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value;
    if (!nickname) { errorMsg.textContent = t('rating.errNickname'); return; }
    if (selectedRating === 0) { errorMsg.textContent = t('rating.errStar'); return; }
    if (!password) { errorMsg.textContent = t('rating.errPassword'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = t('rating.submitting');
    try {
      await submitRating(itemId, nickname, selectedRating, commentInput.value.trim(), password);
      localStorage.setItem('oniro_nickname', nickname);

      const newSummary = getRatingSummary(itemId);
      summaryEl.innerHTML = `<span class="rating-stars-lg">${renderStars(newSummary.avg)}</span> <span class="rating-avg-lg">${newSummary.avg}</span> <span class="rating-count-lg">${t('rating.count', newSummary.count)}</span>`;

      form.parentElement.innerHTML = `<p class="rating-already">${t('rating.registered')}</p>`;

      await loadRatingsList(itemId, listEl);

      if (_onRatingSubmitted) _onRatingSubmitted();
      showToast(t('rating.successSubmit'));
    } catch (err) {
      errorMsg.textContent = t('rating.failSubmit', err.message);
      showToast(t('rating.failSubmit', err.message), 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = t('rating.submit');
    }
  });

  form.append(starInput, nicknameInput, commentInput, passwordInput, submitBtn, errorMsg);
  return form;
}

// ── Telegram Bug Report Config ──
const TELEGRAM_BOT_TOKEN = '8731453747:AAFFG9lISyc7XlarNWkjYa_9O_3SgNekQPw';
const TELEGRAM_CHAT_ID = '290471427';

/** Build bug report section */
function buildBugReportSection(itemId, itemName) {
  const section = createSection(t('bugReport.title'));

  const form = document.createElement('div');
  form.className = 'bugreport-form';

  // Description
  const descInput = document.createElement('textarea');
  descInput.className = 'bugreport-desc';
  descInput.placeholder = t('bugReport.descPlaceholder');
  descInput.maxLength = 500;
  descInput.rows = 3;

  // Image guide text
  const imageGuide = document.createElement('p');
  imageGuide.className = 'bugreport-image-guide';
  imageGuide.textContent = t('bugReport.imageGuide');

  // Image upload
  const imageRow = document.createElement('div');
  imageRow.className = 'bugreport-image-row';

  const imageLabel = document.createElement('label');
  imageLabel.className = 'bugreport-image-label';
  imageLabel.textContent = t('bugReport.imageSelect');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'bugreport-file-input';
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      const name = fileInput.files[0].name;
      imageLabel.textContent = t('bugReport.imageSelected', name.length > 20 ? name.slice(0, 17) + '...' : name);
      imageLabel.classList.add('has-file');
    } else {
      imageLabel.textContent = t('bugReport.imageSelect');
      imageLabel.classList.remove('has-file');
    }
  });
  imageLabel.appendChild(fileInput);
  imageRow.appendChild(imageLabel);

  // Submit
  const submitBtn = document.createElement('button');
  submitBtn.className = 'bugreport-submit';
  submitBtn.textContent = t('bugReport.submit');

  const errorMsg = document.createElement('p');
  errorMsg.className = 'bugreport-error';

  submitBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    const desc = descInput.value.trim();
    if (!desc) { errorMsg.textContent = t('bugReport.errDesc'); return; }

    const file = fileInput.files[0] || null;
    if (!file) { errorMsg.textContent = t('bugReport.errImage'); return; }
    if (file.size > 5 * 1024 * 1024) {
      errorMsg.textContent = t('bugReport.errImageSize');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t('bugReport.submitting');

    try {
      await sendTelegramBugReport(itemId, itemName, desc, file);
      showToast(t('bugReport.success'));
      descInput.value = '';
      fileInput.value = '';
      imageLabel.textContent = t('bugReport.imageSelect');
      imageLabel.classList.remove('has-file');
    } catch (err) {
      errorMsg.textContent = t('bugReport.fail', err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('bugReport.submit');
    }
  });

  form.append(descInput, imageGuide, imageRow, submitBtn, errorMsg);
  section.appendChild(form);
  return section;
}

/** Send bug report to Telegram */
async function sendTelegramBugReport(itemId, itemName, description, imageFile) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Telegram not configured');
  }

  let ip = 'unknown';
  try { ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch {}
  const text = `🐛 *오류 제보*\n\n*아이템:* ${itemName} (ID: ${itemId})\n\n*설명:*\n${description}\n\n*IP:* ${ip}`;

  if (imageFile) {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', text);
    formData.append('parse_mode', 'Markdown');
    formData.append('photo', imageFile);
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST', body: formData
    });
    if (!res.ok) throw new Error((await res.json()).description || res.statusText);
  } else {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
    });
    if (!res.ok) throw new Error((await res.json()).description || res.statusText);
  }
}

/** Refresh summary element with latest cache data */
function refreshSummaryEl(itemId, summaryEl) {
  if (!summaryEl) return;
  const s = getRatingSummary(itemId);
  if (s.count > 0) {
    summaryEl.innerHTML = `<span class="rating-stars-lg">${renderStars(s.avg)}</span> <span class="rating-avg-lg">${s.avg}</span> <span class="rating-count-lg">${t('rating.count', s.count)}</span>`;
  } else {
    summaryEl.innerHTML = `<span class="rating-empty-msg">${t('rating.noRatings')}</span>`;
  }
}

/** Load and render ratings list */
async function loadRatingsList(itemId, container, summaryEl) {
  const ratings = await fetchItemRatings(itemId);
  container.innerHTML = '';

  if (ratings.length === 0) {
    container.innerHTML = `<p class="rating-empty-list">${t('rating.noList')}</p>`;
    return;
  }

  for (const r of ratings) {
    const card = document.createElement('div');
    card.className = 'rating-card';

    const header = document.createElement('div');
    header.className = 'rating-card-header';
    header.innerHTML = `<span class="rating-card-nick">${escapeHtml(r.nickname)}</span>
      <span class="rating-card-stars">${renderStars(r.rating)}</span>
      <span class="rating-card-time">${formatTime(r.created_at)}</span>`;

    card.appendChild(header);

    if (r.comment) {
      const commentEl = document.createElement('p');
      commentEl.className = 'rating-card-comment';
      commentEl.textContent = r.comment;
      card.appendChild(commentEl);
    }

    if (r.password_hash) {
      const editBtn = document.createElement('button');
      editBtn.className = 'rating-action-icon';
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      editBtn.title = t('rating.edit');
      editBtn.addEventListener('click', () => showEditForm(r, itemId, card, container, summaryEl));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'rating-action-icon rating-action-delete';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
      deleteBtn.title = t('rating.delete');
      deleteBtn.addEventListener('click', () => showDeleteConfirm(r, itemId, card, container, summaryEl));

      header.append(editBtn, deleteBtn);
    }

    container.appendChild(card);
  }
}

/** Show inline edit form */
function showEditForm(r, itemId, card, listContainer, summaryEl) {
  const existing = card.querySelector('.rating-edit-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'rating-edit-form';

  const starInput = document.createElement('div');
  starInput.className = 'rating-star-input';
  let newRating = r.rating;
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.className = `rating-star-btn${i <= r.rating ? ' selected' : ''}`;
    star.textContent = i <= r.rating ? '★' : '☆';
    star.addEventListener('click', () => {
      newRating = i;
      starInput.querySelectorAll('.rating-star-btn').forEach((s, idx) => {
        s.textContent = idx < i ? '★' : '☆';
        s.classList.toggle('selected', idx < i);
      });
    });
    starInput.appendChild(star);
  }

  const commentInput = document.createElement('textarea');
  commentInput.className = 'rating-comment';
  commentInput.value = r.comment || '';
  commentInput.maxLength = 200;
  commentInput.rows = 2;

  const pwInput = document.createElement('input');
  pwInput.type = 'password';
  pwInput.className = 'rating-password';
  pwInput.placeholder = t('rating.passwordInput');

  const btnRow = document.createElement('div');
  btnRow.className = 'rating-edit-btns';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'rating-submit';
  saveBtn.textContent = t('rating.editDone');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'rating-action-btn';
  cancelBtn.textContent = t('rating.cancel');
  cancelBtn.addEventListener('click', () => form.remove());

  const errMsg = document.createElement('p');
  errMsg.className = 'rating-error';

  saveBtn.addEventListener('click', async () => {
    if (!pwInput.value) { errMsg.textContent = t('rating.errPassword'); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = t('rating.editing');
    try {
      await updateRating(r.id, newRating, commentInput.value.trim(), pwInput.value);
      refreshSummaryEl(itemId, summaryEl);
      await loadRatingsList(itemId, listContainer, summaryEl);
      if (_onRatingSubmitted) _onRatingSubmitted();
      showToast(t('rating.successEdit'));
    } catch (err) {
      errMsg.textContent = err.message;
      saveBtn.disabled = false;
      saveBtn.textContent = t('rating.editDone');
      showToast(t('rating.failEdit', err.message), 'error');
    }
  });

  btnRow.append(saveBtn, cancelBtn);
  form.append(starInput, commentInput, pwInput, btnRow, errMsg);
  card.appendChild(form);
}

/** Show delete confirmation */
function showDeleteConfirm(r, itemId, card, listContainer, summaryEl) {
  const existing = card.querySelector('.rating-delete-confirm');
  if (existing) { existing.remove(); return; }

  const confirm = document.createElement('div');
  confirm.className = 'rating-delete-confirm';

  const pwInput = document.createElement('input');
  pwInput.type = 'password';
  pwInput.className = 'rating-password';
  pwInput.placeholder = t('rating.passwordInput');

  const btnRow = document.createElement('div');
  btnRow.className = 'rating-edit-btns';

  const delBtn = document.createElement('button');
  delBtn.className = 'rating-submit rating-submit-delete';
  delBtn.textContent = t('rating.deleteDone');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'rating-action-btn';
  cancelBtn.textContent = t('rating.cancel');
  cancelBtn.addEventListener('click', () => confirm.remove());

  const errMsg = document.createElement('p');
  errMsg.className = 'rating-error';

  delBtn.addEventListener('click', async () => {
    if (!pwInput.value) { errMsg.textContent = t('rating.errPassword'); return; }
    delBtn.disabled = true;
    delBtn.textContent = t('rating.deleting');
    try {
      await deleteRating(r.id, pwInput.value);
      refreshSummaryEl(itemId, summaryEl);
      await loadRatingsList(itemId, listContainer, summaryEl);
      if (_onRatingSubmitted) _onRatingSubmitted();
      showToast(t('rating.successDelete'));
    } catch (err) {
      errMsg.textContent = err.message;
      delBtn.disabled = false;
      delBtn.textContent = t('rating.deleteDone');
      showToast(t('rating.failDelete', err.message), 'error');
    }
  });

  btnRow.append(delBtn, cancelBtn);
  confirm.append(pwInput, btnRow, errMsg);
  card.appendChild(confirm);
}

/** Format timestamp */
function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/** Escape HTML */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Helper: create a detail section with title */
function createSection(title) {
  const section = document.createElement('div');
  section.className = 'detail-section';

  const titleEl = document.createElement('h3');
  titleEl.className = 'detail-section-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  return section;
}
