#!/usr/bin/env node
/**
 * 로컬 초안만 작성. .env 로딩·인증·게시·벤더 호출 없음.
 * node scripts/earnings-scorecard-post.mjs --week 2026-10-12 [--base http://127.0.0.1:3000] [--out out/earnings-scorecard/2026-10-12]
 * 저장된 동일 API 응답으로 오프라인 실행: --week 2026-10-12 --input /tmp/scorecard.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const validMonday = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s && new Date(`${s}T00:00:00Z`).getUTCDay() === 1;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const pct = (n) => (Math.round(Math.abs(n) * 10 + 1e-9) / 10).toFixed(1);
const signed = (n) => `${Math.abs(n) < 0.05 ? '' : n < 0 ? '−' : '+'}${pct(n)}%`;
const median = (ns) => {
  if (!ns.length) return null;
  const xs = ns.slice().sort((a, b) => a - b), i = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[i] : (xs[i - 1] + xs[i]) / 2;
};

/** 실패·빈 응답·요약 불일치를 수치 있는 초안으로 바꾸지 않는다. */
export function validateScorecard(data, week) {
  const fail = () => { throw new Error('Invalid or inconsistent scorecard response'); };
  if (!validMonday(week) || data?.v !== 1 || data.week !== week || data.timezone !== 'America/New_York'
    || typeof data.asOf !== 'string' || !Number.isFinite(Date.parse(data.asOf)) || !Array.isArray(data.rows)
    || typeof data.source?.records !== 'string' || typeof data.source?.expected !== 'string'
    || typeof data.source?.actual !== 'string') fail();
  const end = new Date(`${week}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  if (data.weekEnd !== end.toISOString().slice(0, 10)) fail();
  const keys = new Set();
  for (const r of data.rows) {
    const key = `${r?.ticker}|${r?.date}`;
    if (!r || typeof r.ticker !== 'string' || !/^[A-Z0-9.^-]+$/.test(r.ticker)
      || typeof r.date !== 'string' || r.date < week || r.date > data.weekEnd
      || !['amc', 'bmo'].includes(r.hour) || !finite(r.expectedPct) || r.expectedPct <= 0 || !finite(r.actualPct)
      || r.beyond !== (Math.abs(r.actualPct) > r.expectedPct) || !['fmp', 'intrinio_only'].includes(r.check)
      || keys.has(key)) fail();
    keys.add(key);
  }
  const s = data.summary;
  if (!s || s.n !== data.rows.length || s.beyondCount !== data.rows.filter((r) => r.beyond).length
    || s.withinCount !== s.n - s.beyondCount
    || s.medianAbsActual !== median(data.rows.map((r) => Math.abs(r.actualPct)))
    || s.medianExpected !== median(data.rows.map((r) => r.expectedPct))) fail();
  const surprise = data.rows.filter((r) => r.beyond)
    .sort((a, b) => (Math.abs(b.actualPct) - b.expectedPct) - (Math.abs(a.actualPct) - a.expectedPct))[0];
  if (!surprise) {
    if (s.biggestSurprise !== null) fail();
  } else {
    const b = s.biggestSurprise;
    if (!b || !finite(b.excessPctPoints) || !data.rows.some((r) => r.ticker === b.ticker && r.date === b.date && r.actualPct === b.actualPct
      && r.expectedPct === b.expectedPct && r.check === b.check && r.beyond)
      || Math.abs(b.excessPctPoints - (Math.abs(surprise.actualPct) - surprise.expectedPct)) > 0.000051
      || Math.abs(b.excessPctPoints - (Math.abs(b.actualPct) - b.expectedPct)) > 0.000051) fail();
  }
  return data;
}

export function renderDrafts(data) {
  validateScorecard(data, data.week);
  const { summary: s } = data;
  const b = s.biggestSurprise;
  const period = `${data.week}–${data.weekEnd} ET`;
  const fmp = data.rows.filter((r) => r.check === 'fmp').length;
  const single = s.n - fmp;
  const detail = b ? `${b.ticker} (${b.date}), ${signed(b.actualPct)} vs ±${pct(b.expectedPct)}% (${pct(b.excessPctPoints)} pp)` : null;
  const caveat = 'Implied move reflects market pricing, not a forecast.';
  const empty = {
    en: `Week ${period}: no complete stored pairs are available; no move statistics calculated.`,
    ja: `${period}：保存済みの比較可能なデータがないため、変動の統計は算出していません。`,
    ko: `${period}: 비교 가능한 저장 기록이 없어 변동 통계를 계산하지 않았습니다.`,
  };
  const head = s.n ? {
    en: `Week ${period}: ${s.withinCount} of ${s.n} recorded earnings moves stayed inside the options-implied range (including equality). ${detail ? `Biggest surprise by excess magnitude: ${detail}.` : 'No recorded move exceeded its implied range.'}`,
    ja: `${period}：記録のある決算発表${s.n}件中${s.withinCount}件の実際の変動が、オプション織り込み変動幅の範囲内（境界を含む）でした。${detail ? `超過幅が最大：${detail}。` : '織り込み変動幅を超えた記録はありません。'}`,
    ko: `${period}: 기록된 실적 발표 ${s.n}건 중 ${s.withinCount}건의 실제 변동이 옵션 내재 변동폭 안에 머물렀습니다(경계 포함). ${detail ? `최대 초과폭: ${detail}.` : '내재 변동폭을 초과한 기록은 없습니다.'}`,
  } : empty;
  const sources = {
    en: `As of ${data.asOf}. Sources: pre-announcement ATM straddle / spot snapshots; Intrinio regular-session closes; ${fmp} FMP cross-checked, ${single} Intrinio only. Missing pairs omitted. Implied range runs through option expiry; actual reaction covers one session. Coverage is limited to stored confirmed announcements.`,
    ja: `基準時刻 ${data.asOf}。出典：発表前のATMストラドル÷現物の保存値、Intrinio通常取引終値。FMP照合済み${fmp}件、Intrinioのみ${single}件。欠測は集計対象外。織り込み幅はオプション満期まで、実際の反応は1取引日の変動で、期間が異なります。対象は保存された確定発表のみです。`,
    ko: `기준 시각 ${data.asOf}. 출처: 발표 전 ATM 스트래들÷현물 저장값, Intrinio 정규장 종가. FMP 대조 ${fmp}건, Intrinio 단독 ${single}건. 결측 제외. 내재폭은 옵션 만기까지, 실제 반응은 한 거래일로 측정 기간이 다릅니다. 저장된 확정 발표만 대상으로 합니다.`,
  };
  const translation = {
    en: caveat,
    ja: `織り込み変動幅は市場の価格設定を反映したもので、予測ではありません。 ${caveat}`,
    ko: `내재 변동폭은 시장 가격을 반영하며 예측이 아닙니다. ${caveat}`,
  };
  return Object.fromEntries(['en', 'ja', 'ko'].map((loc) => [loc, `${head[loc]}\n\n${sources[loc]}\n\n${translation[loc]}\n`]));
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--week', '--base', '--input', '--out'].includes(args[i]) || !args[i + 1]
      || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) throw new Error('Invalid arguments');
    options[args[i]] = args[i + 1];
  }
  const week = options['--week'];
  if (!validMonday(week)) throw new Error('--week must be a valid ET Monday (YYYY-MM-DD)');
  let data;
  if (options['--input']) {
    data = JSON.parse(await readFile(options['--input'], 'utf8'));
  } else {
    const base = new URL(options['--base'] || 'http://127.0.0.1:3000');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error('Use an HTTP(S) base URL without credentials, query, or fragment');
    }
    const url = new URL('/api/earnings/scorecard', base);
    url.searchParams.set('week', week);
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Scorecard HTTP ${response.status}`);
    data = await response.json();
  }
  validateScorecard(data, week);
  const drafts = renderDrafts(data);
  const dir = resolve(options['--out'] || join('out', 'earnings-scorecard', week));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'scorecard.json'), `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  for (const [loc, draft] of Object.entries(drafts)) {
    await writeFile(join(dir, `${loc}.txt`), draft, { flag: 'wx' });
  }
  console.log('Saved scorecard.json and en/ja/ko.txt drafts (no publishing).');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Draft generation failed; check arguments, API response, and output directory.'); process.exitCode = 1; });
}
