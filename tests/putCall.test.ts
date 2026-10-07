/**
 * 풋/콜 비율 — 정의 한 곳(src/lib/putCall.ts) · 생산자·소비자 정리 (2026-10-07, 앱 강화 1단계)
 *
 * 출발점(코드 확정 + 운영 실측): 같은 이름 `volumePcr` 가 생산자마다 다른 뜻이었다.
 *   · live/ticker flow.volumePcr = callVol/putVol (콜÷풋, 거래량)  ← 이름은 P/C
 *   · Lambda 분석캐시 volumePcr = Σ풋OI/Σ콜OI (풋÷콜, 미결제약정) · watchlist 배치 volumePcr = 풋÷콜(거래량, 0 이면 OI 로 조용히 대체)
 *   · 앱 Intel 의 PCR(/api/intel/fast): pick(analysis.pcr[OI 풋÷콜], oiPcr[OI 풋÷콜], volumePcr[거래량 콜÷풋])  ← 기준·방향이 다른 값이 같은 칸에
 * 수리: 정의를 src/lib/putCall.ts 한 곳에 두고(풋÷콜, 기준은 필드 이름: oiPcr / volumePutCallRatio), live/ticker 는 새 필드를 «추가»(옛 volumePcr 는 웹 호환으로 그대로),
 *   앱 Intel PCR 은 OI 기준 풋÷콜만(없으면 «—»), 앱 쪽 소비자는 옛 필드를 읽지 않는다.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/putCall.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { putOverCall, callOverPut, legacyVolumePcrToPutCall, volumePutCallFromChain, readFlowPutCall, pcLean, PC_DEFINITION } from '../src/lib/putCall';
import { putCallRatio, callPutRatio, pcBias, PC_AI_DEFINITION } from '../src/lib/app/flowPcRatio';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** 주석을 뺀 코드 — «읽는 코드»가 있는지만 본다(주석이 옛 이름을 설명하는 것은 허용) */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const row = (type: 'call' | 'put', volume: number) => ({ details: { contract_type: type }, day: { volume } });

t('정의: P/C = 풋÷콜, C/P = 콜÷풋 — 운영 실측(10/7 마감 NVDA 콜 441,151·풋 272,177) 0.62 / 1.62', () => {
  assert.equal(putOverCall(272_177, 441_151), 0.62);
  assert.equal(callOverPut(441_151, 272_177), 1.62);
  assert.equal(putOverCall(46_961, 89_811), 0.52);   // AAPL
  assert.equal(callOverPut(89_811, 46_961), 1.91);
  assert.equal(putOverCall(28_685, 24_562), 1.17);   // AMD — 풋 우위인 날은 P/C 가 1 을 넘는다
});

t('경계: 콜 0 이면 P/C 정의 안 됨(null) · 풋 0 이면 C/P 정의 안 됨 · 없음·NaN·음수는 null', () => {
  assert.equal(putOverCall(100, 0), null);
  assert.equal(putOverCall(0, 100), 0);
  assert.equal(putOverCall(null, 100), null);
  assert.equal(putOverCall(100, undefined), null);
  assert.equal(putOverCall(NaN, 10), null);
  assert.equal(putOverCall(-1, 10), null);
  assert.equal(callOverPut(100, 0), null);
  assert.equal(callOverPut(0, 100), 0);
  assert.equal(callOverPut(null, 100), null);
});

t('앱 Flow 의 비율 함수는 같은 정의를 쓴다(복제본 없음) · 판정 문턱도 한 곳(pcLean)', () => {
  assert.equal(putCallRatio(272_177, 441_151), putOverCall(272_177, 441_151));
  assert.equal(callPutRatio(441_151, 272_177), callOverPut(441_151, 272_177));
  assert.equal(PC_AI_DEFINITION, PC_DEFINITION);
  assert.equal(PC_DEFINITION, 'put_over_call');
  for (const v of [0.3, 0.5, 0.62, 0.75, 0.9, 1.0, 1.3, 1.5, 2.0, 3]) assert.equal(pcBias(v), pcLean(v));
  assert.equal(pcLean(2.0), 'strongPut');
  assert.equal(pcLean(1.3), 'put');
  assert.equal(pcLean(0.9), 'balanced');
  assert.equal(pcLean(0.75), 'call');
  assert.equal(pcLean(0.5), 'strongCall');
  assert.equal(pcLean(null), null);
  const src = read('src/lib/app/flowPcRatio.ts');
  assert.ok(!/Math\.round\(v \* 100\)/.test(src), 'flowPcRatio 에 옛 복제 정의(round2)가 남아 있지 않다');
  assert.ok(src.includes("from '../putCall'"));
});

