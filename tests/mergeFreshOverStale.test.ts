import assert from 'node:assert/strict';
import { mergeFreshOverStale } from '../src/lib/mergeFreshOverStale';
// 밤 검토 10/18 재현: 옛 캐시 vwap=95, 새 원천 vwap=null → null 유지(괴리율 계산 안 함)
assert.equal(mergeFreshOverStale({ vwap: 95, price: 100 }, { vwap: null, price: 110 }).vwap, null);
assert.equal(mergeFreshOverStale({ quote: { vwap: 95 } }, { quote: { vwap: null } }).quote.vwap, null, '중첩 vwap 도');
// 다른 필드는 기존 동작(빈 값이면 옛 값 유지)
assert.equal(mergeFreshOverStale({ price: 100, iv: 0.3 }, { price: null, iv: undefined }).price, 100);
assert.equal(mergeFreshOverStale({ vwap: 95 }, {}).vwap, 95, '필드가 아예 없으면 기존 유지');
assert.equal(mergeFreshOverStale({ vwap: 95 }, { vwap: 101 }).vwap, 101);
console.log('mergeFreshOverStale 시험 5개 통과');
