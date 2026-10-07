/**
 * 재료에 없는 숫자 검사 — src/lib/ai/factGrounding.ts (섹터 AI 해석 출구)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/factGrounding.test.ts
 */
import assert from 'node:assert/strict';
import { numbersInText, ungroundedNumbers } from '@/lib/ai/factGrounding';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// 섹터 재료(예: silicon_core) — cron/sector-headlines 의 facts 한 줄과 같은 모양의 숫자들
const FACTS = [7, 7, 5, 2, 1.84, 6.2, -2.1, 8.3];   // total·measured·up·down·avg·leader·laggard·spread

t('숫자 추출 — 부호·쉼표·소수, 연도·이름 속 숫자 제외', () => {
    assert.deepEqual(numbersInText('NVDA +6.2% 와 AMD -2.1%, 2026년 S&P500 1,234.5').map((h) => h.written), ['+6.2', '-2.1', '1,234.5']);
});
t('재료의 숫자만 쓴 글은 통과 — «7종목 중 5곳 상승»·«선두 +6.2%»·«격차 8.3%p»·반올림 «약 6%»', () => {
    assert.deepEqual(ungroundedNumbers('7종목 중 5종목 상승, 선두 NVDA +6.2%, 후미 AMD -2.1%, 격차 8.3%p', FACTS), []);
    assert.deepEqual(ungroundedNumbers('Leader up about 6%, laggard down 2%, spread 8%.', FACTS), []);
});
t('재료에 없는 숫자는 걸린다 — «+9.5%»·«12종목»', () => {
    assert.deepEqual(ungroundedNumbers('선두가 +9.5% 급등했고 12종목이 올랐다', FACTS), ['+9.5', '12']);
});
t('소수 표기는 반올림 오차만 허용 — 1.84 → «1.8»·«1.84» 통과, «1.9» 는 걸린다', () => {
    assert.deepEqual(ungroundedNumbers('평균 +1.8%', FACTS), []);
    assert.deepEqual(ungroundedNumbers('평균 +1.84%', FACTS), []);
    assert.deepEqual(ungroundedNumbers('평균 +1.9%', FACTS), ['+1.9']);
});
console.log(`\n${n} passed`);