t('legacyVolumePcrToPutCall: live/ticker 의 옛 volumePcr(콜÷풋)만 뒤집는다 — 운영 실측 NVDA 1.62 → 0.62, 0·없음·음수는 null', () => {
  assert.equal(legacyVolumePcrToPutCall(1.62), 0.62);
  assert.equal(legacyVolumePcrToPutCall(1.91), 0.52);
  assert.equal(legacyVolumePcrToPutCall(0.86), 1.16);
  assert.equal(legacyVolumePcrToPutCall(0), null);
  assert.equal(legacyVolumePcrToPutCall(-2), null);
  assert.equal(legacyVolumePcrToPutCall(null), null);
  assert.equal(legacyVolumePcrToPutCall(undefined), null);
});

t('volumePutCallFromChain: 체인 행에서 콜·풋 거래량 합 → 풋÷콜. 옛 volumePcr 은 같은 입력의 역수', () => {
  const chain = [row('call', 300_000), row('call', 141_151), row('put', 200_000), row('put', 72_177)];
  const r = volumePutCallFromChain(chain);
  assert.equal(r.callVol, 441_151);
  assert.equal(r.putVol, 272_177);
  assert.equal(r.putCall, 0.62);
  // 옛 계산(live/ticker 의 _vpcr)과 같은 입력에서 역수 관계
  const legacy = Math.round((r.callVol / r.putVol) * 100) / 100;
  assert.equal(legacy, 1.62);
  assert.ok(Math.abs(r.putCall! * legacy - 1) < 0.01);
  // 이상한 입력
  assert.deepEqual(volumePutCallFromChain(undefined), { callVol: 0, putVol: 0, putCall: null });
  assert.deepEqual(volumePutCallFromChain([]), { callVol: 0, putVol: 0, putCall: null });
  assert.equal(volumePutCallFromChain([row('put', 500)]).putCall, null, '콜 거래량이 0 이면 정의되지 않는다(0 으로 지어내지 않는다)');
  assert.equal(volumePutCallFromChain([row('call', 500)]).putCall, 0, '풋 거래량 0 · 콜만 있으면 P/C = 0');
  assert.equal(volumePutCallFromChain([{ details: { contract_type: 'call' } }, { day: { volume: 5 } }, null, row('call', 10), row('put', 5)]).putCall, 0.5, '필드가 빠진 행은 건너뛴다');
});

t('readFlowPutCall: 기준을 섞지 않는다 — oi 는 oiPcr 만, volume 은 새 필드 우선 · 새 필드가 없는 옛 캐시 응답은 옛 volumePcr(콜÷풋)을 뒤집어 쓴다', () => {
  assert.deepEqual(readFlowPutCall({ oiPcr: 0.81, volumePutCallRatio: 0.62, volumePcr: 1.62 }), { oi: 0.81, volume: 0.62 });
  assert.deepEqual(readFlowPutCall({ oiPcr: 0.81, volumePcr: 1.62 }), { oi: 0.81, volume: 0.62 }, '옛 캐시(새 필드 없음)');
  assert.deepEqual(readFlowPutCall({ volumePutCallRatio: 0 }), { oi: null, volume: 0 }, '풋 거래량 0 → P/C 0 은 값이다');
  assert.deepEqual(readFlowPutCall({ oiPcr: null, volumePcr: null }), { oi: null, volume: null });
  assert.deepEqual(readFlowPutCall(null), { oi: null, volume: null });
  assert.deepEqual(readFlowPutCall({ oiPcr: 0 }), { oi: null, volume: null }, 'OI P/C 0 은 «측정 못 함»으로 본다(structureService 는 콜 OI 가 있을 때만 값을 낸다)');
  // OI 가 없다고 거래량 값을 OI 칸에 대신 채우지 않는다
  assert.equal(readFlowPutCall({ volumePutCallRatio: 0.62 }).oi, null);
});

t('소스: live/ticker — 새 필드 volumePutCallRatio 추가, 옛 volumePcr 은 웹 호환으로 그대로(값·방향 불변), 계산은 공용 함수', () => {
  const src = read('src/app/api/live/ticker/route.ts');
  assert.ok(src.includes("import { volumePutCallFromChain } from '@/lib/putCall'"));
  assert.ok(src.includes('volumePutCallRatio: _chainVol.putCall'), '응답에 풋÷콜(거래량) 새 필드');
  assert.ok(/volumePcr: _vpcr,/.test(src), '옛 필드는 그대로');
  assert.ok(src.includes('const _vpcr = (_cvol > 0 || _pvol > 0) ? (_pvol > 0 ? Math.round((_cvol / _pvol) * 100) / 100 : (_cvol > 0 ? 10 : 0)) : null;'), '옛 값 계산(콜÷풋) 한 글자도 안 바뀜 — 웹·UC·WIM 이 이 방향을 전제로 뒤집어 쓴다');
  assert.ok(/oiPcr: \(structureResult as any\)\?\.pcr \?\? null/.test(src), 'OI 기준 P/C 는 그대로');
  assert.ok(!/const _rc = \(flowData as any\)\?\.rawChain \|\| \[\];/.test(src), '체인 합산 루프 복제가 남아 있지 않다');
});

