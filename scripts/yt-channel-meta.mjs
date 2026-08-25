#!/usr/bin/env node
// ============================================================================
// yt-channel-meta — 채널의 «국가·기본언어·설명·키워드»를 API 로 넣는다
// ----------------------------------------------------------------------------
// 왜: 새 채널은 이 네 개가 전부 비어 있다. 그런데 이건 장식이 아니라 «배급 설정»이다.
//   - 국가        어느 나라 피드에 실릴지
//   - 기본언어     자동자막·번역·추천의 기준
//   - 설명·키워드  검색 유입의 재료
//   비워두면 유튜브가 알아서 추측한다. 추측하게 두지 않는다.
//
// ⛔ channels.update 는 «보낸 것으로 덮어쓴다». 안 보낸 필드가 날아갈 수 있다.
//   ⇒ 반드시 현재 값을 먼저 읽어 «병합»한 뒤 보낸다. 아래가 그렇게 되어 있다.
//
// 사용:  SIGNUM_YT=jp node scripts/yt-channel-meta.mjs         (미리보기만)
//        SIGNUM_YT=jp node scripts/yt-channel-meta.mjs --write (실제 반영)
// ============================================================================
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
const WHICH = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
// ⛔ 3분기 (2026-08-25 한국 채널 추가). 모르는 값이면 «멈춘다».
const RTKEY = { hq: 'YT_REFRESH_TOKEN', jp: 'YT_JP_REFRESH_TOKEN', kr: 'YT_KR_REFRESH_TOKEN' }[WHICH];
if (!RTKEY) { console.error(`  ⛔ SIGNUM_YT=${WHICH} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const WRITE = process.argv.includes('--write');

// ── 채널별 원하는 값 ────────────────────────────────────────────────────────
// ⛔ 문구는 «우리가 실제로 하는 것»만 쓴다. 실측 근거 없는 수식어를 넣지 않는다.
//   일본어 어휘는 .agent/JP_MARKET.md 실측 상위어에서 골랐다
//   (マックスペイン 소형중앙 15,560 = 최상위 · 機関投資家 · 板読み · 米国株).
const WANT = {
  jp: {
    country: 'JP',
    defaultLanguage: 'ja',
    description: [
      '米国株の値動きを、ニュースではなく「数字」で読みます。',
      '',
      '・マックスペイン — オプション建玉が最も痛む価格',
      '・機関投資家のポジションがどちら側に置かれているか',
      '・いつも通りだった相関が、壊れた瞬間',
      '',
      '公開データを毎日集計して、価格がどこへ引き寄せられているかを出します。',
      '予想ではなく、測定です。',
      '',
      '毎日更新／1本30秒',
      'アプリ signumhq.com/app',
      '',
      '※投資助言ではありません。最終判断はご自身の責任でお願いします。',
    ].join('\n'),
    keywords: 'マックスペイン エヌビディア ウォール街 機関投資家 米国株 板読み "米国株 速報" オプション 建玉 ガンマ ダークプール ナスダック S&P500 半導体株 決算 米国株投資 "株価 なぜ" 相場解説 FRB 金利 ドル円 ボラティリティ テスラ株 アップル株 マイクロン ブロードコム 空売り 出来高 "米国株 初心者"',
  },
};

const want = WANT[WHICH];
if (!want) { console.error(`  ${WHICH} 채널의 설정값이 정의되어 있지 않다 (지금은 jp 만)`); process.exit(1); }

const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  if (!j.access_token) { console.error('  토큰 실패:', JSON.stringify(j).slice(0, 200)); process.exit(1); }
  return j.access_token;
})();

const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

// ── 현재 값 읽기 ────────────────────────────────────────────────────────────
const cur = await (await fetch(
  'https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&mine=true', { headers: H })).json();
const ch = cur.items?.[0];
if (!ch) { console.error('  채널을 못 읽었다:', JSON.stringify(cur).slice(0, 200)); process.exit(1); }
console.log(`\n  채널  ${ch.snippet.title}  (${ch.id})`);

const bs = ch.brandingSettings || {};
const before = bs.channel || {};
const after = {
  ...before,                       // ⛔ 병합 — 안 건드리는 필드를 지우지 않는다
  country: want.country,
  defaultLanguage: want.defaultLanguage,
  description: want.description,
  keywords: want.keywords,
};

const show = (k) => {
  const a = String(before[k] ?? '(비어있음)').replace(/\n/g, ' ⏎ ');
  const b = String(after[k] ?? '').replace(/\n/g, ' ⏎ ');
  const same = String(before[k] ?? '') === String(after[k] ?? '');
  console.log(`\n  ${k}`);
  console.log(`    전  ${a.slice(0, 150)}`);
  console.log(`    후  ${b.slice(0, 150)}${same ? '   (변화 없음)' : ''}`);
};
for (const k of ['country', 'defaultLanguage', 'keywords', 'description']) show(k);

if (!WRITE) {
  console.log('\n  ── 미리보기만 했다. 실제로 넣으려면 --write ──\n');
  process.exit(0);
}

const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
  method: 'PUT', headers: H,
  body: JSON.stringify({ id: ch.id, brandingSettings: { ...bs, channel: after } }),
});
const j = await r.json();
if (!r.ok) { console.error(`\n  ✗ ${r.status}`, JSON.stringify(j).slice(0, 400)); process.exit(1); }

// ── 되읽어서 «실제로 들어갔는지» 확인한다 ───────────────────────────────────
//   ⛔ 즉시 되읽으면 «옛 값»이 온다 (2026-08-21 실측 — 키워드가 옛 값으로 보였다가
//     4초 뒤 새 값이 왔다). 유튜브는 쓰기 반영에 지연이 있다. 재시도한다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ['country', 'defaultLanguage', 'keywords', 'description'];
const miss = (nb) => KEYS.filter((k) => String(nb[k] ?? '') !== String(after[k] ?? ''));

let nb = {}, bad = KEYS;
for (let t = 0; t < 5 && bad.length; t++) {
  if (t) await sleep(3000);
  const back = await (await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&mine=true',
    { headers: H })).json();
  nb = back.items?.[0]?.brandingSettings?.channel || {};
  bad = miss(nb);
  if (bad.length) console.log(`  … 반영 대기 ${t + 1}/5 (미반영: ${bad.join(', ')})`);
}

console.log('\n  ══ 반영 확인 (되읽음) ══');
for (const k of KEYS) {
  const ok = !bad.includes(k);
  console.log(`   ${ok ? '✔' : '✗'} ${k}${ok ? '' : `   실제=${JSON.stringify(String(nb[k] ?? '')).slice(0, 80)}`}`);
}
console.log(bad.length ? `\n  ⛔ ${bad.length}개가 반영되지 않았다.\n` : '\n  전부 반영됐다.\n');
process.exit(bad.length ? 1 : 0);
