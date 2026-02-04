// 주간 만기 vs 전체 만기 감마 스퀴즈 확률 비교 테스트

async function testSqueezeProbability() {
    const ticker = 'TSLA';
    console.log(`\n🔬 감마 스퀴즈 확률 테스트: ${ticker}`);
    console.log('='.repeat(60));

    // 1. 옵션 체인 가져오기
    const res = await fetch(`http://localhost:3000/api/live/ticker?t=${ticker}`);
    const data = await res.json();

    const rawChain = data.flow?.rawChain || [];
    const currentPrice = data.display?.price || data.prices?.prevRegularClose || 0;

    console.log(`\n📊 데이터 현황:`);
    console.log(`   현재가: $${currentPrice.toFixed(2)}`);
    console.log(`   전체 옵션 계약: ${rawChain.length}개`);

    // 2. 만기별 필터링
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 7일 만기 (주간)
    const weeklyExpiry = new Date(today);
    weeklyExpiry.setDate(today.getDate() + 7);

    // 35일 만기 (중기)
    const midTermExpiry = new Date(today);
    midTermExpiry.setDate(today.getDate() + 35);

    const weeklyOptions = rawChain.filter(opt => {
        const expiryStr = opt.details?.expiration_date;
        if (!expiryStr) return false;
        const parts = expiryStr.split('-');
        const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return expiry >= today && expiry <= weeklyExpiry;
    });

    const allOptions = rawChain.filter(opt => {
        const expiryStr = opt.details?.expiration_date;
        if (!expiryStr) return false;
        const parts = expiryStr.split('-');
        const expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return expiry >= today;
    });

    console.log(`   0-7 DTE (주간): ${weeklyOptions.length}개`);
    console.log(`   전체 유효: ${allOptions.length}개`);

    // 3. GEX 계산 함수
    function calculateGEX(options, price) {
        let totalGex = 0;
        let totalOI = 0;
        let atmGex = 0;

        options.forEach(opt => {
            const gamma = opt.greeks?.gamma || 0;
            const oi = opt.open_interest || opt.day?.open_interest || 0;
            const strike = opt.details?.strike_price || 0;
            const type = opt.details?.contract_type;

            const dealerGex = type === 'call'
                ? -gamma * oi * 100 * price
                : gamma * oi * 100 * price;

            totalGex += dealerGex;
            totalOI += oi;

            if (Math.abs(strike - price) / price < 0.02) {
                atmGex += Math.abs(dealerGex);
            }
        });

        return { totalGex, totalOI, atmGex };
    }

    // 4. 스퀴즈 확률 계산
    function calculateSqueezeProbability(options, price) {
        const { totalGex, totalOI, atmGex } = calculateGEX(options, price);

        let score = 0;
        const factors = [];

        const marketProxy = price * (totalOI || 1);
        const gexIntensity = Math.abs(totalGex) / marketProxy * 10000;
        const isShortGamma = totalGex < 0;

        // GEX Intensity (0-35점)
        if (isShortGamma) {
            const gexScore = Math.min(35, Math.round(gexIntensity * 5));
            score += gexScore;
            factors.push({ name: `숏감마 ${(totalGex / 1e6).toFixed(1)}M`, contribution: gexScore });
        } else {
            const stabilityPenalty = Math.min(10, Math.round(gexIntensity * 2));
            score += stabilityPenalty;
            factors.push({ name: `롱감마 (억제)`, contribution: stabilityPenalty });
        }

        // ATM Concentration (0-20점)
        const atmRatio = totalGex !== 0 ? atmGex / Math.abs(totalGex) : 0;
        if (atmRatio > 0.3) {
            const atmScore = Math.min(20, Math.round(atmRatio * 30));
            score += atmScore;
            factors.push({ name: `ATM 집중 ${Math.round(atmRatio * 100)}%`, contribution: atmScore });
        }

        // 0DTE 비율 (0-20점)
        const todayStr = new Date().toISOString().split('T')[0];
        const zeroDte = options.filter(opt => opt.details?.expiration_date === todayStr);
        const zeroDteImpact = options.length > 0 ? zeroDte.length / options.length : 0;
        if (zeroDteImpact > 0.1) {
            const zeroScore = Math.min(20, Math.round(zeroDteImpact * 50));
            score += zeroScore;
            factors.push({ name: `0DTE ${Math.round(zeroDteImpact * 100)}%`, contribution: zeroScore });
        }

        const probability = Math.min(100, Math.max(0, score));
        let label = 'LOW';
        if (probability >= 70) label = 'EXTREME';
        else if (probability >= 45) label = 'HIGH';
        else if (probability >= 20) label = 'MODERATE';

        return { probability, label, factors, totalGex, isShortGamma };
    }

    // 5. 비교 계산
    const weeklyResult = calculateSqueezeProbability(weeklyOptions, currentPrice);
    const allResult = calculateSqueezeProbability(allOptions, currentPrice);

    console.log(`\n📈 감마 스퀴즈 확률 비교:`);
    console.log('─'.repeat(60));
    console.log(`   주간 만기 (0-7 DTE): ${weeklyResult.probability}% [${weeklyResult.label}]`);
    console.log(`   전체 만기:           ${allResult.probability}% [${allResult.label}]`);
    console.log(`   차이:                ${weeklyResult.probability - allResult.probability}%`);

    console.log(`\n📊 GEX 비교:`);
    console.log(`   주간: ${(weeklyResult.totalGex / 1e6).toFixed(2)}M (${weeklyResult.isShortGamma ? '숏감마' : '롱감마'})`);
    console.log(`   전체: ${(allResult.totalGex / 1e6).toFixed(2)}M (${allResult.isShortGamma ? '숏감마' : '롱감마'})`);

    console.log(`\n🔍 주간 만기 요인 분석:`);
    weeklyResult.factors.forEach(f => {
        console.log(`   • ${f.name}: +${f.contribution}%`);
    });

    console.log(`\n🔍 전체 만기 요인 분석:`);
    allResult.factors.forEach(f => {
        console.log(`   • ${f.name}: +${f.contribution}%`);
    });

    // 6. Call/Put Wall 계산 (주간만)
    const strikeMap = new Map();
    weeklyOptions.forEach(opt => {
        const strike = opt.details?.strike_price;
        const type = opt.details?.contract_type;
        const vol = opt.day?.volume || 0;
        if (!strike) return;

        if (!strikeMap.has(strike)) {
            strikeMap.set(strike, { callVol: 0, putVol: 0 });
        }
        const entry = strikeMap.get(strike);
        if (type === 'call') entry.callVol += vol;
        else if (type === 'put') entry.putVol += vol;
    });

    let maxCall = 0, maxPut = 0, callWall = 0, putWall = 0;
    strikeMap.forEach((val, strike) => {
        if (val.callVol > maxCall) { maxCall = val.callVol; callWall = strike; }
        if (val.putVol > maxPut) { maxPut = val.putVol; putWall = strike; }
    });

    console.log(`\n🎯 주간 만기 스퀴즈 트리거 레벨:`);
    console.log(`   상승 트리거 (Call Wall): $${callWall}`);
    console.log(`   하락 트리거 (Put Wall):  $${putWall}`);
    console.log(`   현재가 위치: ${((currentPrice - putWall) / (callWall - putWall) * 100).toFixed(1)}%`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ 테스트 완료');
}

testSqueezeProbability().catch(console.error);