t('소스: /api/intel/fast — 앱 Intel PCR 은 OI 기준 풋÷콜만(analysis.pcr · oiPcr · DynamoDB gex.pcr). 거래량 C/P 폴백 제거', () => {
  const src = read('src/app/api/intel/fast/route.ts');
  assert.ok(/pcr = pick\(analysis\?\.pcr, cached\?\.flow\?\.oiPcr\);/.test(src));
  assert.ok(!/pick\([^)]*volumePcr/.test(src), 'pick 체인에 volumePcr 가 없다');
  assert.ok(/if \(pcr == null && gxf\.pcr != null\) pcr = gxf\.pcr;/.test(src), 'AWS 이력(OI 풋÷콜) 폴백은 그대로');
});

t('소비자 센서스: 앱 표면(app-view·components/app·hooks·lib/app)과 앱이 부르는 intel API 는 옛 volumePcr 을 읽지 않는다 — 새 소비자가 몰래 늘면 여기서 걸린다', () => {
  const walk = (d: string, out: string[] = []): string[] => {
    for (const f of fs.readdirSync(path.join(ROOT, d))) {
      const rel = path.join(d, f);
      const st = fs.statSync(path.join(ROOT, rel));
      if (st.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(f)) out.push(rel);
    }
    return out;
  };
  const appFiles = [
    ...walk('src/app/[locale]/app-view'), ...walk('src/components/app'), ...walk('src/lib/app'),
    'src/hooks/useIntelSharedData.ts', 'src/app/api/intel/fast/route.ts', 'src/app/api/intel/snapshot/route.ts', 'src/app/api/command/unified/route.ts',
  ];
  const offenders = appFiles.filter((f) => /\bvolumePcr\b/.test(code(f)));
  assert.deepEqual(offenders, [], `앱 표면이 옛 volumePcr 를 읽는다: ${offenders.join(', ')}`);
  // 옛 필드를 읽는 파일 전체 목록(전부 «이름이 거짓말»임을 아는 곳: 뒤집어 쓰거나 웹 전용) — 늘리려면 정의를 먼저 확인하고 여기에 이유와 함께 적는다
  const known = new Set([
    'src/app/api/live/ticker/route.ts',          // 생산자(콜÷풋, 웹 호환)
    'src/app/api/dashboard/unified/route.ts',    // 웹 대시보드 전용 — 분석캐시(OI 풋÷콜)·라이브(콜÷풋) 두 갈래가 같은 이름(웹 별도 작업으로 보고)
    'src/services/watchlistBatchService.ts',     // 생산자(풋÷콜, 거래량 → 0 이면 OI) — 앱 소비자 없음
    'src/services/portfolioBatchService.ts',     // null 자리표시
    'src/services/analysisCache.ts',             // 타입
    'src/stores/dashboardStore.ts',              // 웹 대시보드 스토어
    'src/app/api/undercurrent/shared.ts',        // UC — volumePutCall() 로 뒤집어 쓴다(9/30)
    'src/app/api/undercurrent/feedCore.ts',      // null 검사
    'src/app/api/undercurrent/ticker/route.ts',  // UC — 뒤집어 쓴다
    'src/app/api/wim/today/route.ts',            // WIM — 뒤집어 쓴다
    'src/lib/ai/ucNumbers.ts',                   // UC 숫자 대조(거래량 콜÷풋 후보)
    'src/app/[locale]/undercurrent/page.tsx',    // 웹 UC — 1/x
    'src/app/[locale]/wim/page.tsx',             // 웹 WIM — 1/x
    'src/app/[locale]/flow/[ticker]/page.tsx',   // 웹 — 주석뿐(값 null)
    'src/app/[locale]/dashboard/DashboardClient.tsx',   // 웹 대시보드(별도 작업으로 보고)
    'src/components/mobile/MobileMetricsTab.tsx',        // 웹 모바일 지표 탭(별도 작업으로 보고)
    'src/lib/putCall.ts',                        // 정의 문서
  ]);
  const all = walk('src').filter((f) => /\bvolumePcr\b/.test(code(f)));
  const unknown = all.filter((f) => !known.has(f));
  assert.deepEqual(unknown, [], `새로 옛 volumePcr 를 읽는 파일: ${unknown.join(', ')} — lib/putCall.ts 의 표를 보고 oiPcr / volumePutCallRatio 를 쓴다`);
});

t('정의 문서: lib/putCall.ts 에 필드 이름 규약 표(oiPcr·volumePutCallRatio·옛 volumePcr 4갈래)가 있다', () => {
  const src = read('src/lib/putCall.ts');
  for (const k of ['oiPcr', 'volumePutCallRatio', 'volumePcr  (live/ticker)', 'volumePcr  (Lambda 분석캐시)', 'volumePcr  (watchlist 배치)', 'volumePcr  (dashboard/unified)']) assert.ok(src.includes(k), k);
});

console.log(`\n${n}개 통과`);
