// scripts/simulate_weekly_squeeze.js
// Simulate Squeeze Probability for Weekly Expiry (2/6)

async function simulateSqueeze() {
    console.log('=== TSLA Weekly Expiry (2/6) Squeeze Simulation ===\n');

    // 1. Fetch structure data
    const structRes = await fetch('http://localhost:3000/api/live/options/structure?t=TSLA');
    const structure = await structRes.json();

    // 2. Fetch ticker data (rawChain)
    const tickerRes = await fetch('http://localhost:3000/api/live/ticker?t=TSLA');
    const ticker = await tickerRes.json();

    const currentPrice = ticker?.display?.price || ticker?.prices?.prevRegularClose || 0;
    const rawChain = ticker?.flow?.rawChain || [];

    console.log('📊 Data Summary:');
    console.log(`   Expiration: ${structure.expiration}`);
    console.log(`   Current Price: $${currentPrice}`);
    console.log(`   Total Contracts: ${rawChain.length}`);
    console.log(`   Structure netGex: ${structure.netGex?.toLocaleString()}`);
    console.log(`   Structure zeroDteRatio: ${(structure.gexZeroDteRatio * 100).toFixed(1)}%`);
    console.log('');

    // 3. Filter to ONLY weekly expiry contracts
    const weeklyChain = rawChain.filter(opt =>
        opt.details?.expiration_date === structure.expiration
    );

    console.log(`📅 Weekly Expiry (${structure.expiration}) Contracts: ${weeklyChain.length}`);
    console.log('');

    // 4. Calculate Squeeze Probability for THIS expiry
    let totalGex = 0;
    let totalOI = 0;
    let atmGex = 0;
    let callOI = 0;
    let putOI = 0;

    weeklyChain.forEach(opt => {
        const gamma = opt.greeks?.gamma || 0;
        const oi = opt.open_interest || 0;
        const strike = opt.details?.strike_price || 0;
        const type = opt.details?.contract_type;

        // Dealer perspective GEX
        const dealerGex = type === 'call'
            ? -gamma * oi * 100 * currentPrice
            : gamma * oi * 100 * currentPrice;

        totalGex += dealerGex;
        totalOI += oi;

        if (type === 'call') callOI += oi;
        else putOI += oi;

        // ATM = within 2% of current price
        if (Math.abs(strike - currentPrice) / currentPrice < 0.02) {
            atmGex += Math.abs(dealerGex);
        }
    });

    const isShortGamma = totalGex < 0;
    const pcr = callOI > 0 ? putOI / callOI : 1;
    const marketProxy = currentPrice * (totalOI || 1);
    const gexIntensity = Math.abs(totalGex) / marketProxy * 10000;
    const atmRatio = totalOI > 0 ? atmGex / Math.abs(totalGex) * 100 : 0;

    console.log('🔬 Weekly Expiry Analysis:');
    console.log(`   Net GEX (Dealer): ${(totalGex / 1e6).toFixed(2)}M`);
    console.log(`   Gamma State: ${isShortGamma ? '🔴 SHORT GAMMA' : '🟢 LONG GAMMA'}`);
    console.log(`   GEX Intensity: ${gexIntensity.toFixed(2)}`);
    console.log(`   ATM Concentration: ${atmRatio.toFixed(1)}%`);
    console.log(`   Put/Call Ratio: ${pcr.toFixed(2)}`);
    console.log(`   Total OI: ${totalOI.toLocaleString()}`);
    console.log('');

    // 5. Calculate Squeeze Score for expiry day
    let score = 0;
    const factors = [];

    // Factor 1: GEX State (0-35 points)
    if (isShortGamma) {
        const gexScore = Math.min(35, Math.round(gexIntensity * 5));
        score += gexScore;
        factors.push({ name: `숏감마 ${(totalGex / 1e6).toFixed(1)}M`, points: gexScore });
    } else {
        score += 5;
        factors.push({ name: '롱감마 (안정)', points: 5 });
    }

    // Factor 2: ATM Concentration (0-20 points)
    if (atmRatio > 30) {
        const atmScore = Math.min(20, Math.round(atmRatio / 5));
        score += atmScore;
        factors.push({ name: `ATM 집중 ${atmRatio.toFixed(0)}%`, points: atmScore });
    }

    // Factor 3: PCR Extreme (0-15 points)
    if (pcr > 1.3) {
        const pcrScore = Math.min(15, Math.round((pcr - 1) * 15));
        score += pcrScore;
        factors.push({ name: `높은 풋 비중 (PCR ${pcr.toFixed(2)})`, points: pcrScore });
    } else if (pcr < 0.7) {
        const pcrScore = Math.min(10, Math.round((1 - pcr) * 15));
        score += pcrScore;
        factors.push({ name: `높은 콜 비중 (PCR ${pcr.toFixed(2)})`, points: pcrScore });
    }

    // Factor 4: Expiry Day Amplifier (만기일이므로 +15)
    score += 15;
    factors.push({ name: '만기일 증폭', points: 15 });

    // Clamp score
    const finalScore = Math.min(100, Math.max(0, score));

    // Determine level
    let level, color;
    if (finalScore >= 70) { level = 'EXTREME'; color = '🔴'; }
    else if (finalScore >= 45) { level = 'HIGH'; color = '🟠'; }
    else if (finalScore >= 20) { level = 'MODERATE'; color = '🟡'; }
    else { level = 'LOW'; color = '🟢'; }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📈 SQUEEZE PROBABILITY FOR ${structure.expiration}:`);
    console.log(`   ${color} ${finalScore}% (${level})`);
    console.log('');
    console.log('   Contributing Factors:');
    factors.forEach(f => console.log(`     • ${f.name}: +${f.points}점`));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

simulateSqueeze().catch(console.error);
