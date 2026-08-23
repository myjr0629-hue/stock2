// ============================================================================
// x-daily-kit — 그날 X 댓글에 쓸 «이미지 + 사실 문장»을 한 번에 뽑는다.
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-23):
//   댓글 홍보의 병목은 «무엇을 쓸지 정하는 시간»이지 «쓰는 시간»이 아니다.
//   장중에 이걸 돌리면 그 순간 화면 + 그 순간 숫자가 같이 나오므로
//   대표는 «어느 트윗에 붙일지»만 고르면 된다.
//
//   컴플라이언스: 여기서 나오는 문장은 전부 «과거·현재 사실»이다.
//   예측형 표현(오를 것·반등 임박 등)은 만들지 않는다. 금융 앱이라
//   스토어 심사·유사투자자문으로 되돌아온다.
//
// 사용:  node scripts/x-daily-kit.js [en|ja|ko]
// 결과:  ~/Desktop/X 댓글용 이미지/  에 이미지 4장 + kit-<날짜>.txt
// ============================================================================
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const loc = process.argv[2] || 'en';
const OUT = path.join(os.homedir(), 'Desktop', 'X 댓글용 이미지');
const stamp = new Date().toISOString().slice(0, 10);

// 장중이면 «지금», 아니면 «직전 종가» 로 표현이 달라져야 한다.
// 미국 정규장 09:30~16:00 ET.
function session() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const min = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (min >= 570 && min < 960) return 'open';
  return 'closed';
}

const SHOTS = [
  ['signum', 'flow', 'SPY'],
  ['signum', 'flow', 'NVDA'],
  ['signum', 'intel', null],
  ['signum', 'dash', null],
];

const made = [];
for (const [app, scene, ticker] of SHOTS) {
  try {
    const out = execFileSync('node', [
      path.join(__dirname, 'make-x-shot.js'), app, loc, scene, ...(ticker ? [ticker] : []),
    ], { encoding: 'utf8' }).trim().split('\n').pop();
    made.push(out);
    console.log('  ✓', path.basename(out));
  } catch (e) {
    console.log('  ✗', app, scene, ticker || '', String(e.message).slice(0, 80));
  }
}

const s = session();
const when = s === 'open' ? 'right now, mid-session' : "at the last close";
const kit = `X 댓글 키트 — ${stamp} (${loc})  세션: ${s === 'open' ? '장중' : '장마감'}

이미지 ${made.length}장:
${made.map((m) => '  ' + path.basename(m)).join('\n')}

붙일 때 규칙
  1. 본문에 URL 을 넣지 않는다. 링크는 이미지 워터마크에 이미 있다.
     (반복 URL = X 어뷰징 봇의 섀도우밴 사유)
  2. 같은 이미지·같은 수치를 연속으로 쓰지 않는다. 화면을 바꾼다.
  3. 예측형 표현 금지. 숫자와 «${when}» 같은 시점 표현만 쓴다.
  4. 하루 3~5건. 미국장 시간에 집중.
  5. 상대 트윗 주제와 티커가 맞는 이미지를 고른다. 아무거나 붙이지 않는다.

문장 틀 (숫자는 이미지에서 그대로 읽어 넣는다)
  EN  "Where $TICKER positioning sat ${when}: max pain X vs spot Y, gamma flip Z."
  JA  "失礼いたします。${s === 'open' ? '現時点' : '直近の引け'}の$TICKERのオプション構造です。ご参考まで。"
  KO  "참고로 $TICKER ${s === 'open' ? '현재' : '직전 종가'} 기준 옵션 구조입니다."
`;
const kitPath = path.join(OUT, `kit-${stamp}-${loc}.txt`);
fs.writeFileSync(kitPath, kit);
console.log('\n' + kitPath);
