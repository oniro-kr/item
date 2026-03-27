/**
 * Supabase 연동 - 아이템 평가 시스템
 *
 * 사용 전 Supabase 프로젝트에서 아래 SQL을 실행해야 합니다:
 *
 * CREATE TABLE item_ratings (
 *   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *   item_id INT NOT NULL,
 *   nickname TEXT NOT NULL CHECK (char_length(nickname) >= 1 AND char_length(nickname) <= 20),
 *   rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
 *   comment TEXT DEFAULT '' CHECK (char_length(comment) <= 200),
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE VIEW item_rating_summary AS
 * SELECT item_id,
 *        ROUND(AVG(rating)::numeric, 1) AS avg_rating,
 *        COUNT(*) AS rating_count
 * FROM item_ratings GROUP BY item_id;
 *
 * ALTER TABLE item_ratings ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Anyone can read" ON item_ratings FOR SELECT USING (true);
 * CREATE POLICY "Anyone can insert" ON item_ratings FOR INSERT WITH CHECK (true);
 */

// ── TODO: 여기에 본인의 Supabase 프로젝트 정보를 입력하세요 ──
const SUPABASE_URL = 'https://vuebopglffbarpbvxtgf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_01MjGKoqaQPoXXXtI1DA4g_7AfUc6pY';

let supabase = null;

/** 별점 요약 캐시: Map<itemId, { avg: number, count: number }> */
let ratingSummaryCache = new Map();

/** 클라이언트 IP 캐시 */
let clientIp = '';

/** 클라이언트 IP 조회 */
async function fetchClientIp() {
  try {
    const resp = await fetch('https://api.ipify.org?format=json');
    const data = await resp.json();
    clientIp = data.ip || '';
  } catch {
    clientIp = '';
  }
}

/** 해당 아이템에 이미 평가했는지 확인 */
export async function hasAlreadyRated(itemId) {
  if (!supabase || !clientIp) return false;
  try {
    const { data } = await supabase
      .from('item_ratings')
      .select('id')
      .eq('item_id', itemId)
      .eq('ip_address', clientIp)
      .limit(1);
    return data && data.length > 0;
  } catch {
    return false;
  }
}

/** Supabase 클라이언트 초기화 */
export function initSupabase() {
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.warn('Supabase SDK not loaded. Rating features disabled.');
    return false;
  }
  if (SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.warn('Supabase URL not configured. Rating features disabled.');
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  fetchClientIp();
  return true;
}

/** Supabase가 사용 가능한지 확인 */
export function isSupabaseReady() {
  return supabase !== null;
}

/** 전체 아이템 평균 별점 일괄 조회 → 캐시 저장 */
export async function fetchAllRatingSummaries() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('item_rating_summary')
      .select('*');
    if (error) throw error;

    ratingSummaryCache.clear();
    for (const row of data) {
      ratingSummaryCache.set(row.item_id, {
        avg: parseFloat(row.avg_rating),
        count: parseInt(row.rating_count),
      });
    }
  } catch (err) {
    console.error('Failed to fetch rating summaries:', err);
  }
}

/** 캐시에서 아이템 별점 가져오기 */
export function getRatingSummary(itemId) {
  return ratingSummaryCache.get(itemId) || { avg: 0, count: 0 };
}

/** 전체 캐시 반환 (정렬용) */
export function getRatingSummaryCache() {
  return ratingSummaryCache;
}

/** 특정 아이템의 평가 목록 조회 (최신 20개) */
export async function fetchItemRatings(itemId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('item_ratings')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch item ratings:', err);
    return [];
  }
}

/** SHA-256 해시 생성 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 스로틀: 1분에 최대 10건 */
const THROTTLE_WINDOW = 60 * 1000; // 1분
const THROTTLE_MAX = 10;
const THROTTLE_KEY = 'oniro_submit_log';

function checkThrottle() {
  const now = Date.now();
  let log = [];
  try {
    log = JSON.parse(localStorage.getItem(THROTTLE_KEY) || '[]');
  } catch { log = []; }

  // 1분 이내 기록만 유지
  log = log.filter(t => now - t < THROTTLE_WINDOW);

  if (log.length >= THROTTLE_MAX) {
    const waitSec = Math.ceil((THROTTLE_WINDOW - (now - log[0])) / 1000);
    throw new Error(`너무 빠른 등록입니다. ${waitSec}초 후 다시 시도해주세요`);
  }

  log.push(now);
  localStorage.setItem(THROTTLE_KEY, JSON.stringify(log));
}

/** 평가 등록 */
export async function submitRating(itemId, nickname, rating, comment = '', password = '') {
  if (!supabase) throw new Error('Supabase not initialized');
  checkThrottle();

  const pwHash = password ? await hashPassword(password) : '';

  // IP 중복 체크
  if (clientIp) {
    const already = await hasAlreadyRated(itemId);
    if (already) throw new Error('이미 이 아이템에 평가를 등록하셨습니다');
  }

  const { data, error } = await supabase
    .from('item_ratings')
    .insert([{
      item_id: itemId,
      nickname: nickname.trim(),
      rating,
      comment: comment.trim(),
      password_hash: pwHash,
      ip_address: clientIp,
    }])
    .select();

  if (error) throw error;

  // 캐시 갱신
  const current = ratingSummaryCache.get(itemId) || { avg: 0, count: 0 };
  const newCount = current.count + 1;
  const newAvg = ((current.avg * current.count) + rating) / newCount;
  ratingSummaryCache.set(itemId, {
    avg: Math.round(newAvg * 10) / 10,
    count: newCount,
  });

  return data;
}

/** 비밀번호 검증 */
export async function verifyPassword(ratingId, password) {
  if (!supabase) return false;
  const pwHash = await hashPassword(password);
  const { data, error } = await supabase
    .from('item_ratings')
    .select('id')
    .eq('id', ratingId)
    .eq('password_hash', pwHash)
    .single();
  if (error || !data) return false;
  return true;
}

/** 평가 수정 */
export async function updateRating(ratingId, rating, comment, password) {
  if (!supabase) throw new Error('Supabase not initialized');
  const pwHash = await hashPassword(password);

  // 비밀번호 확인
  const { data: check } = await supabase
    .from('item_ratings')
    .select('id')
    .eq('id', ratingId)
    .eq('password_hash', pwHash)
    .single();
  if (!check) throw new Error('비밀번호가 일치하지 않습니다');

  const { error } = await supabase
    .from('item_ratings')
    .update({ rating, comment: comment.trim() })
    .eq('id', ratingId)
    .eq('password_hash', pwHash);

  if (error) throw error;

  // 캐시 갱신 (서버에서 다시 가져오기)
  await fetchAllRatingSummaries();
}

/** 평가 삭제 */
export async function deleteRating(ratingId, password) {
  if (!supabase) throw new Error('Supabase not initialized');
  const pwHash = await hashPassword(password);

  // 비밀번호 확인
  const { data: check } = await supabase
    .from('item_ratings')
    .select('id')
    .eq('id', ratingId)
    .eq('password_hash', pwHash)
    .single();
  if (!check) throw new Error('비밀번호가 일치하지 않습니다');

  const { error } = await supabase
    .from('item_ratings')
    .delete()
    .eq('id', ratingId)
    .eq('password_hash', pwHash);

  if (error) throw error;

  // 캐시 갱신
  await fetchAllRatingSummaries();
}
