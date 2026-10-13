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
 * ⚠ 안드로이드 «앱»은 아직 퍼널을 보내지 않는다(Play 데이터 보안 선언 전 — src/lib/app/funnel.ts FUNNEL_SEND_ANDROID).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

// ── 닫힌 목록 — src/lib/app/funnelSchema.ts 와 같아야 한다(tests/funnel.test.ts 가 대조) ──
const STAGES = ['open', 'cta', 'buy_ok', 'buy_cancel', 'buy_err', 'restore_ok', 'restore_none', 'restore_err', 'code_open', 'code_cta', 'code_pro', 'push_open', 'active', 'ai_seen', 'ai_tap', 'onb_show', 'onb_done', 'onb_skip', 'onb_pick', 'onb_perm', 'onb_card'];   // onb_* = 첫 실행 «가치 먼저» 단계(2026-10-12, 출처 onb_*) · code_* = 🎟 쿠폰 코드 입력(2026-10-05) · code_cta = 안드 안내 시트 [계속](2026-10-06) · push_open·active = 푸시 탭·앱 활성(2026-10-12) · ai_* = «내 종목» AI 한 줄 보임·누름(2026-10-12, 출처 wl_ai)
const SRCS = ['settings', 'value_wall', 'ad_modal', 'dash_gate', 'wl_limit', 'wl_upsell', 'wl_paywall', 'preview', 'other', 'push_morning', 'push_closing', 'push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn', 'app', 'wl_ai', 'today_picks', 'today_page', 'news_page', 'onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_n1', 'onb_n2', 'onb_n3', 'onb_allow', 'onb_deny', 'onb_ai', 'onb_noai', 'onb_earn'];
// 푸시 탭·앱 활성(2026-10-12)은 구독 퍼널이 아니다 — 이 표에서 빼고 scripts/mkt-push.js 가 따로 보여 준다
const ONB_STAGES = ['onb_show', 'onb_done', 'onb_skip', 'onb_pick', 'onb_perm', 'onb_card'];
const ONB_SRCS = ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_n1', 'onb_n2', 'onb_n3', 'onb_allow', 'onb_deny', 'onb_ai', 'onb_noai', 'onb_earn'];
const NON_FUNNEL_STAGES = new Set(['push_open', 'active', 'ai_seen', 'ai_tap', ...ONB_STAGES]);   // ai_* = «내 종목» AI 한 줄(2026-10-12) — 구독 퍼널 아님
const NON_FUNNEL_SRCS = new Set(['push_morning', 'push_closing', 'push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn', 'app', 'wl_ai', 'today_picks', 'today_page', 'news_page', ...ONB_SRCS]);
const TABLE_STAGES = STAGES.filter((st) => !NON_FUNNEL_STAGES.has(st));
const TABLE_SRCS = SRCS.filter((s) => !NON_FUNNEL_SRCS.has(s));
const PLATS = ['ios', 'android', 'web'];
const REF_APPS = ['sg', 'uc', 'wim'];
const SRC_KO = {
  settings: '설정', value_wall: '가치 벽', ad_modal: '광고 창', dash_gate: '대시보드 게이트', wl_limit: '내 종목 한도',
  wl_upsell: '내 종목 PRO 안내', wl_paywall: '내 종목→페이월', preview: '프리뷰', other: '기타',
  push_morning: '푸시 모닝', push_closing: '푸시 마감', push_sig_wall: '신호 푸시 콜월', push_sig_pain: '신호 푸시 맥스페인', push_sig_dark: '신호 푸시 다크풀', push_sig_oi: '신호 푸시 미결제약정', push_sig_earn: '신호 푸시 실적D-1', app: '앱 활성', wl_ai: '내 종목 AI 한 줄', today_picks: '오늘 볼 것 카드', today_page: '오늘 볼 것 전체 페이지', news_page: '뉴스 펄스 전체 페이지',
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
      ['onb_show', ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert']],
      ['onb_done', ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert']],
      ['onb_skip', ['onb_value', 'onb_notif']],
      ['onb_pick', ['onb_n1', 'onb_n2', 'onb_n3']],
      ['onb_perm', ['onb_allow', 'onb_deny']],
      ['onb_card', ['onb_ai', 'onb_noai', 'onb_earn']],
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
    console.log('  법적 고지   노출 ' + lpad(g('onb_show', 'onb_legal'), 4) + ' → 마침 ' + lpad(g('onb_done', 'onb_legal'), 4) + '  (' + pct(g('onb_done', 'onb_legal'), g('onb_show', 'onb_legal')) + ')');
    console.log('  가치(새)    노출 ' + lpad(g('onb_show', 'onb_value'), 4) + ' → 담고 계속 ' + lpad(g('onb_done', 'onb_value'), 4) + ' (' + pct(g('onb_done', 'onb_value'), g('onb_show', 'onb_value')) + ') · 건너뛰기 ' + lpad(g('onb_skip', 'onb_value'), 4) + ' (' + pct(g('onb_skip', 'onb_value'), g('onb_show', 'onb_value')) + ')');
    const picked = g('onb_pick', 'onb_n1') + g('onb_pick', 'onb_n2') + g('onb_pick', 'onb_n3');
    console.log('    고른 수    1개 ' + lpad(g('onb_pick', 'onb_n1'), 4) + ' · 2개 ' + lpad(g('onb_pick', 'onb_n2'), 4) + ' · 3개 ' + lpad(g('onb_pick', 'onb_n3'), 4) + '  → 평균 ' + (picked ? ((g('onb_pick', 'onb_n1') + 2 * g('onb_pick', 'onb_n2') + 3 * g('onb_pick', 'onb_n3')) / picked).toFixed(2) : '—') + '개');
    const cards = g('onb_card', 'onb_ai') + g('onb_card', 'onb_noai');
    console.log('    카드 상태  AI 한 줄 있음 ' + lpad(g('onb_card', 'onb_ai'), 4) + ' / 없음 ' + lpad(g('onb_card', 'onb_noai'), 4) + ' (있음 ' + pct(g('onb_card', 'onb_ai'), cards) + ') · 실적 임박 줄 ' + lpad(g('onb_card', 'onb_earn'), 4));
    console.log('  알림(새)    노출 ' + lpad(g('onb_show', 'onb_notif'), 4) + ' → [알림 받기] ' + lpad(g('onb_done', 'onb_notif'), 4) + ' (' + pct(g('onb_done', 'onb_notif'), g('onb_show', 'onb_notif')) + ') · [나중에] ' + lpad(g('onb_skip', 'onb_notif'), 4) + ' (' + pct(g('onb_skip', 'onb_notif'), g('onb_show', 'onb_notif')) + ')');
    console.log('  알림 권한   허용 ' + lpad(g('onb_perm', 'onb_allow'), 4) + ' · 거절 ' + lpad(g('onb_perm', 'onb_deny'), 4) + '  → 허용률 ' + pct(g('onb_perm', 'onb_allow'), g('onb_perm', 'onb_allow') + g('onb_perm', 'onb_deny')) + ' (권한 창 결과 기준) · 노출 대비 허용 ' + pct(g('onb_perm', 'onb_allow'), g('onb_show', 'onb_notif')));
    if (g('onb_show', 'onb_oldalert') || g('onb_done', 'onb_oldalert')) {
      console.log('  옛 흐름 2/2 노출 ' + lpad(g('onb_show', 'onb_oldalert'), 4) + ' → [시작하기] ' + lpad(g('onb_done', 'onb_oldalert'), 4) + '  (끄기 스위치 onb2:off 일 때 · 허용률은 위 «알림 권한»에 합산됨)');
    }
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

module.exports = { STAGES, SRCS, PLATS, REF_APPS, ONB_STAGES, ONB_SRCS };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
