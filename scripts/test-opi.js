async function analyzeOPI(ticker) {
    try {
        const [chainRes, tickerRes] = await Promise.all([
            fetch('http://localhost:3000/api/live/options/chain?t=' + ticker),
            fetch('http://localhost:3000/api/live/ticker?t=' + ticker)
        ]);
        const chainData = await chainRes.json();
        const tickerData = await tickerRes.json();
        const chain = chainData.rawChain || [];
        const price = tickerData.display?.price || 0;

        // ===== OPI CALCULATION (same as FlowRadar.tsx) =====
        let callPressure = 0;
        let putPressure = 0;

        chain.forEach(opt => {
            const delta = opt.greeks?.delta || 0;
            const oi = opt.open_interest || 0;
            const type = opt.details?.contract_type;

            if (type === 'call' && delta > 0) {
                callPressure += delta * oi;
            } else if (type === 'put' && delta < 0) {
                putPressure += Math.abs(delta) * oi;
            }
        });

        const rawOpi = callPressure - putPressure;
        const normalized = Math.max(-100, Math.min(100, rawOpi / 10000));

        console.log('========================================================');
        console.log(`  ${ticker} @ $${price.toFixed(2)}  -  OPI 상세 분석`);
        console.log('========================================================');
        console.log('');
        console.log('OPI = Call Pressure - Put Pressure');
        console.log(`  Call Pressure (Delta x OI): ${callPressure.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
        console.log(`  Put Pressure  (Delta x OI): ${putPressure.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
        console.log(`  Raw OPI: ${rawOpi.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
        console.log(`  Normalized (-100~+100): ${Math.round(normalized)}`);
        console.log('');

        // The problem: normalized with /10000 makes most values near 0
        console.log('--- 정규화 문제 진단 ---');
        console.log(`  rawOpi / 10000 = ${(rawOpi / 10000).toFixed(2)}`);
        console.log(`  rawOpi / 1000  = ${(rawOpi / 1000).toFixed(2)}`);
        console.log(`  rawOpi / 500   = ${(rawOpi / 500).toFixed(2)}`);

        // Better normalization: use ratio
        const totalPressure = callPressure + putPressure;
        const ratioOpi = totalPressure > 0 ? ((callPressure - putPressure) / totalPressure * 100) : 0;

        console.log('');
        console.log('--- 대안: 비율 기반 OPI ---');
        console.log(`  (Call - Put) / (Call + Put) * 100 = ${ratioOpi.toFixed(1)}`);
        console.log(`  해석: ${ratioOpi > 0 ? 'Call 쪽이 ' + ratioOpi.toFixed(0) + '% 더 강함' : 'Put 쪽이 ' + Math.abs(ratioOpi).toFixed(0) + '% 더 강함'}`);

        // What this means for trading
        console.log('');
        console.log('--- 트레이딩 의미 ---');
        if (ratioOpi > 20) {
            console.log('  강한 콜 압력: 마켓메이커가 주식을 사서 헤지해야 함 -> 상방 압력');
            console.log('  대응: 풀백 매수 유리, 숏 진입 불리');
        } else if (ratioOpi > 5) {
            console.log('  약한 콜 우위: 소폭 상방 편향. 추세 확인 후 매수');
            console.log('  대응: 기존 롱 유지, 신규 진입은 다른 시그널 확인');
        } else if (ratioOpi > -5) {
            console.log('  중립: 콜/풋 균형. 방향성 판단 불가');
            console.log('  대응: 레인지 트레이딩 또는 관망');
        } else if (ratioOpi > -20) {
            console.log('  약한 풋 우위: 소폭 하방 편향');
            console.log('  대응: 신규 롱 자제, 풋 헤지 고려');
        } else {
            console.log('  강한 풋 압력: 마켓메이커가 주식을 팔아서 헤지 -> 하방 압력');
            console.log('  대응: 롱 포지션 축소, 숏 또는 풋 매수 유리');
        }
        console.log('');

    } catch (e) { console.log(ticker + ': ERROR - ' + e.message); }
}

(async () => {
    for (const t of ['NVDA', 'TSLA', 'GOOGL', 'AAPL']) {
        await analyzeOPI(t);
    }
})();
