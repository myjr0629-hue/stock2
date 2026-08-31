#!/usr/bin/env node
// ============================================================================
// make-deviation-ranking — 「평소 대비 이탈」 랭킹.
//
// 왜 이 랭킹인가 (2026-09-01):
//   절대 순위(옵션 프리미엄 TOP)는 시가총액을 따라간다. NVDA·TSLA·AAPL 이
//   거의 매일 상위라서 시청자가 결과를 미리 안다. 답을 아는 랭킹은 끝까지
//   볼 이유가 없다. 정보는 «그 종목 자신의 평소 대비 이탈»에만 있다 —
//   다크풀에서 배운 것과 같다(시장 중앙값 49~51%, 의미는 이탈에만 있었다).
//
// 방법:
//   · 기준선 = 최근 N일의 «중앙값»(평균 아님). 하루의 이상치가 기준선을
//     끌고 가면 그날 이후로 모든 이탈이 작아 보인다.
//
//   ⚠️ [2026-09-01 실측으로 발견] 만기 롤오버 아티팩트를 반드시 걸러야 한다.
//      harvest 는 «맨 앞 만기»(expirations[0]) 하나만 본다. 그래서 앞 만기가
//      바뀌는 날 미결제약정이 통째로 갈아엎어진다 —
//        MSFT 콜 OI: 70k → 404k → (롤) 55k → 494k
//      이걸 그냥 재면 「평소의 6배」라는 22σ 가 나오는데, 시장이 아니라
//      «다른 만기를 본 것»이다. 그래서 기준선은 «오늘과 같은 규모의 날»
//      에서만 뽑는다(총 OI 가 오늘의 0.5~2배인 날). 규모가 맞는 날이
//      모자라면 그 종목은 순위에 넣지 않는다 — 추정하지 않는다.
//   · 산포 = MAD(중앙값 절대편차). 표준편차는 이상치에 끌려간다.
//   · 순위 = «평소의 몇 배»(비율). σ 는 게이트로만 쓴다.
//     ⚠️ z 만으로 줄 세우면 안 된다. 비교일들이 서로 너무 비슷하면 MAD 가
//        0 에 가까워지고 분모가 붕괴해 42σ 같은 «불가능한» 값이 나온다
//        (실제로 나왔다). 그리고 영상에서 「4.2배」는 전달되지만 「42σ」는
//        아무 말도 안 한다.
//   · 이력이 모자란 종목은 «순위에 넣지 않는다». 채우지 않는다.
//
// 실행: node scripts/make-deviation-ranking.js [일수] [상위N]
// ============================================================================
const fs = require('fs');
const path = require('path');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const DAYS = Number(process.argv[2]) || 30;
const TOP = Number(process.argv[3]) || 5;
const MIN_SESSIONS = 8;          // 이보다 이력이 적으면 기준선을 못 믿는다

const UNIVERSE = [
  'NVDA','TSLA','AAPL','MSFT','AMZN','META','GOOGL','AVGO','AMD','MU',
  'NFLX','PLTR','COIN','SMCI','INTC','JPM','UNH','XOM','LLY','COST',
  'BA','CAT','QQQ','SPY','IWM',
];

// 이탈을 «말이 되게» 설명할 수 있는 축만 쓴다. ivSkew 는 실측 결과 전부 0 이라 뺀다.
const METRICS = [
  { key: 'pcr',         label: { ko: '풋콜 비율', en: 'Put/call ratio', ja: 'プットコール比率' }, fmt: v => v.toFixed(2) },
  { key: 'totalCallOI', label: { ko: '콜 미결제약정', en: 'Call open interest', ja: 'コール建玉' }, fmt: v => Math.round(v).toLocaleString() },
  { key: 'totalPutOI',  label: { ko: '풋 미결제약정', en: 'Put open interest', ja: 'プット建玉' }, fmt: v => Math.round(v).toLocaleString() },
  { key: 'whaleScore',  label: { ko: '대형거래 지표', en: 'Large-trade score', ja: '大口取引スコア' }, fmt: v => v.toFixed(0) },
  { key: 'dex',         label: { ko: '델타 노출', en: 'Delta exposure', ja: 'デルタ・エクスポージャー' }, fmt: v => (v / 1e6).toFixed(1) + 'M' },
  { key: 'squeezeProbability', label: { ko: '스퀴즈 확률', en: 'Squeeze probability', ja: 'スクイーズ確率' }, fmt: v => v.toFixed(0) },
];

const REGIME_LO = 0.5, REGIME_HI = 2.0;   // 오늘 총 OI 대비 «같은 규모»로 볼 범위
const MIN_REGIME_DAYS = 6;                // 규모가 맞는 비교일이 이만큼은 있어야 한다
const MIN_REL_DISPERSION = 0.03;          // 산포가 이보다 작으면 «너무 안 변하는» 지표 — 판정 불가
const MIN_Z = 3;                          // 통계적 게이트
const MIN_RATIO = 1.35;                   // 「평소의 1.35배」 미만은 이야깃거리가 아니다

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mad = (a, med) => median(a.map(v => Math.abs(v - med)));

const etDay = (ms) => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10); // ET 기준 날짜

