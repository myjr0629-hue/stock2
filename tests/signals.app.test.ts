/**
 * 내 종목 이상 신호 — 앱·서버 연결부 시험(소스 검사) (2026-10-13)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/signals.app.test.ts
 *
 * 지키는 것(대표 10/12 «기존 화면 문구·라벨·배치 변경 금지»):
 *   · 설정 화면 — 기존 줄(알림 / 모닝 브리핑 / 장마감 리포트)의 문구·순서는 그대로, «내 종목 이상 신호» 새 줄만 끝에 하나 추가(3개 언어)
 *   · 토글을 서버가 지킨다 — 설정 PUT 이 signals 를 보내고, 서버 PUT 라우트가 병합하고, 발송 기기 판정이 읽는다
 *   · 등록 경로 — 앱 실행 등록 POST 두 곳이 내 종목 사본·시간대·권한을 함께 올리고, 권한이 꺼져 있으면 «묻지 않고» 꺼짐만 알린다
 *   · 탭 — wl_signal 푸시는 그 종목 Flow 로 가고 종류별 계측 출처를 센다 · 하단 내비·광고·페이월 파일은 건드리지 않았다
 *   · 모닝·마감 푸시는 그대로(제목·본문·발송 계획) — 발송 함수의 기존 계약 불변
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ROOT = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SETTINGS = 'src/app/[locale]/app-view/settings/page.tsx';

console.log('━━━ 1. 설정 화면 ━━━');
t('기존 알림 줄의 문구·순서 그대로 + 새 줄은 장마감 리포트 줄 «뒤»에 하나', () => {
  const s = read(SETTINGS);
  const tMorning = s.indexOf('<div className={s.subLabel}>{t.morning}</div>');
  const tClosing = s.indexOf('<div className={s.subLabel}>{t.closing}</div>');
  const tSignals = s.indexOf('<div className={s.subLabel}>{t.signals}</div>');
  assert.ok(tMorning > 0 && tClosing > tMorning && tSignals > tClosing, '모닝 → 마감 → 신호 순서');
  assert.equal((s.match(/\{t\.signals\}/g) || []).length, 1, '새 줄은 하나');
  // 기존 문구 보존(3개 언어)
  for (const lit of ["notifications: '알림'", "notifSub: '푸시 알림을 설정합니다'", "morning: '모닝 브리핑'", "morningSub: '장 전 시장 요약 알림'", "closing: '장마감 리포트'", "closingSub: '장마감 후 분석 리포트 알림'",
    "notifications: 'Notifications'", "morning: 'Morning Briefing'", "closing: 'Closing Report'", "morningSub: 'Pre-market summary alert'", "closingSub: 'Post-market analysis alert'",
    "notifications: '通知'", "morning: 'モーニングブリーフ'", "closing: 'クロージングレポート'", "morningSub: 'プレマーケットサマリー通知'", "closingSub: '引け後の分析レポート通知'"]) assert.ok(s.includes(lit), lit);
});
t('새 줄 문구 — 한·영·일', () => {
  const s = read(SETTINGS);
  assert.ok(s.includes("signals: '내 종목 이상 신호'") && s.includes("signalsSub: '내 종목의 다크풀·Max Pain·실적 등 변화 알림'"));
  assert.ok(s.includes("signals: 'Watchlist Signals'") && s.includes("signalsSub: 'Unusual moves in your watchlist'"));
  assert.ok(s.includes("signals: 'マイ銘柄の異常シグナル'") && s.includes("signalsSub: 'マイ銘柄の異変を通知'"));
});
t('새 줄은 같은 서브행 틀(subRow·subLabel·subNote·toggle)을 그대로 쓴다 · 기본 켜짐', () => {
  const s = read(SETTINGS);
  const i = s.indexOf('<div className={s.subLabel}>{t.signals}</div>');
  const block = s.slice(s.lastIndexOf('<div className={s.subRow}>', i), s.indexOf('</div>\n            </div>', i) + 20);
  assert.ok(block.includes('s.subNote') && block.includes('s.toggle') && block.includes('s.toggleOn') && block.includes('prefs.signals'));
  assert.ok(s.includes("{ enabled: true, morning: true, closing: true, signals: true }"), '기본값 켜짐');
  assert.ok(s.includes("{ signals: true, ...JSON.parse(raw) }"), '옛 저장값엔 signals 가 없다 → 켜짐으로');
});
t('토글을 서버로 — PUT 본문에 signals · 마스터 enabled 도 그대로', () => {
  const s = read(SETTINGS);
  assert.match(s, /JSON\.stringify\(\{ token, enabled: next\.enabled, morning: next\.morning, closing: next\.closing, signals: next\.signals \}\)/);
});

console.log('━━━ 2. 서버가 토글을 지킨다 ━━━');
t('PUT /api/push/preferences 는 sanitizePrefs/mergePrefs 로 signals 까지 병합(코드 불변 — lib/push/prefs 가 처리)', () => {
  const r = read('src/app/api/push/preferences/route.ts');
  assert.match(r, /mergePrefs\(data\.preferences, sanitizePrefs\(body\)\)/);
  const p = read('src/lib/push/prefs.ts');
  assert.match(p, /for \(const k of \['enabled', 'morning', 'closing', 'signals'\] as const\)/);
});
t('발송 기기 판정은 wantsPush(rec,"signals")와 notifPerm 을 읽는다', () => {
  const pl = read('src/lib/signals/plan.ts');
  assert.match(pl, /wantsPush\(rec, 'signals'\)/); assert.match(pl, /rec\.notifPerm === false/);
});
t('모닝·마감 발송 계약 불변 — planPush 는 morning/closing 만 · 제목 상수 그대로', () => {
  const s = read('src/lib/push/send.ts');
  assert.match(s, /wantsPush\(data, type\)/);
  for (const lit of ["title: '🌅 모닝 브리프'", "title: '📊 장마감 리포트'", "body: '오늘의 프리마켓 시장 브리프가 준비됐습니다.'", "title: '🌅 Morning Brief'", "title: '📊 クロージングレポート'"]) assert.ok(s.includes(lit), lit);
  assert.ok(!/signals/.test(s.slice(s.indexOf('export async function planPush'), s.indexOf('export interface PushSendStats'))), 'planPush 에 신호 얘기가 섞이지 않았다');
});

console.log('━━━ 3. 기기 → 서버 사본(기존 등록 경로) ━━━');
t('앱 실행 등록 POST 두 곳 — 내 종목 사본·시간대·알림 권한을 같이 올린다', () => {
  const o = read('src/components/app/AppFirstRunOnboarding.tsx');
  assert.equal((o.match(/signalSyncExtras\(\)/g) || []).length, 2, '첫 허용 등록 + 매 실행 등록');
  assert.equal((o.match(/markSignalSynced\(extras\.tickers, token\)/g) || []).length, 2);
  assert.ok(o.includes("body: JSON.stringify({ token, platform, locale: resolveAppLocale(), preferences: readStoredPushPrefs() ?? undefined, ...extras, notifPerm: true })"));
});
t('권한이 꺼져 있으면 «묻지 않는다» — 저장된 토큰이 있을 때만 notifPerm:false 를 알린다(requestPermissions 는 첫 허용 흐름에만)', () => {
  const o = read('src/components/app/AppFirstRunOnboarding.tsx');
  const launch = o.slice(o.indexOf('Re-register the push token on EVERY app launch'), o.indexOf('설정은 «보이는 동안만»'));
  assert.ok(launch.includes('notifPerm: false')); assert.ok(!launch.includes('requestPermissions'), '매 실행 등록은 권한을 요청하지 않는다');
  const sync = read('src/lib/app/signalSync.ts');
  assert.ok(!sync.includes('requestPermissions'), '동기화 모듈도 권한을 요청하지 않는다');
  assert.match(sync, /if \(perm\?\.receive !== 'granted'\) return 'skip'/);
});
t('서버 등록 라우트 — tickers·tz·notifPerm 을 mergeRegistration 에 넘기고, 권한 꺼짐 보고만 온 모르는 토큰은 만들지 않는다', () => {
  const r = read('src/app/api/push/register/route.ts');
  assert.match(r, /const \{ token, platform, locale, app, preferences, tickers, tz, notifPerm \} = body/);
  assert.match(r, /mergeRegistration\(existing, \{ token, platform, locale, app: appId, preferences, tickers, tz, notifPerm \}/);
  assert.match(r, /!existing && notifPerm === false && !platform/);
});
t('목록이 바뀌면 5초 뒤 한 번 — 네이티브만 · 변경 이벤트(sg:watchlist) 구독 · 정리', () => {
  const l = read('src/app/[locale]/app-view/layout.tsx');
  assert.match(l, /window\.addEventListener\(WATCHLIST_CHANGE_EVENT, schedule\)/); assert.match(l, /setTimeout\(\(\) => \{ void syncSignalWatchlist\(\); \}, 5000\)/);
  assert.match(l, /window\.removeEventListener\(WATCHLIST_CHANGE_EVENT, schedule\)/);
  const idx = l.indexOf('내 종목 이름 목록을 서버 사본에 맞춘다');
  assert.ok(l.slice(idx, idx + 600).includes('isNativePlatform()'), '네이티브만');
  assert.match(read('src/lib/app/watchlist.ts'), /WATCHLIST_CHANGE_EVENT = 'sg:watchlist'/);
});
t('서버로 가는 것은 종목 이름·시간대·권한뿐 — 가격·메모·담은 시각·출처는 안 간다', () => {
  const s = read('src/lib/app/signalSync.ts');
  assert.match(s, /parseWatchlist\(window\.localStorage\.getItem\(WATCHLIST_STORAGE_KEY\)\)\.map\(\(i\) => i\.t\)/);
  assert.ok(!/addedAt|\.src\b/.test(s.replace(/\/\/.*$/gm, '')), 'addedAt·src 는 보내지 않는다');
  const body = s.slice(s.indexOf("fetch('/api/push/register'"), s.indexOf("if (!res.ok)"));
  assert.ok(/token, platform: Capacitor\.getPlatform\(\), locale: resolveAppLocale\(\), tickers, \.\.\.\(tz \? \{ tz \} : \{\}\), notifPerm: true/.test(body));
});

console.log('━━━ 4. 탭 → 그 종목 Flow · 계측 ━━━');
t('wl_signal 푸시 탭 → /{loc}/app-view/flow?t=…&from=sig · pendingDeepLink 저장 경로를 그대로 탄다', () => {
  const l = read('src/app/[locale]/app-view/layout.tsx');
  assert.match(l, /const sigPath = type === 'wl_signal' \? signalTapPath\(action\?\.notification\?\.data\?\.path\) : null/);
  assert.match(l, /: sigPath\s*\? `\/\$\{loc\}\$\{sigPath\}`/);
  assert.match(l, /if \(!target\) return;/); assert.match(l, /sessionStorage\.setItem\('signumhq\.pendingDeepLink', target\)/);
  assert.ok(l.includes("'watchlist_alert' && WATCHLIST_ALERTS_BUILD_FLAG"), '옛 PRO 알림 라우팅(플래그 뒤)은 그대로');
});
t('종류별 탭 계측 — push_open 의 출처가 push_sig_*(닫힌 목록)일 때만 센다', () => {
  const l = read('src/app/[locale]/app-view/layout.tsx');
  assert.match(l, /type === 'wl_signal'/); assert.match(l, /trackFunnel\('push_open', \{ src: sigSrc \}\)/);
  const f = read('src/lib/app/funnelSchema.ts');
  for (const s of ['push_sig_wall', 'push_sig_pain', 'push_sig_dark', 'push_sig_oi', 'push_sig_earn']) assert.ok(f.includes(`'${s}'`), s);
});
t('layout.tsx 는 default 말고는 아무것도 내보내지 않는다(Next 규칙) — 보조 함수는 lib/app/signalTap', () => {
  const l = read('src/app/[locale]/app-view/layout.tsx');
  const exports = l.match(/^export .*/gm) || [];
  assert.deepEqual(exports, ['export default function AppViewLayout({ children }: { children: React.ReactNode }) {']);
});

console.log('━━━ 5. 개인정보 안내 ━━━');
t('개인정보 안내 — 앱 개인정보처리방침에 «내 종목 이름 목록·시간대» 항목이 3개 언어로 있다', () => {
  const d = read('src/components/app/AppLegalDocument.tsx');
  assert.ok(d.includes('“내 종목 이상 신호” 알림을 보내기 위해 푸시 알림 토큰에 연결해 저장하는 내 종목 이름 목록'));
  assert.ok(d.includes('to send “Watchlist Signals” alerts'));
  assert.ok(d.includes('「マイ銘柄の異常シグナル」通知の送信のため'));
});

console.log(`\n${n}개 통과`);
