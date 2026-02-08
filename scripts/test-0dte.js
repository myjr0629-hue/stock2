async function fullAnalysis(ticker) {
    try {
        const [chainRes, tickerRes] = await Promise.all([
            fetch('http://localhost:3000/api/live/options/chain?t=' + ticker),
            fetch('http://localhost:3000/api/live/ticker?t=' + ticker)
        ]);
        const chainData = await chainRes.json();
        const tickerData = await tickerRes.json();
        const chain = chainData.rawChain || [];
        const price = tickerData.display?.price || tickerData.prices?.prevRegularClose || 0;

        const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const todayStr = etNow.toISOString().split('T')[0];

        // P/C RATIO
        let callVol = 0, putVol = 0;
        chain.forEach(o => {
            const vol = o.day?.volume || 0;
            if (o.details?.contract_type === 'call') callVol += vol;
            else putVol += vol;
        });
        const pcRatio = putVol > 0 ? callVol / putVol : 0;

        // 0DTE IMPACT (by expiry)
        const expiries = {};
        let totalGamma = 0;
        chain.forEach(o => {
            const gamma = Math.abs(o.greeks?.gamma || 0);
            const oi = o.open_interest || 0;
            const gex = gamma * oi * 100;
            totalGamma += gex;
            const exp = o.details?.expiration_date;
            if (exp) {
                if (!expiries[exp]) expiries[exp] = { gamma: 0, count: 0 };
                expiries[exp].gamma += gex;
                expiries[exp].count++;
            }
        });

        const sortedExp = Object.entries(expiries).sort((a, b) => a[0].localeCompare(b[0]));
        const nearestExp = sortedExp[0];
        const nearestImpact = nearestExp ? (nearestExp[1].gamma / totalGamma * 100) : 0;
        const simulated0DTE = nearestImpact * 1.8;

        console.log('========================================================');
        console.log(`  ${ticker} @ $${price.toFixed(2)}  -  당일 트레이딩 인사이트`);
        console.log('========================================================');

        // P/C Ratio
        console.log('');
        console.log(`P/C RATIO: ${pcRatio.toFixed(2)} (Call ${callVol.toLocaleString()} / Put ${putVol.toLocaleString()})`);
        if (pcRatio > 2.0) {
            console.log('  -> 극단적 콜 우세. 강한 상승 기대.');
            console.log('  -> 대응: 롱 유지. 과열 시 역발상 풋 헤지 고려.');
        } else if (pcRatio > 1.3) {
            console.log('  -> 콜 우세. 상승 심리 확인.');
            console.log('  -> 대응: 눌림 시 매수 유효. 상방 모멘텀 유지.');
        } else if (pcRatio > 0.8) {
            console.log('  -> 균형. 방향성 확신 낮음.');
            console.log('  -> 대응: 레인지 트레이딩. 지지/저항 근처에서만.');
        } else {
            console.log('  -> 풋 우세. 하락 헤지/베팅 중.');
            console.log('  -> 대응: 신규 롱 자제. 헤지 강화.');
        }

        // 0DTE Impact
        console.log('');
        console.log(`0DTE IMPACT: ${nearestImpact.toFixed(1)}% (nearest: ${nearestExp ? nearestExp[0] : 'N/A'})`);
        console.log(`장중 0DTE 추정: ~${simulated0DTE.toFixed(0)}% (감마가속 반영)`);

        if (simulated0DTE > 25) {
            console.log('  -> 당일 감마 폭발 가능! 한 방향 큰 움직임 예상.');
            console.log('  -> 대응: 스탑로스 타이트. 브레이크아웃 빠른 진입/청산.');
            console.log('  -> MM의 델타헤지가 가격움직임 증폭 가능.');
        } else if (simulated0DTE > 10) {
            console.log('  -> 중간 감마. 평소보다 변동성 확대.');
            console.log('  -> 대응: 포지션 70%로. 주요 레벨에서만 트레이딩.');
        } else {
            console.log('  -> 안정적. 0DTE 감마 영향 작음.');
            console.log('  -> 대응: 일반적 전략 유효.');
        }

        // Combined
        console.log('');
        console.log('종합 판단:');
        if (pcRatio > 1.3 && simulated0DTE < 15) {
            console.log('  "상승 심리 + 안정적 감마 = 추세 추종 매수 전략 유효"');
        } else if (pcRatio > 1.3 && simulated0DTE > 25) {
            console.log('  "상승 기대 + 고감마 = 방향 맞으면 폭발수익, 틀리면 급손실"');
            console.log('  "스윙보다 단타 적합. 빠른 손익관리 필수."');
        } else if (pcRatio < 0.8 && simulated0DTE > 25) {
            console.log('  "하락 심리 + 고감마 = 폭락 가능성. 풋 보호 필수."');
        } else if (pcRatio < 0.8) {
            console.log('  "풋 우세. 보수적 접근. 반등 확인 전까지 관망."');
        } else {
            console.log('  "중립 구간. 다른 지표와 교차확인 필요."');
        }
        console.log('');

    } catch (e) { console.log(ticker + ': ERROR - ' + e.message); }
}

(async () => {
    for (const t of ['NVDA', 'TSLA', 'GOOGL', 'AAPL']) {
        await fullAnalysis(t);
    }
})();
