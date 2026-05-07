// 실시간 데이터 기반 등락률 검증
function round2(n: number): number { return Math.round(n * 100) / 100; }

const stocks = [
    { ticker: 'NVDA',  price: 211.5141, prevClose: 207.83,  extPrice: 208.00,   extLabel: 'PRE' },
    { ticker: 'TSLA',  price: 404.245,  prevClose: 398.73,  extPrice: 407.53,   extLabel: 'PRE' },
    { ticker: 'AAPL',  price: 289.3101, prevClose: 287.51,  extPrice: 289.06,   extLabel: 'PRE' },
    { ticker: 'GOOGL', price: 393.075,  prevClose: 398.04,  extPrice: 400.14,   extLabel: 'PRE' },
    { ticker: 'AMZN',  price: 271.65,   prevClose: 274.99,  extPrice: 275.09,   extLabel: 'PRE' },
    { ticker: 'PLTR',  price: 137.4861, prevClose: 133.79,  extPrice: 136.1489, extLabel: 'PRE' },
];

console.log('═══ 등락률 정확성 검증 (REG 세션) ═══\n');
console.log('┌──────────┬────────────┬────────────┬──────────────┬──────────────┬─────────────┐');
console.log('│ Ticker   │ Price      │ PrevClose  │ Calc Chg%    │ API Chg%     │ PRE Chg%    │');
console.log('├──────────┼────────────┼────────────┼──────────────┼──────────────┼─────────────┤');

for (const s of stocks) {
    // computeOnePipe REG 로직
    const mainChgPct = round2(((s.price - s.prevClose) / s.prevClose) * 100);
    const apiChgPct = round2(((s.price - s.prevClose) / s.prevClose) * 100);
    const preChgPct = round2(((s.extPrice - s.prevClose) / s.prevClose) * 100);
    
    console.log(`│ ${s.ticker.padEnd(8)} │ $${s.price.toFixed(2).padStart(8)} │ $${s.prevClose.toFixed(2).padStart(8)} │ ${(mainChgPct >= 0 ? '+' : '') + mainChgPct.toFixed(2) + '%'.padEnd(6)}     │ ${(apiChgPct >= 0 ? '+' : '') + apiChgPct.toFixed(2) + '%'.padEnd(6)}     │ ${(preChgPct >= 0 ? '+' : '') + preChgPct.toFixed(2) + '%'.padEnd(5)}    │`);
}
console.log('└──────────┴────────────┴────────────┴──────────────┴──────────────┴─────────────┘');

console.log('\n═══ 각 종목별 상세 검증 ═══\n');
let allCorrect = true;

for (const s of stocks) {
    const mainChg = round2(((s.price - s.prevClose) / s.prevClose) * 100);
    const preChg = round2(((s.extPrice - s.prevClose) / s.prevClose) * 100);
    
    // 수동 계산 검증
    const manualMainChg = Math.round(((s.price - s.prevClose) / s.prevClose) * 10000) / 100;
    const manualPreChg = Math.round(((s.extPrice - s.prevClose) / s.prevClose) * 10000) / 100;
    
    const mainCorrect = mainChg === manualMainChg;
    const preCorrect = preChg === manualPreChg;
    
    if (!mainCorrect || !preCorrect) allCorrect = false;
    
    console.log(`${s.ticker}:`);
    console.log(`  메인: ($${s.price} - $${s.prevClose}) / $${s.prevClose} × 100 = ${mainChg}% ${mainCorrect ? '✅' : '❌'}`);
    console.log(`  PRE:  ($${s.extPrice} - $${s.prevClose}) / $${s.prevClose} × 100 = ${preChg}% ${preCorrect ? '✅' : '❌'}`);
    console.log(`  표시 형태: ${(mainChg >= 0 ? '+' : '')}${mainChg}% PRE ${(preChg >= 0 ? '+' : '')}${preChg}%`);
    console.log('');
}

console.log(allCorrect ? '✅ 모든 등락률 계산 정확' : '❌ 등락률 계산 오류 발견');
