/**
 * 13F CUSIP → 티커 매핑표 생성기 (OpenFIGI, 키 없이 무료)
 *
 * 왜: SEC Form 13F Data Sets 는 CUSIP 으로만 보유를 적는다. 앱은 «티커»로 부르므로 CUSIP 이 필요하다.
 *   (예전엔 라우트 안에 손으로 적은 68개뿐이라 그 밖의 종목은 보유 기관 색인을 못 찾아 낡은 폴백으로 떨어졌다.)
 *   OpenFIGI 는 CUSIP → 상장 티커를 공개 API 로 준다(키 없이 분당 25요청 · 요청당 10건). 역방향(티커 → CUSIP)은 라이선스상 주지 않는다.
 *
 * 사용 (분기에 한 번 — 새 데이터셋이 나온 뒤):
 *   DRY=1 EMIT_CUSIPS=/tmp/cusips.json node scripts/build-13f-cache.js      # 보유 기관 수 순 CUSIP 목록을 뽑는다
 *   node scripts/build-13f-ticker-map.js --in /tmp/cusips.json --out /tmp/map.json [--min-holders 60]
 *   node scripts/build-13f-ticker-map.js --finalize /tmp/map.json            # src/data/cusipByTicker.json 갱신
 *
 * 이어서 하기: --out 파일에 처리한 CUSIP 이 쌓인다. 중간에 끊겨도 같은 명령을 다시 돌리면 이어서 한다.
 * 한도: 429 면 ratelimit-reset 만큼 쉬고 다시. 계정·키가 필요 없다(새 구독 아님).
 */
const fs = require('fs');
const path = require('path');

const FIGI_URL = 'https://api.openfigi.com/v3/mapping';
const BATCH = 10;            // 키 없는 호출의 요청당 상한
const GAP_MS = 2600;         // 분당 24요청 — 상한(25) 아래

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

/** OpenFIGI 응답 한 건(= CUSIP 하나)에서 미국 상장 티커를 고른다. 순수 함수 — 시험 가능 */
function pickUsListing(data) {
  if (!Array.isArray(data) || !data.length) return null;
  const us = data.filter((r) => r && r.ticker && (r.exchCode === 'US' || r.exchCode === 'UN' || r.exchCode === 'UW' || r.exchCode === 'UA' || r.exchCode === 'UR' || r.exchCode === 'UP'));
  if (!us.length) return null;
  // 합성(US) 상장을 먼저, 없으면 첫 거래소 상장
  const row = us.find((r) => r.exchCode === 'US') || us[0];
  return {
    ticker: String(row.ticker).replace('/', '.').toUpperCase(),   // BRK/B → BRK.B (앱·Polygon 표기)
    name: row.name || null,
    securityType: row.securityType || null,
    marketSector: row.marketSector || null,
  };
}

/** 같은 티커를 가리키는 CUSIP 이 둘 이상이면(합병·분할로 CUSIP 교체) 보유 기관이 더 많은 쪽 */
function buildTickerMap(entries) {
  const best = new Map();
  for (const e of entries) {
    if (!e.ticker || !e.cusip) continue;
    const cur = best.get(e.ticker);
    if (!cur || (e.holders || 0) > (cur.holders || 0)) best.set(e.ticker, e);
  }
  const out = {};
  for (const [t, e] of [...best.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out[t] = e.cusip;
  return out;
}

async function lookup(batch) {
  const body = JSON.stringify(batch.map((c) => ({ idType: 'ID_CUSIP', idValue: c.cusip, exchCode: 'US' })));
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(FIGI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      const wait = Math.max(5, Number(res.headers.get('ratelimit-reset') || 30)) * 1000 + 500;
      console.log(`  429 — ${Math.round(wait / 1000)}초 쉰다`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      console.log(`  HTTP ${res.status} — 재시도 ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    return res.json();
  }
  return null;
}

async function run() {
  const inFile = arg('--in');
  const outFile = arg('--out');
  const minHolders = Number(arg('--min-holders', '60'));
  const list = JSON.parse(fs.readFileSync(inFile, 'utf8')).filter((x) => (x.holders || 0) >= minHolders);
  const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { entries: [], processed: {} };
  const todo = list.filter((x) => !done.processed[x.cusip]);
  console.log(`대상 ${list.length}건 중 남은 것 ${todo.length}건 (요청 약 ${Math.ceil(todo.length / BATCH)}회)`);
  let n = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const t0 = Date.now();
    const resp = await lookup(batch);
    if (!resp) { console.log('  응답 없음 — 이 묶음은 건너뛴다(다음 실행에서 다시)'); continue; }
    batch.forEach((c, k) => {
      const r = resp[k] || {};
      const pick = pickUsListing(r.data);
      done.processed[c.cusip] = 1;
      if (pick) done.entries.push({ cusip: c.cusip, holders: c.holders, issuer: c.issuer, ...pick });
    });
    n += batch.length;
    fs.writeFileSync(outFile, JSON.stringify(done));
    if ((i / BATCH) % 10 === 0) console.log(`  ${n}/${todo.length} · 매핑 ${done.entries.length}건`);
    const wait = GAP_MS - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  console.log(`완료: 처리 ${Object.keys(done.processed).length} · 미국 상장 매핑 ${done.entries.length}`);
}

function finalize(mapFile) {
  const done = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  const map = buildTickerMap(done.entries);
  const dest = path.join(__dirname, '..', 'src', 'data', 'cusipByTicker.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(map) + '\n');
  console.log(`${Object.keys(map).length}개 티커 → ${dest}`);
}

module.exports = { pickUsListing, buildTickerMap };

if (require.main === module) {
  const fin = arg('--finalize');
  (fin ? Promise.resolve(finalize(fin)) : run()).catch((e) => { console.error(e); process.exit(1); });
}
