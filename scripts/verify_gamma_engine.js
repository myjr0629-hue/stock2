// scripts/verify_gamma_engine.js
// Verify all NET GAMMA ENGINE values for accuracy

async function verifyGammaEngine() {
    console.log('=== NET GAMMA ENGINE 정확성 검증 ===\n');

    // 1. Fetch both data sources
    const structRes = await fetch('http://localhost:3000/api/live/options/structure?t=TSLA');
    const structure = await structRes.json();

    const tickerRes = await fetch('http://localhost:3000/api/live/ticker?t=TSLA&chain=full');
    const ticker = await tickerRes.json();

    const currentPrice = ticker?.display?.price || ticker?.prices?.prevRegularClose || 0;
    const rawChain = ticker?.flow?.rawChain || [];

    // Weekly expiry only
    const weeklyChain = rawChain.filter(opt =>
        opt.details?.expiration_date === structure.expiration
    );

    console.log('📊 표시 값 vs 직접 계산 비교\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // =============================================
    // 1. NET GEX 검증
    // =============================================
    console.log('1️⃣ NET GEX');
    console.log(`   📺 화면 표시: ${(structure.netGex / 1e6).toFixed(2)}M`);

    // Calculate from rawChain - MARKET perspective (like stockApi)
    let marketGex = 0;
    weeklyChain.forEach(opt => {
        const gamma = opt.greeks?.gamma || 0;
        const oi = opt.open_interest || 0;
        const type = opt.details?.contract_type;
        // Market perspective: call +, put -
        marketGex += type === 'call' ? (gamma * oi * 100) : -(gamma * oi * 100);
    });
    console.log(`   🧮 시장 관점 계산: ${(marketGex / 1e6).toFixed(2)}M`);

    // Calculate from rawChain - DEALER perspective (like FlowRadar)
    let dealerGex = 0;
    weeklyChain.forEach(opt => {
        const gamma = opt.greeks?.gamma || 0;
        const oi = opt.open_interest || 0;
        const type = opt.details?.contract_type;
        // Dealer perspective: call -, put +
        dealerGex += type === 'call'
            ? -(gamma * oi * 100 * currentPrice)
            : (gamma * oi * 100 * currentPrice);
    });
    console.log(`   🏦 딜러 관점 계산: ${(dealerGex / 1e6).toFixed(2)}M`);

    const marketState = marketGex > 0 ? '롱감마 (STABLE)' : '숏감마';
    const dealerState = dealerGex < 0 ? '숏감마' : '롱감마 (STABLE)';
    console.log(`   📺 화면: ${structure.netGex > 0 ? '롱감마 (STABLE)' : '숏감마'}`);
    console.log(`   🧮 시장 관점: ${marketState}`);
    console.log(`   🏦 딜러 관점: ${dealerState}`);
    console.log('');

    // =============================================
    // 2. P/C RATIO 검증
    // =============================================
    console.log('2️⃣ P/C RATIO');
    console.log(`   📺 화면 표시: ${structure.pcRatio?.toFixed(2) || 'N/A'}`);

    let callOI = 0, putOI = 0;
    weeklyChain.forEach(opt => {
        const oi = opt.open_interest || 0;
        if (opt.details?.contract_type === 'call') callOI += oi;
        else putOI += oi;
    });
    const calcPCR = callOI > 0 ? (putOI / callOI) : 0;
    console.log(`   🧮 직접 계산: ${calcPCR.toFixed(2)}`);
    console.log(`   ✅ 일치: ${Math.abs((structure.pcRatio || 0) - calcPCR) < 0.01 ? 'YES' : 'NO'}`);
    console.log('');

    // =============================================
    // 3. TOTAL OI 검증
    // =============================================
    console.log('3️⃣ TOTAL OI');
    console.log(`   📺 화면 표시: ${(structure.totalOI / 1000).toFixed(0)}K`);
    const calcOI = callOI + putOI;
    console.log(`   🧮 직접 계산: ${(calcOI / 1000).toFixed(0)}K`);
    console.log(`   ✅ 일치: ${Math.abs(structure.totalOI - calcOI) < 100 ? 'YES' : 'NO'}`);
    console.log('');

    // =============================================
    // 4. GAMMA FLIP LEVEL 검증
    // =============================================
    console.log('4️⃣ GAMMA FLIP LEVEL');
    console.log(`   📺 화면 표시: $${structure.levels?.gammaFlip || 'N/A'}`);

    // Calculate flip level from weekly chain
    const strikeGex = {};
    weeklyChain.forEach(opt => {
        const gamma = opt.greeks?.gamma || 0;
        const oi = opt.open_interest || 0;
        const strike = opt.details?.strike_price || 0;
        const type = opt.details?.contract_type;
        const gex = type === 'call' ? (gamma * oi * 100) : -(gamma * oi * 100);
        strikeGex[strike] = (strikeGex[strike] || 0) + gex;
    });

    let cumGex = 0;
    let prevCumGex = 0;
    let flipLevel = null;
    const sortedStrikes = Object.keys(strikeGex).map(Number).sort((a, b) => a - b);

    for (const strike of sortedStrikes) {
        cumGex += strikeGex[strike];
        if ((cumGex > 0 && prevCumGex < 0) || (cumGex < 0 && prevCumGex > 0)) {
            flipLevel = strike;
        }
        prevCumGex = cumGex;
    }
    console.log(`   🧮 직접 계산: $${flipLevel || 'N/A'}`);
    console.log('');

    // =============================================
    // 5. 0DTE IMPACT 검증
    // =============================================
    console.log('5️⃣ 0DTE IMPACT');
    console.log(`   📺 화면 표시: ${((structure.gexZeroDteRatio || 0) * 100).toFixed(0)}%`);

    const today = new Date().toISOString().split('T')[0];
    const zeroDteContracts = rawChain.filter(opt => opt.details?.expiration_date === today);
    const zeroDteRatio = rawChain.length > 0 ? zeroDteContracts.length / rawChain.length : 0;
    console.log(`   🧮 직접 계산: ${(zeroDteRatio * 100).toFixed(0)}% (오늘=${today})`);
    console.log(`   📅 주간만기: ${structure.expiration} (${structure.expiration === today ? '오늘' : '다른 날'})`);
    console.log('');

    // =============================================
    // 핵심 문제점 요약
    // =============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  핵심 문제점:');
    console.log('');
    console.log('   1. GEX 부호 해석:');
    console.log(`      - API (시장 관점): ${marketGex > 0 ? '양수=롱감마' : '음수=숏감마'}`);
    console.log(`      - FlowRadar (딜러 관점): ${dealerGex < 0 ? '음수=숏감마' : '양수=롱감마'}`);
    console.log('      → 동일 데이터인데 해석이 반대!');
    console.log('');
    console.log('   2. 0DTE 계산:');
    console.log(`      - 주간만기(${structure.expiration}) ≠ 오늘(${today})`);
    console.log('      → 0DTE Impact가 항상 0%로 표시됨');
    console.log('');
    console.log('   3. Squeeze Risk:');
    console.log('      - 시장 관점 0.1M 롱감마 → LOW');
    console.log('      - 딜러 관점 -25.6M 숏감마 → EXTREME');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

verifyGammaEngine().catch(console.error);
