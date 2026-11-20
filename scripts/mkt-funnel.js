#!/usr/bin/env node
/* ============================================================================
 * mkt-funnel — ① 구독 퍼널(페이월 열림 → 구매 버튼 → 결제 결과·복원) ② 스마트링크 «어디서 왔나»
 *
 * 사용: node scripts/mkt-funnel.js [일수=7] [--preview]
 *   --preview  프리뷰·로컬 배포가 쓴 칸(fxp:·refp:)을 읽는다 — 검증용. 운영 숫자는 fx:·ref:
 *
 * 읽는 키(쓰는 쪽: src/app/api/funnel-hit · src/lib/marketing/clickRef.ts, 2026-09-30 브랜치 growth/funnel-metrics)
 *   fx:<단계>:<출처>:<플랫폼>:<ET날짜>          정수
 *   fx:v:<ET날짜> {"단계|플랫폼|버전": n}      fx:c:<ET날짜> {"단계|플랫폼|코드": n}
 *   ref:<앱>:<from>:<ET날짜> {"기기|유입분류": n}
 * 전부 EC2 레디스(프록시 /mget, 읽기만). 날짜는 미국 동부(mkt:attr 와 같은 경계).
 * 안드로이드 앱도 퍼널을 보낸다(2026-10-14 Play 앱 상호작용 선언 — src/lib/app/funnelBeacon.ts FUNNEL_SEND_ANDROID).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

// ── 닫힌 목록 — src/lib/app/funnelSchema.ts 와 같아야 한다(tests/funnel.test.ts 가 대조) ──
const STAGES = ['open', 'cta', 'buy_ok', 'buy_cancel', 'buy_err', 'restore_ok', 'restore_none', 'restore_err', 'code_open', 'code_cta', 'code_pro', 'push_open', 'active', 'ai_seen', 'ai_tap', 'onb_show', 'onb_done', 'onb_skip', 'onb_pick', 'onb_perm', 'onb_card', 'onb_nudge', 'onb_pin', 'onb_tap', 'onb_check', 'onb_hide', 'trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze', 'cancel_reason:show', 'cancel_reason:skip', 'cancel_reason:price', 'cancel_reason:not_used', 'cancel_reason:missing_feature', 'cancel_reason:other_app', 'cancel_reason:other', 'trial_off_show', 'trial_off_manage', 'trial_off_close', 'trial_off_expired', 'trial_off_plans', 'trial_push_shown', 'trial_push_accept', 'trial_push_os_granted', 'trial_push_os_denied', 'trial_push_dismiss', 'fr_judge', 'reward_ok', 'rv_cap', 'rv_ask', 'rv_block', 'rv_why'];   // rv_* = 스토어 평점 요청(11/20, lib/app/reviewBeacon) · fr_judge = 첫 실행 체험 페이월 판정(11/20, 출처 fr_*) · reward_ok = 광고 잠금해제 주어짐(11/20, 출처 value_wall·ad_modal) · onb_* = 첫 실행 «가치 먼저» 단계(2026-10-12, 출처 onb_*) · code_* = 🎟 쿠폰 코드 입력(2026-10-05) · code_cta = 안드 안내 시트 [계속](2026-10-06) · push_open·active = 푸시 탭·앱 활성(2026-10-12) · ai_* = «내 종목» AI 한 줄 보임·누름(2026-10-12, 출처 wl_ai)
const SRCS = ['settings', 'value_wall', 'ad_modal', 'dash_gate', 'wl_limit', 'wl_upsell', 'wl_paywall', 'preview', 'other', 'push_morning', 'push_closing', 'push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn', 'push_sig_price', 'app', 'wl_ai', 'today_picks', 'today_page', 'news_page', 'onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_n1', 'onb_n2', 'onb_n3', 'onb_allow', 'onb_deny', 'onb_ai', 'onb_noai', 'onb_earn', 'onb_lko', 'onb_len', 'onb_lja', 'onb_lrep', 'onb_dflt', 'onb_dkeep', 'onb_dedit', 'trial_notice', 'trial_off', 'trial_off_early', 'push_trial', 'push_trial_d3', 'push_trial_d6', 'push_announce', 'trial_expired', 'trial_expired_offer', 'gate_first', 'ad_nofill', 'first_run', 'trial_announce', 'tpush_ai', 'tpush_day1', 'fr_try', 'fr_late', 'fr_pro', 'fr_seen', 'fr_noiap', 'fr_noelig', 'fr_unk', 'fr_nooffer', 'fr_wait', 'fr_chk', 'fr_busy', 'rv_yes', 'rv_no', 'rv_day', 'rv_run', 'rv_watch', 'rv_ai', 'rv_intel', 'rv_earn', 'rv_push', 'rv_pro', 'rv_modal', 'rv_ad', 'rv_gift', 'rv_hidden', 'rv_today', 'rv_gone', 'rv_noplug'];
// ★11/20 스토어 평점 요청(rv_*) — 순간·못 부른 이유(lib/app/reviewBeacon). 구매 퍼널이 아니라 아래 «스토어 평점 요청» 칸에서 따로
const RV_STAGES = ['rv_cap', 'rv_ask', 'rv_block', 'rv_why'];
const RV_MOMENTS = ['rv_day', 'rv_run', 'rv_watch', 'rv_ai', 'rv_intel', 'rv_earn', 'rv_push', 'rv_pro'];
const RV_WHYS = ['rv_modal', 'rv_ad', 'rv_gift', 'rv_hidden', 'rv_today', 'rv_gone', 'rv_noplug'];
const RV_SRCS = ['rv_yes', 'rv_no', ...RV_MOMENTS, ...RV_WHYS];
const RV_KO = {
  rv_day: '사용일 2·7번째', rv_run: '앱 실행 3·4·10번째', rv_watch: '내 종목 담기 2번째', rv_ai: '✦AI 한 줄 2번째', rv_intel: '인텔 열람 2·7번째',
  rv_earn: '실적(발표 완료 행·범위 안 반응)', rv_push: '가치 알림 탭', rv_pro: 'PRO 결제·체험 성공',
  rv_modal: '시트·페이월 떠 있음', rv_ad: '광고 중·직후', rv_gift: '선물 안내 직후', rv_hidden: '앱이 뒤로 감', rv_today: '오늘 다른 순간이 이미 물음', rv_gone: '화면 이동·취소', rv_noplug: '플러그인 없음',
};
// 푸시 탭·앱 활성(2026-10-12)은 구독 퍼널이 아니다 — 이 표에서 빼고 scripts/mkt-push.js 가 따로 보여 준다
const ONB_STAGES = ['onb_show', 'onb_done', 'onb_skip', 'onb_pick', 'onb_perm', 'onb_card', 'onb_nudge', 'onb_pin', 'onb_tap', 'onb_check', 'onb_hide'];   // onb_nudge = 법적 고지 회색 [계속] 누름(11/17) · onb_pin = 고정 체크 줄 보임(11/19) · onb_tap·onb_check·onb_hide = 법적 고지 진단(11/20)
const ONB_SRCS = ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_n1', 'onb_n2', 'onb_n3', 'onb_allow', 'onb_deny', 'onb_ai', 'onb_noai', 'onb_earn', 'onb_lko', 'onb_len', 'onb_lja', 'onb_lrep', 'onb_dflt', 'onb_dkeep', 'onb_dedit'];
const TRIAL_STAGES = ['trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze'];
const TRIAL_OFF_STAGES = ['trial_off_show', 'trial_off_manage', 'trial_off_close', 'trial_off_expired', 'trial_off_plans'];
const TRIAL_PUSH_STAGES = ['trial_push_shown', 'trial_push_accept', 'trial_push_os_granted', 'trial_push_os_denied', 'trial_push_dismiss'];   // ★11/18 체험자 알림 다시 묻기(출처 tpush_ai·tpush_day1)
const TRIAL_PUSH_SRCS = ['tpush_ai', 'tpush_day1'];
const FR_SRCS = ['fr_try', 'fr_late', 'fr_pro', 'fr_seen', 'fr_noiap', 'fr_noelig', 'fr_unk', 'fr_nooffer', 'fr_wait', 'fr_chk', 'fr_busy'];   // ★11/20 첫 실행 체험 페이월 판정(fr_judge 전용)
const FR_KO = { fr_pro: 'PRO(코드 포함)·결제 중', fr_seen: '이미 봄·저장소 막힘', fr_noiap: '결제 불가', fr_noelig: '체험 자격 없음(확정)', fr_unk: '자격 끝내 모름', fr_nooffer: '오퍼링 없음', fr_wait: 'PRO 상태 못 받음', fr_chk: '스토어 재조회 실패', fr_busy: '다른 시트·페이월과 겹침' };
const CANCEL_REASON_STAGES = ['cancel_reason:show', 'cancel_reason:skip', 'cancel_reason:price', 'cancel_reason:not_used', 'cancel_reason:missing_feature', 'cancel_reason:other_app', 'cancel_reason:other'];
const NON_FUNNEL_STAGES = new Set([...TRIAL_STAGES, ...TRIAL_OFF_STAGES, ...TRIAL_PUSH_STAGES, ...CANCEL_REASON_STAGES, 'push_open', 'active', 'ai_seen', 'ai_tap', ...ONB_STAGES, ...RV_STAGES, 'fr_judge', 'reward_ok']);   // fr_judge·reward_ok 는 아래 «첫 실행 체험 페이월 도달»·«광고 잠금해제» 칸에서 따로   // ai_* = «내 종목» AI 한 줄(2026-10-12) — 구독 퍼널 아님
// ★11/11 'trial_off' 는 표에 남긴다 — 체험 종료 안내가 연 페이월의 open·cta·buy_* 가 이 출처로 온다(안내 자체 단계는 NON_FUNNEL_STAGES 로 빠진다)
const NON_FUNNEL_SRCS = new Set([...TRIAL_PUSH_SRCS, ...FR_SRCS, ...RV_SRCS, 'trial_notice', 'push_trial', 'push_trial_d3', 'push_trial_d6', 'push_announce', 'push_morning', 'push_closing', 'push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn', 'push_sig_price', 'app', 'wl_ai', 'today_picks', 'today_page', 'news_page', ...ONB_SRCS]);
const TABLE_STAGES = STAGES.filter((st) => !NON_FUNNEL_STAGES.has(st));
const TABLE_SRCS = SRCS.filter((s) => !NON_FUNNEL_SRCS.has(s));
const PLATS = ['ios', 'android', 'web'];
const REF_APPS = ['sg', 'uc', 'wim'];
const SRC_KO = {
  settings: '설정', value_wall: '가치 벽', ad_modal: '광고 창', dash_gate: '대시보드 게이트', wl_limit: '내 종목 한도',
  wl_upsell: '내 종목 PRO 안내', wl_paywall: '내 종목→페이월', preview: '프리뷰', other: '기타',
  push_morning: '푸시 모닝', push_closing: '푸시 마감', push_sig_wall: '신호 푸시 콜월', push_sig_pain: '신호 푸시 맥스페인', push_sig_dark: '신호 푸시 다크풀', push_sig_oi: '신호 푸시 미결제약정', push_sig_earn: '신호 푸시 실적D-1', push_sig_price: '신호 푸시 PRO 가격 레벨', app: '앱 활성', wl_ai: '내 종목 AI 한 줄', today_picks: '오늘 볼 것 카드', today_page: '오늘 볼 것 전체 페이지', news_page: '뉴스 펄스 전체 페이지', gate_first: '게이트 하루 첫 탭', ad_nofill: '광고 없음→페이월', first_run: '첫 실행 체험 페이월', trial_announce: '기존 사용자 체험 안내',
};
const ONB_SRC_KO = {
  onb_legal: '1 법적 고지', onb_value: '2 가치(종목 고르기)', onb_notif: '3 알림', onb_oldalert: '옛 흐름 2/2 알림',
  onb_n1: '1개', onb_n2: '2개', onb_n3: '3개', onb_allow: '허용', onb_deny: '거절', onb_ai: 'AI 한 줄 있었음', onb_noai: 'AI 한 줄 없었음', onb_earn: '실적 임박 줄 있었음',
};
const CODE_KO = {
  rc0: '알 수 없음', rc2: '스토어 문제', rc3: '결제 불가 기기', rc4: '잘못된 구매', rc5: '상품 없음', rc6: '이미 구매',
  rc10: '네트워크', rc11: '자격 오류(Play 서비스 계정 등)', rc12: '백엔드 응답 이상', rc15: '이미 진행 중', rc16: '백엔드 오류',
  rc20: '결제 대기', rc23: '설정 오류', rc35: '오프라인', iap: '이 기기에서 구매 불가', nooffer: '스토어 가격 없음',
  noent: '결제됐는데 권한 미반영', x: '분류 불가',
};

const ROOT = path.join(__dirname, '..');
const BASE = 'http://52.23.98.13:8081'; // mkt-clicks.js 와 같은 EC2 레디스 프록시
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function proxyKey() {
  let k = (process.env.EC2_REDIS_PROXY_KEY || '').trim(); // 작업트리(.env.local 없음)에서 돌릴 때
  if (!k) { try { k = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim() || ''; } catch { /* 없음 */ } }
  if (!k) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }
  return k;
}

