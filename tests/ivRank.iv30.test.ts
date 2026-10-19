/** D02: IV30 일별 252거래일 백분위. 200개 장중 행 정책은 10/19 대표 결정으로 폐기. */
import assert from 'node:assert/strict';
import { ivRankFromHistory, ivWindowSessions, IV_RANK_WINDOW, IV30_DEF, ivRankIsCollecting, isIvHarvestRow, ivLevelForRank } from '../src/lib/ivRank';
const NOW = Date.parse('2026-10-19T10:00:00Z');
const days = ivWindowSessions('2026-10-16');
const rows = days.map((d, i) => ({ timestamp: Date.parse(`${d}T20:00:00Z`), iv30Date: d, iv30: 20 + i / 10, iv30Def: IV30_DEF, atmIv: 7.55 }));
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('PASS', name); };
t('창은 행 200개가 아니라 252거래일', () => assert.equal(IV_RANK_WINDOW, 252));
t('IV30 13일만 쌓였으면 결측, 현재 수준·날짜·표본 수는 보존', () => {
 const r = ivRankFromHistory(rows.slice(0,13), { nowMs: NOW });
 assert(!r.ok); if (r.ok) return; assert.equal(r.reason,'collecting'); assert.equal(r.collectingRows,13);
 assert.equal(r.currentIv,20); assert.equal(r.currentSession,'2026-10-16');
});
t('252일이 차면 IV30로 계산, 가장 가까운 만기 ATM IV 무시', () => {
 const r = ivRankFromHistory(rows, { nowMs: NOW }); assert(r.ok); if (!r.ok) return;
 assert.equal(r.percentile,0); assert.equal(r.currentIv,20); assert.equal(r.sampleSize,252);
 assert.equal(r.periodStart,days[251]); assert.equal(r.periodEnd,days[0]);
});
t('ATM IV만 있는 종목과 빈 이력은 미제공', () => {
 assert.equal(ivRankFromHistory(rows.map(({ iv30, iv30Def, ...h })=>h), { nowMs: NOW }).ok,false);
 assert.equal(ivRankFromHistory([], { nowMs: NOW }).ok,false);
});
t('같은 세션의 200개 다른 IV는 표본 하나', () => {
 const h = Array.from({length:200},(_,i)=>({...rows[0],timestamp:rows[0].timestamp-i*60000,iv30:30+i/100}));
 const r=ivRankFromHistory(h,{nowMs:NOW}); assert.equal(r.ok,false); assert.equal(r.sampleSize,1);
});
t('서로 다른 252일의 같은 IV는 252개, 정당한 백분위 0', () => {
 const r=ivRankFromHistory(rows.map(h=>({...h,iv30:30})),{nowMs:NOW}); assert(r.ok && r.percentile===0 && r.sampleSize===252);
});
t('중간 하루가 빠지면 오래된 날로 채우지 않는다', () => {
 const h=rows.filter((_,i)=>i!==100); const r=ivRankFromHistory(h,{nowMs:NOW}); assert(!r.ok && r.sampleSize===251);
});
t('최신 세션이 빠지면 stale, 3일 주말의 금요일은 정상', () => {
 assert.equal(ivRankFromHistory(rows,{nowMs:NOW}).ok,true);
 const r=ivRankFromHistory(rows.slice(1),{nowMs:NOW}); assert(!r.ok && r.reason==='stale');
 assert.equal(ivLevelForRank({metric:'iv30',currentIv:30,_source:'dynamodb-stale'}),null);
});
t('얕은 다른 작성자 행은 창과 최신값에 영향 없음', () => {
 const foreign=rows.map(h=>({timestamp:h.timestamp+60000,gex:1,price:100}));
 assert.deepEqual(ivRankFromHistory([...rows,...foreign],{nowMs:NOW}),ivRankFromHistory(rows,{nowMs:NOW}));
 assert.equal(isIvHarvestRow(foreign[0]),false); assert.equal(isIvHarvestRow(rows[0]),true);
});
t('주말 반복 행은 금요일 값을 덮지 않는다', () => {
 const r=ivRankFromHistory([...rows,{...rows[0],timestamp:Date.parse('2026-10-18T20:00:00Z'),iv30:99}],{nowMs:NOW});
 assert(r.ok && r.currentIv===20 && r.sampleSize===252);
});
t('수집 중 응답 판정만 참, 원천 오류는 거짓', () => {
 assert.equal(ivRankIsCollecting({percentile:null,_source:'dynamodb-collecting'}),true);
 assert.equal(ivRankIsCollecting({percentile:null,_source:'error'}),false);
});
console.log(`${n}/${n} passed`);