async function history(ticker) {
  const since = Date.now() - DAYS * 86400e3;
  const out = [];
  let last;
  for (let page = 0; page < 6; page++) {
    const q = await ddb.send(new QueryCommand({
      TableName: 'signum-flow-history',
      KeyConditionExpression: 'ticker = :t AND #ts > :s',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':t': { S: ticker }, ':s': { N: String(since) } },
      ScanIndexForward: false, Limit: 400,
      ...(last ? { ExclusiveStartKey: last } : {}),
    }));
    out.push(...q.Items);
    last = q.LastEvaluatedKey;
    if (!last) break;
  }
  return out;
}

// 하루에 여러 스냅샷이 있다 — «그날의 마지막 값»을 그날 값으로 삼는다.
function daily(items, key) {
  const byDay = new Map();
  for (const it of items) {
    const raw = it[key]; if (raw === undefined) continue;
    const v = Number(raw.N ?? raw.S); if (!Number.isFinite(v)) continue;
    const ts = Number(it.timestamp.N);
    const d = etDay(ts);
    // 총 OI 를 같이 들고 간다 — «어느 만기를 보고 있었나»의 대리 지표다.
    const oi = Number(it.totalCallOI?.N || 0) + Number(it.totalPutOI?.N || 0);
    const prev = byDay.get(d);
    if (!prev || ts > prev.ts) byDay.set(d, { ts, v, oi });
  }
  return [...byDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, x]) => ({ d, v: x.v, oi: x.oi }));
}

(async () => {
  const found = [];
  for (const t of UNIVERSE) {
    let items;
    try { items = await history(t); } catch (e) { continue; }
    if (!items.length) continue;
    for (const m of METRICS) {
      const series = daily(items, m.key);
      if (series.length < MIN_SESSIONS + 1) continue;
      const today = series[series.length - 1];
      // ── 만기 롤오버 방어 ──────────────────────────────────────────────
      // 오늘과 «같은 규모의 체인»을 본 날만 비교 대상으로 삼는다.
      const cmp = series.slice(0, -1).filter(x =>
        today.oi > 0 && x.oi > 0 && x.oi >= today.oi * REGIME_LO && x.oi <= today.oi * REGIME_HI);
      if (cmp.length < MIN_REGIME_DAYS) continue;
      const past = cmp.map(x => x.v);
      const med = median(past);
      const sp = mad(past, med);
      if (med === null || !Number.isFinite(med)) continue;
      // MAD 가 0 이면(값이 거의 안 변함) 이탈을 잴 척도가 없다 — 건너뛴다.
      const scale = 1.4826 * sp;
      if (!(scale > 0)) continue;
      // 산포가 중앙값 대비 지나치게 작으면 분모 붕괴로 z 가 폭발한다.
      if (Math.abs(med) > 0 && sp / Math.abs(med) < MIN_REL_DISPERSION) continue;
      const z = (today.v - med) / scale;
      if (!Number.isFinite(z) || Math.abs(z) < MIN_Z) continue;
      // 점수(0~100)류에서 오늘이 «정확히 0» 이면 측정된 0 인지 미계산인지
      // 구분할 수 없다 — 순위에 올리지 않는다.
      if (today.v === 0 && /Score|Probability/i.test(m.key)) continue;
      if (!(med > 0)) continue;
      const ratio = today.v / med;
      if (!(ratio >= MIN_RATIO || ratio <= 1 / MIN_RATIO)) continue;
      found.push({
        ticker: t, metric: m.key, label: m.label, fmt: m.fmt,
        today: today.v, baseline: med, z, absZ: Math.abs(z), ratio,
        // 순위 기준 — 배수의 «거리»(2배와 0.5배를 같게 취급)
        rank: Math.abs(Math.log(ratio)),
        sessions: cmp.length, date: today.d, totalOI: today.oi,
      });
    }
  }
  found.sort((a, b) => b.rank - a.rank);
  // 한 종목이 여러 지표로 상위를 독식하면 랭킹이 아니라 한 종목 소개가 된다.
  const seen = new Set(), top = [];
  for (const f of found) { if (seen.has(f.ticker)) continue; seen.add(f.ticker); top.push(f); if (top.length >= TOP) break; }

  console.log(`기준선 ${DAYS}일 중앙값 · 최소 ${MIN_SESSIONS}세션 · 후보 ${found.length}건 · 종목 ${seen.size}\n`);
  for (const [i, f] of top.entries()) {
    const mult = f.ratio >= 1 ? `평소의 ${f.ratio.toFixed(1)}배` : `평소의 ${(f.ratio * 100).toFixed(0)}%`;
    console.log(`${i + 1}위 ${f.ticker.padEnd(6)} ${f.label.ko.padEnd(14)} 오늘 ${f.fmt(f.today).padStart(12)}  평소 ${f.fmt(f.baseline).padStart(12)}  ${mult.padEnd(12)} (${Math.abs(f.z).toFixed(1)}σ · 비교 ${f.sessions}일)`);
  }
  fs.writeFileSync('/tmp/deviation-ranking.json', JSON.stringify(top.map(f => ({ ...f, fmt: undefined })), null, 1));
  console.log('\n→ /tmp/deviation-ranking.json');
})().catch(e => { console.error('실패:', e.name, e.message); process.exit(1); });