/** /mget 을 120개씩 — 못 읽은 묶음은 null 로 두고 «못 쟀다»를 따로 센다(0 과 구분). */
async function mget(keys, KEY, miss) {
  const out = [];
  for (let i = 0; i < keys.length; i += 120) {
    const chunk = keys.slice(i, i + 120);
    let res = null;
    for (let t = 0; t < 3 && !res; t++) {
      try {
        const r = await fetch(`${BASE}/mget?keys=${chunk.map(encodeURIComponent).join(',')}`, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (Array.isArray(j?.results) && j.results.length === chunk.length) res = j.results;
      } catch { await new Promise((z) => setTimeout(z, 300 * (t + 1))); }
    }
    if (!res) { miss.n += chunk.length; res = chunk.map(() => null); }
    out.push(...res);
  }
  return out;
}

/** 클릭 태그 전체 — mkt-clicks-platform.js 와 같은 합집합(channels.json id·tag + 클릭 캐시 + 사이트 태그). */
function allTags() {
  const out = new Set(['home', 'seo', 'seo_sg', 'seo_uc', 'seo_wim', 'seo_darkpool', 'share', 'reddit_bio', 'quora_bio', 'x_reply', 'github_profile', 'bluesky_bio']);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
    for (const c of (Array.isArray(raw) ? raw : raw.channels || [])) for (const t of [c.id, c.tag]) if (/^[a-z0-9_]{1,24}$/.test(t || '')) out.add(t);
  } catch { /* 채널표 없음 */ }
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.agent/marketing/clicks-cache.json'), 'utf8');
    for (const m of txt.matchAll(/"([a-z0-9_]{2,24})"/g)) if (!/^\d/.test(m[1])) out.add(m[1]);
  } catch { /* 캐시 없음 */ }
  return [...out];
}

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

