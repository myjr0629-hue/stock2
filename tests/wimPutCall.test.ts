/**
 * WIM «풋/콜 비율» 방향 — volumePcr(이름과 반대로 콜÷풋)를 풋÷콜로 보여 준다(2026-09-30)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/wimPutCall.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const page = fs.readFileSync('src/app/[locale]/wim/page.tsx', 'utf8');
const route = fs.readFileSync('src/app/api/wim/today/route.ts', 'utf8');
// 화면: volumePcr 를 그대로 «풋/콜 비율»로 그리지 않는다
assert.ok(!/\{t\.pcr\} \{u\.money\.volumePcr\.toFixed/.test(page), '오늘 카드 칩이 volumePcr 를 그대로 쓴다');
assert.ok(!/k: t\.pcr, v: Math\.round\(m\.volumePcr/.test(page), 'UC 카드 타일이 volumePcr 를 그대로 쓴다');
assert.ok(page.includes('function putCallOf('), 'putCallOf 도우미 없음');
// 서버: AI 입력과 응답에 풋÷콜(putCallRatio)
assert.ok(/putCallRatio: volumePutCall\(m\.money\.volumePcr\)/.test(route), 'AI 입력·응답에 putCallRatio 없음');
// putCallOf 동작(같은 식을 여기서 재현)
const putCallOf = (m: any) => (typeof m?.putCallRatio === 'number' && m.putCallRatio > 0 ? m.putCallRatio : typeof m?.volumePcr === 'number' && m.volumePcr > 0 ? 1 / m.volumePcr : null);
assert.equal(putCallOf({ volumePcr: 2.48 })!.toFixed(2), '0.40');     // 옛 캐시(콜÷풋) → 뒤집기
assert.equal(putCallOf({ putCallRatio: 0.4, volumePcr: 2.48 }), 0.4);  // 새 응답 우선
assert.equal(putCallOf({ volumePcr: null }), null);
console.log('✅ wimPutCall: 7건 통과');