async function main() {
  const args = process.argv.slice(2);
  const DAYS = Math.max(1, Math.min(45, Number(args.find((a) => /^\d+$/.test(a)) || 7)));
  const PREVIEW = args.includes('--preview');
  const KEY = proxyKey();
  const ns = PREVIEW ? 'fxp' : 'fx';
  const rns = PREVIEW ? 'refp' : 'ref';
  const dates = [...Array(DAYS)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
  const miss = { n: 0 };

  // ① 퍼널 본표
  const mainKeys = [];
  for (const d of dates) for (const st of TABLE_STAGES) for (const s of TABLE_SRCS) for (const p of PLATS) mainKeys.push([`${ns}:${st}:${s}:${p}:${d}`, st, s, p]);
  const mainVals = await mget(mainKeys.map((k) => k[0]), KEY, miss);
  const agg = {}; // src → plat → stage → n
  const tot = Object.fromEntries(TABLE_STAGES.map((st) => [st, 0]));
  mainKeys.forEach(([, st, s, p], i) => {
    const n = Number(mainVals[i]) || 0;
    if (!n) return;
    ((agg[s] ||= {})[p] ||= {})[st] = ((agg[s][p] || {})[st] || 0) + n;
    tot[st] += n;
  });

  console.log(`\n── ① 구독 퍼널 (최근 ${DAYS}일 · ET ${dates[dates.length - 1]} ~ ${dates[0]}${PREVIEW ? ' · 프리뷰 칸' : ''}) ──`);
  const head = ['열림', '버튼', '성공', '취소', '오류', '복원됨', '복원없음', '복원오류', '코드열기', '코드계속', '코드PRO'];
  console.log(pad('출처', 16) + pad('플랫폼', 8) + head.map((h) => lpad(h, 7)).join('') + lpad('버튼/열림', 10) + lpad('성공/버튼', 10));
  const rows = [];
  for (const s of TABLE_SRCS) for (const p of PLATS) {
    const r = agg[s]?.[p]; if (!r) continue;
    rows.push([s, p, r]);
  }
  rows.sort((a, b) => (b[2].open || 0) - (a[2].open || 0));
  for (const [s, p, r] of rows) {
    console.log(pad(SRC_KO[s] || s, 16) + pad(p, 8) + TABLE_STAGES.map((st) => lpad(r[st] || 0, 7)).join('') + lpad(pct(r.cta || 0, r.open || 0), 10) + lpad(pct(r.buy_ok || 0, r.cta || 0), 10));
  }
  if (!rows.length) console.log('(기록 없음)');
  console.log('─'.repeat(24 + 7 * TABLE_STAGES.length + 20));
  console.log(pad('합계', 24) + TABLE_STAGES.map((st) => lpad(tot[st], 7)).join('') + lpad(pct(tot.cta, tot.open), 10) + lpad(pct(tot.buy_ok, tot.cta), 10));

  // ② 버전·오류 코드(한 날짜에 한 키로 모은 분해표)
  const blobKeys = dates.flatMap((d) => [`${ns}:v:${d}`, `${ns}:c:${d}`]);
  const blobs = await mget(blobKeys, KEY, miss);
  const ver = {}, code = {};
  blobs.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    const into = blobKeys[i].includes(':v:') ? ver : code;
    for (const [k, n] of Object.entries(b)) { if (NON_FUNNEL_STAGES.has(k.split('|')[0])) continue; into[k] = (into[k] || 0) + (Number(n) || 0); }
  });
  const verRows = Object.entries(ver).sort((a, b) => b[1] - a[1]);
  if (verRows.length) {
    console.log('\n── 앱 버전별 (단계|플랫폼|버전) ──');
    for (const [k, n] of verRows) console.log(pad(k, 32) + lpad(n, 6));
  }
  const codeRows = Object.entries(code).sort((a, b) => b[1] - a[1]);
  console.log('\n── 오류 코드 (단계|플랫폼|코드) ──');
  if (!codeRows.length) console.log('(오류 없음)');
  for (const [k, n] of codeRows) { const c = k.split('|')[2]; console.log(pad(k, 32) + lpad(n, 6) + '  ' + (CODE_KO[c] || '')); }


  // ④ 첫 실행 «가치 먼저» (2026-10-12 · 코드 src/lib/app/firstRunValue.ts) — 하루 합계만, 식별자·종목 없음
  //   퍼널: 법적 고지 노출 → 마침 → 가치 노출 → (고른 수) → 담고 계속/건너뛰기 → 알림 노출 → 알림 받기/나중에 → 권한 허용/거절
  //   ⚠ 안드로이드 «앱»은 보내지 않는다(위 FUNNEL_SEND_ANDROID). web = 브라우저(내 확인 접속 포함) — 앱 숫자는 iOS 로 본다.
  const onbKeys = [];
  for (const d of dates) for (const p of PLATS) {
    for (const [st, srcs] of [
      ['onb_show', ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_lko', 'onb_len', 'onb_lja', 'onb_lrep']],
      ['onb_done', ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_lko', 'onb_len', 'onb_lja']],
      ['onb_skip', ['onb_value', 'onb_notif']],
      ['onb_pick', ['onb_n1', 'onb_n2', 'onb_n3', 'onb_dflt', 'onb_dkeep', 'onb_dedit']],
      ['onb_perm', ['onb_allow', 'onb_deny']],
      ['onb_card', ['onb_ai', 'onb_noai', 'onb_earn']],
      ['onb_nudge', ['onb_legal']],
      ['onb_pin', ['onb_legal']],
      ['onb_tap', ['onb_legal']],
      ['onb_check', ['onb_legal']],
      ['onb_hide', ['onb_legal']],
    ]) for (const s of srcs) onbKeys.push([`${ns}:${st}:${s}:${p}:${d}`, p, st, s]);
  }
  const onbVals = await mget(onbKeys.map((k) => k[0]), KEY, miss);
  const onb = {}; // plat → "stage:src" → n
  onbKeys.forEach(([, p, st, s], i) => { const n = Number(onbVals[i]) || 0; if (n) { const r = (onb[p] ||= {}); r[`${st}:${s}`] = (r[`${st}:${s}`] || 0) + n; } });
  console.log(`\n── ④ 첫 실행 «가치 먼저» (최근 ${DAYS}일 · 플랫폼별) ──`);
  const onbPlats = PLATS.filter((p) => onb[p]);
  if (!onbPlats.length) console.log('(기록 없음 — 새로 설치한 기기부터 쌓인다. 기존 사용자는 첫 안내를 이미 마쳐 뜨지 않는다)');
  for (const p of onbPlats) {
    const g = (st, src) => onb[p][`${st}:${src}`] || 0;
    console.log(`[${p}]`);
    console.log('  법적 고지   노출 ' + lpad(g('onb_show', 'onb_legal'), 4) + ' → 마침 ' + lpad(g('onb_done', 'onb_legal'), 4) + '  (' + pct(g('onb_done', 'onb_legal'), g('onb_show', 'onb_legal')) + ')' + (g('onb_nudge', 'onb_legal') ? ' · 동의 전 회색 [계속] 누름 ' + g('onb_nudge', 'onb_legal') + '(→ 체크 줄로 굴림 · 고정 줄이 떠 있으면 그 줄 깜빡임)' : '') + (g('onb_pin', 'onb_legal') ? ' · 고정 체크 줄 보임 ' + g('onb_pin', 'onb_legal') + '(체크 줄이 화면 밖이던 기기)' : ''));
    {
      // ★11/20 법적 고지 진단(lib/app/legalDiag) — 배포 뒤 날짜부터 쌓인다. 언어별 노출→마침 · 재실행 노출 · 만짐 · 체크 · 떠남
      const lk = ['onb_lko', 'onb_len', 'onb_lja'].map((s) => s.slice(5) + ' ' + g('onb_show', s) + '→' + g('onb_done', s) + ' (' + pct(g('onb_done', s), g('onb_show', s)) + ')');
      const diag = ['onb_lko', 'onb_len', 'onb_lja'].reduce((a, s) => a + g('onb_show', s) + g('onb_done', s), 0) + g('onb_show', 'onb_lrep') + g('onb_tap', 'onb_legal') + g('onb_check', 'onb_legal') + g('onb_hide', 'onb_legal');   // 마침만 있는 날도 줄을 낸다(관문 11200637)
      if (diag) {
        console.log('    └ 언어별 노출→마침  ' + lk.join(' · ') + ' · 재실행 노출(이 기기가 전에도 봄) ' + g('onb_show', 'onb_lrep') + '  (ET 날짜별 합계끼리의 비 — 자정 앞뒤로 갈린 몇 건은 오차, 위 «노출 → 마침»과 같은 방식)');
        console.log('    └ 마치기 전 행동    화면 만짐 ' + g('onb_tap', 'onb_legal') + ' · 동의 체크 ' + g('onb_check', 'onb_legal') + ' · 앱 떠남(홈·전환) ' + g('onb_hide', 'onb_legal') + '  (실행당 1회 · 노출 대비 만짐 ' + pct(g('onb_tap', 'onb_legal'), g('onb_show', 'onb_legal')) + ' · 체크 ' + pct(g('onb_check', 'onb_legal'), g('onb_show', 'onb_legal')) + ')');
      }
    }
    console.log('  가치(새)    노출 ' + lpad(g('onb_show', 'onb_value'), 4) + ' → 담고 계속 ' + lpad(g('onb_done', 'onb_value'), 4) + ' (' + pct(g('onb_done', 'onb_value'), g('onb_show', 'onb_value')) + ') · 건너뛰기 ' + lpad(g('onb_skip', 'onb_value'), 4) + ' (' + pct(g('onb_skip', 'onb_value'), g('onb_show', 'onb_value')) + ')');
    const picked = g('onb_pick', 'onb_n1') + g('onb_pick', 'onb_n2') + g('onb_pick', 'onb_n3');
    console.log('    고른 수    1개 ' + lpad(g('onb_pick', 'onb_n1'), 4) + ' · 2개 ' + lpad(g('onb_pick', 'onb_n2'), 4) + ' · 3개 ' + lpad(g('onb_pick', 'onb_n3'), 4) + '  → 평균 ' + (picked ? ((g('onb_pick', 'onb_n1') + 2 * g('onb_pick', 'onb_n2') + 3 * g('onb_pick', 'onb_n3')) / picked).toFixed(2) : '—') + '개');
    if (g('onb_pick', 'onb_dflt')) {
      const dShow = g('onb_pick', 'onb_dflt'), dKeep = g('onb_pick', 'onb_dkeep'), dEdit = g('onb_pick', 'onb_dedit');
      console.log('    기본 선택  골라 둔 채 시작 ' + lpad(dShow, 4) + ' → 그대로 담음 ' + lpad(dKeep, 4) + ' (' + pct(dKeep, dShow) + ') · 바꿔 담음 ' + lpad(dEdit, 4) + ' (' + pct(dEdit, dShow) + ') · 나머지(건너뛰기·이탈) ' + lpad(Math.max(0, dShow - dKeep - dEdit), 4) + '  (2026-11-13~ 실적 임박 인기 종목 기본 선택)');
    }
    const cards = g('onb_card', 'onb_ai') + g('onb_card', 'onb_noai');
    console.log('    카드 상태  AI 한 줄 있음 ' + lpad(g('onb_card', 'onb_ai'), 4) + ' / 없음 ' + lpad(g('onb_card', 'onb_noai'), 4) + ' (있음 ' + pct(g('onb_card', 'onb_ai'), cards) + ') · 실적 임박 줄 ' + lpad(g('onb_card', 'onb_earn'), 4));
    console.log('  알림(새)    노출 ' + lpad(g('onb_show', 'onb_notif'), 4) + ' → [알림 받기] ' + lpad(g('onb_done', 'onb_notif'), 4) + ' (' + pct(g('onb_done', 'onb_notif'), g('onb_show', 'onb_notif')) + ') · [나중에] ' + lpad(g('onb_skip', 'onb_notif'), 4) + ' (' + pct(g('onb_skip', 'onb_notif'), g('onb_show', 'onb_notif')) + ')');
    console.log('  알림 권한   허용 ' + lpad(g('onb_perm', 'onb_allow'), 4) + ' · 거절 ' + lpad(g('onb_perm', 'onb_deny'), 4) + '  → 허용률 ' + pct(g('onb_perm', 'onb_allow'), g('onb_perm', 'onb_allow') + g('onb_perm', 'onb_deny')) + ' (권한 창 결과 기준) · 노출 대비 허용 ' + pct(g('onb_perm', 'onb_allow'), g('onb_show', 'onb_notif')));
    if (g('onb_show', 'onb_oldalert') || g('onb_done', 'onb_oldalert')) {
      console.log('  옛 흐름 2/2 노출 ' + lpad(g('onb_show', 'onb_oldalert'), 4) + ' → [시작하기] ' + lpad(g('onb_done', 'onb_oldalert'), 4) + '  (끄기 스위치 onb2:off 일 때 · 허용률은 위 «알림 권한»에 합산됨)');
    }
  }

  // ★11/20 첫 실행 체험 페이월 도달 — 첫 실행 마침(알림 단계 받기+나중에, 알림 단계가 없으면 가치 단계 끝) 대비 판정 시작·열림·안 보인 이유
  //   (lib/app/firstRunPaywall · fr_judge 는 배포 뒤 날짜부터 쌓인다. 판정 시작 = 결론 하나(열림 또는 이유 하나) + 판정 중 화면 이동)
  {
    const frKeys = [];
    for (const d of dates) for (const p of ['ios', 'android']) {
      for (const s of FR_SRCS) frKeys.push([`${ns}:fr_judge:${s}:${p}:${d}`, p, s]);
      frKeys.push([`${ns}:open:first_run:${p}:${d}`, p, 'open']);
      frKeys.push([`${ns}:cta:first_run:${p}:${d}`, p, 'cta']);
      frKeys.push([`${ns}:buy_ok:first_run:${p}:${d}`, p, 'buy_ok']);
      for (const [st, src] of [['onb_done', 'onb_notif'], ['onb_skip', 'onb_notif'], ['onb_done', 'onb_oldalert']]) frKeys.push([`${ns}:${st}:${src}:${p}:${d}`, p, `${st}:${src}`]);
    }
    const frVals = await mget(frKeys.map((k) => k[0]), KEY, miss);
    const fr = {};
    frKeys.forEach(([, p, s], i) => { const n = Number(frVals[i]) || 0; const r = (fr[p] ||= {}); r[s] = (r[s] || 0) + n; });
    console.log(`\n── 첫 실행 체험 페이월 도달 (최근 ${DAYS}일 · 횟수 · 첫 실행 마침 = 알림 단계 받기+나중에+옛 흐름 시작하기) ──`);
    for (const p of ['ios', 'android']) {
      const r = fr[p] || {};
      const doneOnb = (r['onb_done:onb_notif'] || 0) + (r['onb_skip:onb_notif'] || 0) + (r['onb_done:onb_oldalert'] || 0);
      const outs = FR_SRCS.filter((s) => s !== 'fr_try' && s !== 'fr_late');
      const skipped = outs.reduce((a, s) => a + (r[s] || 0), 0);
      console.log(`${p}  첫 실행 마침 ${doneOnb} → 판정 시작 ${r.fr_try || 0} → 열림 ${r.open || 0} (마침 대비 ${pct(r.open || 0, doneOnb)} · 판정 대비 ${pct(r.open || 0, r.fr_try || 0)}) · 재시도·늦게 보임 ${r.fr_late || 0} · 버튼 ${r.cta || 0} · 결제 ${r.buy_ok || 0}`);
      if (r.fr_try || skipped) console.log('   └ 안 보인 이유  ' + outs.map((s) => `${FR_KO[s]} ${r[s] || 0}`).join(' · ') + `  (판정 시작 − 열림 − 이유 합 = 판정 중 앱 끔·화면 이동 ${Math.max(0, (r.fr_try || 0) - (r.open || 0) - skipped)})`);
    }
  }

  // ★11/20 광고 잠금해제(1시간·앱 전역 — ValueWall) — 주어진 횟수(기기·사용자 수 아님)와 같은 기간 게이트 페이월
  {
    const rwKeys = [];
    for (const d of dates) for (const p of ['ios', 'android']) {
      for (const s of ['value_wall', 'ad_modal']) rwKeys.push([`${ns}:reward_ok:${s}:${p}:${d}`, p, s]);
      for (const s of ['gate_first', 'ad_nofill']) for (const st of ['open', 'buy_ok']) rwKeys.push([`${ns}:${st}:${s}:${p}:${d}`, p, `${st}:${s}`]);
    }
    const rwVals = await mget(rwKeys.map((k) => k[0]), KEY, miss);
    const rw = {};
    rwKeys.forEach(([, p, s], i) => { const n = Number(rwVals[i]) || 0; const r = (rw[p] ||= {}); r[s] = (r[s] || 0) + n; });
    console.log(`\n── 광고 잠금해제 (최근 ${DAYS}일 · 횟수 · 11/20 배포 뒤부터) ──`);
    for (const p of ['ios', 'android']) {
      const r = rw[p] || {};
      console.log(`${p}  보상형 광고 끝까지 봄 ${r.value_wall || 0} · 대체 30초 창 ${r.ad_modal || 0} · 게이트 하루 첫 탭 페이월 ${r['open:gate_first'] || 0}(결제 ${r['buy_ok:gate_first'] || 0}) · 광고 없음 페이월 ${r['open:ad_nofill'] || 0}(결제 ${r['buy_ok:ad_nofill'] || 0})`);
    }
  }

  // ★11/20 스토어 평점 요청(lib/app/reviewBeacon) — 횟수(기기 수 아님). rv_ask = OS 평점 API 를 «요청»한 횟수(OS 가 실제로 보였는지는 알 수 없다)
  {
    const rvKeys = [];
    for (const d of dates) for (const p of ['ios', 'android']) {
      for (const s of ['rv_yes', 'rv_no']) rvKeys.push([`${ns}:rv_cap:${s}:${p}:${d}`, p, 'rv_cap', s]);
      for (const st of ['rv_ask', 'rv_block']) for (const s of RV_MOMENTS) rvKeys.push([`${ns}:${st}:${s}:${p}:${d}`, p, st, s]);
      for (const s of RV_WHYS) rvKeys.push([`${ns}:rv_why:${s}:${p}:${d}`, p, 'rv_why', s]);
      rvKeys.push([`${ns}:active:app:${p}:${d}`, p, 'active', 'app']);
    }
    const rvVals = await mget(rvKeys.map((k) => k[0]), KEY, miss);
    const rv = {}; // plat → "stage:src" → n
    rvKeys.forEach(([, p, st, s], i) => { const n = Number(rvVals[i]) || 0; if (n) { const r = (rv[p] ||= {}); r[`${st}:${s}`] = (r[`${st}:${s}`] || 0) + n; } });
    console.log(`\n── 스토어 평점 요청 (최근 ${DAYS}일 · 횟수 · 11/20 배포 뒤부터 · 요청 = OS API 호출, 표시 여부는 OS 가 정함) ──`);
    for (const p of ['ios', 'android']) {
      const g = (st, s) => rv[p]?.[`${st}:${s}`] || 0;
      const ask = RV_MOMENTS.reduce((a, s) => a + g('rv_ask', s), 0);
      const blk = RV_MOMENTS.reduce((a, s) => a + g('rv_block', s), 0);
      console.log(`${p}  플러그인 있음 ${g('rv_cap', 'rv_yes')} · 없음 ${g('rv_cap', 'rv_no')} (기기·일, 같은 기간 활성 ${g('active', 'app')}) · 요청 ${ask} · 못 부름 ${blk}`);
      const moments = RV_MOMENTS.filter((s) => g('rv_ask', s) || g('rv_block', s));
      if (moments.length) console.log('   └ 순간별(요청/못 부름)  ' + moments.map((s) => `${RV_KO[s]} ${g('rv_ask', s)}/${g('rv_block', s)}`).join(' · '));
      const whys = RV_WHYS.filter((s) => g('rv_why', s));
      if (whys.length) console.log('   └ 못 부른 이유          ' + whys.map((s) => `${RV_KO[s]} ${g('rv_why', s)}`).join(' · '));
    }
  }

  // 체험 안내 집계 — 동의 완료율·실제 유료 전환율과 구분한다.
  console.log('\n── 체험 종료 안내 (횟수 · 고유 사용자/동의 완료/유료 갱신 아님) ──');
  for (const platform of ['ios', 'android']) {
    const counts = {};
    for (const stage of TRIAL_STAGES) {
      const values = await mget(dates.map((day) => `${ns}:${stage}:trial_notice:${platform}:${day}`), KEY, miss);
      counts[stage] = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    }
    console.log(`${platform}  표시 ${counts.trial_notice_show} · 관리 탭 ${counts.trial_notice_manage} · 7일 숨김 ${counts.trial_notice_snooze} · 관리 탭/표시 ${pct(counts.trial_notice_manage, counts.trial_notice_show)}`);
  }

  // ★11/11 trial_off = 마지막 3일(D-3) · trial_off_early = 갱신 끈 직후 1회
  for (const [src, label] of [['trial_off', '갱신 끈 체험 안내 · 마지막 3일'], ['trial_off_early', '갱신 끈 체험 안내 · 끈 직후 1회']]) {
    console.log(`\n── ${label} (횟수 · 유료 갱신 아님) ──`);
    for (const platform of ['ios', 'android']) {
      const counts = {};
      for (const stage of TRIAL_OFF_STAGES) {
        const values = await mget(dates.map((day) => `${ns}:${stage}:${src}:${platform}:${day}`), KEY, miss);
        counts[stage] = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
      }
      console.log(`${platform}  표시 ${counts.trial_off_show} · 요금제 탭 ${counts.trial_off_plans} · 관리 탭 ${counts.trial_off_manage} · 닫기 ${counts.trial_off_close} · 만료 ${counts.trial_off_expired}`);
    }
  }

  // ★11/18 체험자 알림 다시 묻기 — 시트 보임 → [알림 켜기] → OS 허용·거절(밀어 닫음·모름은 켜기 − 허용 − 거절) · [나중에]
  console.log('\n── 체험자 알림 다시 묻기 (횟수 · 기기당 1회 · 유료 전환 아님) ──');
  for (const src of TRIAL_PUSH_SRCS) {
    for (const platform of ['ios', 'android']) {
      const counts = {};
      for (const stage of TRIAL_PUSH_STAGES) {
        const values = await mget(dates.map((day) => `${ns}:${stage}:${src}:${platform}:${day}`), KEY, miss);
        counts[stage] = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
      }
      console.log(`${src === 'tpush_ai' ? '첫 AI 한 줄' : '다음 날 실행'} ${platform}  보임 ${counts.trial_push_shown} · 켜기 ${counts.trial_push_accept} (${pct(counts.trial_push_accept, counts.trial_push_shown)}) · OS 허용 ${counts.trial_push_os_granted} · OS 거절 ${counts.trial_push_os_denied} · 나중에 ${counts.trial_push_dismiss}`);
    }
  }

  console.log('\n── 해지 사유 (횟수 · 무응답 포함, 고유 사용자 아님) ──');
  // 플랫폼×단계×날짜를 한 번의 mget 으로(요청 1회)
  const reasonKeys = [];
  for (const platform of PLATS) for (const stage of CANCEL_REASON_STAGES) for (const day of dates) reasonKeys.push([`${ns}:${stage}:other:${platform}:${day}`, platform, stage]);
  const reasonVals = await mget(reasonKeys.map((k) => k[0]), KEY, miss);
  const reasonCounts = {};
  reasonKeys.forEach(([, platform, stage], i) => {
    const row = (reasonCounts[platform] ||= {});
    row[stage] = (row[stage] || 0) + (Number(reasonVals[i]) || 0);
  });
  for (const platform of PLATS) {
    const counts = reasonCounts[platform] || {};
    console.log(`${platform}  ${CANCEL_REASON_STAGES.map((stage) => `${stage.slice(14)} ${counts[stage] || 0}`).join(' · ')}`);
  }

  // ③ 스마트링크 «어디서 왔나»
  const tags = allTags();
  const refKeys = [];
  for (const app of REF_APPS) for (const t of tags) for (const d of dates) refKeys.push([`${rns}:${app}:${t}:${d}`, app, t]);
  const refVals = await mget(refKeys.map((k) => k[0]), KEY, miss);
  const ref = {}; // "app from" → bucket → {ios, android, desktop}
  refKeys.forEach(([, app, t], i) => {
    const b = refVals[i];
    if (!b || typeof b !== 'object') return;
    for (const [f, n] of Object.entries(b)) {
      const [dev, bucket] = f.split('|');
      const row = ((ref[`${app} ${t}`] ||= {})[bucket] ||= { ios: 0, android: 0, desktop: 0 });
      if (dev in row) row[dev] += Number(n) || 0;
    }
  });
  console.log(`\n── ③ 스마트링크 «어디서 왔나» (앱 from · 유입분류 · 폰 먼저) ──`);
  const groups = Object.entries(ref).map(([g, byB]) => {
    const phone = Object.values(byB).reduce((a, r) => a + r.ios + r.android, 0);
    const all = Object.values(byB).reduce((a, r) => a + r.ios + r.android + r.desktop, 0);
    return { g, byB, phone, all };
  }).sort((a, b) => b.phone - a.phone || b.all - a.all);
  if (!groups.length) console.log('(기록 없음 — 배포 뒤부터 쌓인다)');
  for (const { g, byB, phone, all } of groups) {
    console.log(`${g}  — 폰 ${phone} / 전체 ${all}`);
    for (const [bucket, r] of Object.entries(byB).sort((a, b) => (b[1].ios + b[1].android) - (a[1].ios + a[1].android) || b[1].desktop - a[1].desktop)) {
      console.log('   ' + pad(bucket, 14) + `iOS ${lpad(r.ios, 4)} · 안드 ${lpad(r.android, 4)} · PC ${lpad(r.desktop, 4)}`);
    }
  }
  console.log('\n· 분해표(버전·코드·유입)는 get+set 이라 같은 순간 요청이 겹치면 본표 합계보다 조금 작을 수 있다(기존 클릭 카운터와 같은 방식).');
  if (miss.n) console.log(`⚠ 못 읽은 키 ${miss.n}개 — 위 숫자는 «최소값»이다(프록시 응답 실패).`);
}

module.exports = { STAGES, SRCS, PLATS, REF_APPS, ONB_STAGES, ONB_SRCS, RV_STAGES, RV_SRCS };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
