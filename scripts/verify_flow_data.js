// Verify Flow page data accuracy for TSLA
// Cross-check: volume by strike, weekly expiry filter, AI Verdict inputs
async function main() {
    const BASE = 'http://localhost:3001';
    const ticker = 'TSLA';

    console.log(`=== TSLA Flow Data Verification ===\n`);

    // 1. Fetch ticker data (same API the Flow page uses)
    const res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    const data = await res.json();

    const rawChain = data.flow?.rawChain || [];
    const allExpiryChain = data.flow?.allExpiryChain || [];
    const currentPrice = data.display?.price || data.price || 0;

    console.log(`Current Price: $${currentPrice}`);
    console.log(`Session: ${data.session}`);
    console.log(`rawChain count: ${rawChain.length}`);
    console.log(`allExpiryChain count: ${allExpiryChain.length}`);

    // 2. Check what expirations are in rawChain (should be weekly/nearest)
    const expirations = new Set();
    rawChain.forEach(opt => {
        if (opt.details?.expiration_date) {
            expirations.add(opt.details.expiration_date);
        }
    });
    console.log(`\n--- rawChain Expirations ---`);
    const sortedExps = [...expirations].sort();
    sortedExps.forEach(exp => {
        const count = rawChain.filter(o => o.details?.expiration_date === exp).length;
        const now = new Date();
        const expDate = new Date(exp + 'T16:00:00-05:00'); // ET close
        const dte = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        console.log(`  ${exp} (DTE: ${dte}) — ${count} contracts`);
    });

    // 3. Check allExpiryChain expirations
    const allExps = new Set();
    allExpiryChain.forEach(opt => {
        if (opt.details?.expiration_date) allExps.add(opt.details.expiration_date);
    });
    console.log(`\n--- allExpiryChain Expirations (${allExps.size} total) ---`);
    [...allExps].sort().slice(0, 10).forEach(exp => {
        const count = allExpiryChain.filter(o => o.details?.expiration_date === exp).length;
        console.log(`  ${exp} — ${count} contracts`);
    });

    // 4. Volume by Strike (the main chart on the Flow page)
    // FlowRadar uses rawChain for VOLUME mode, filtered by DTE
    console.log(`\n--- Volume by Strike (rawChain, sorted by total volume) ---`);
    const strikeMap = {};
    rawChain.forEach(opt => {
        const strike = opt.details?.strike_price;
        const type = opt.details?.contract_type;
        const vol = opt.day?.volume || 0;
        if (!strike) return;
        if (!strikeMap[strike]) strikeMap[strike] = { call: 0, put: 0, total: 0 };
        if (type === 'call') strikeMap[strike].call += vol;
        else if (type === 'put') strikeMap[strike].put += vol;
        strikeMap[strike].total += vol;
    });

    const sortedStrikes = Object.entries(strikeMap)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20);

    console.log(`  ${'Strike'.padEnd(10)} ${'Call Vol'.padStart(12)} ${'Put Vol'.padStart(12)} ${'Total'.padStart(12)}`);
    console.log(`  ${'─'.repeat(48)}`);
    sortedStrikes.forEach(([strike, data]) => {
        const marker = parseFloat(strike) === 430 ? ' ← $430!' : '';
        console.log(`  $${String(strike).padEnd(9)} ${String(data.call).padStart(12)} ${String(data.put).padStart(12)} ${String(data.total).padStart(12)}${marker}`);
    });

    // 5. Specifically check $430 PUT volume (user's question)
    const put430 = rawChain.filter(o =>
        o.details?.strike_price === 430 && o.details?.contract_type === 'put'
    );
    console.log(`\n--- $430 PUT Details ---`);
    put430.forEach(opt => {
        console.log(`  Expiry: ${opt.details?.expiration_date}`);
        console.log(`  Volume: ${opt.day?.volume || 0}`);
        console.log(`  OI: ${opt.open_interest || 0}`);
        console.log(`  Delta: ${opt.greeks?.delta || 'N/A'}`);
        console.log(`  IV: ${opt.greeks?.implied_volatility || 'N/A'}`);
    });

    // 6. AI Verdict inputs verification
    console.log(`\n--- AI Verdict Input Data ---`);
    console.log(`  OPI: Calculated from rawChain delta*OI`);
    let callDeltaOI = 0, putDeltaOI = 0;
    rawChain.forEach(opt => {
        const delta = opt.greeks?.delta || 0;
        const oi = opt.open_interest || opt.day?.open_interest || 0;
        const type = opt.details?.contract_type;
        if (type === 'call') callDeltaOI += delta * oi;
        else if (type === 'put') putDeltaOI += Math.abs(delta) * oi;
    });
    const opiRaw = callDeltaOI - putDeltaOI;
    const opiNormalized = Math.min(100, Math.max(-100, opiRaw / 1000));
    console.log(`    Call delta*OI: ${callDeltaOI.toFixed(0)}`);
    console.log(`    Put delta*OI: ${putDeltaOI.toFixed(0)}`);
    console.log(`    OPI raw: ${opiRaw.toFixed(0)}`);
    console.log(`    OPI normalized: ${opiNormalized.toFixed(1)}`);

    // P/C Ratio
    let callVol = 0, putVol = 0;
    rawChain.forEach(o => {
        const v = o.day?.volume || 0;
        const ct = o.details?.contract_type;
        if (ct === 'call') callVol += v;
        else if (ct === 'put') putVol += v;
    });
    const pcRatio = putVol > 0 ? (callVol / putVol).toFixed(2) : 'N/A';
    console.log(`    Call Volume: ${callVol}`);
    console.log(`    Put Volume: ${putVol}`);
    console.log(`    P/C Ratio: ${pcRatio} (Screenshot shows 1.54)`);

    // Flow data from API
    console.log(`    Net Premium: $${(data.flow?.netPremium || 0).toLocaleString()}`);
    console.log(`    Squeeze Score: ${data.flow?.squeezeScore}`);
    console.log(`    Squeeze Risk: ${data.flow?.squeezeRisk}`);
    console.log(`    Gamma Flip Level: $${data.flow?.gammaFlipLevel}`);
    console.log(`    Max Pain: $${data.flow?.maxPain}`);
    console.log(`    Call Wall: $${data.flow?.callWall}`);
    console.log(`    Put Floor: $${data.flow?.putFloor}`);

    // 7. Verify slimming didn't lose data
    console.log(`\n--- Data Integrity Check ---`);
    const hasGreeks = rawChain.filter(o => o.greeks?.delta !== undefined).length;
    const hasVolume = rawChain.filter(o => o.day?.volume !== undefined).length;
    const hasOI = rawChain.filter(o => o.open_interest !== undefined).length;
    const hasStrike = rawChain.filter(o => o.details?.strike_price !== undefined).length;
    console.log(`  Contracts with greeks.delta: ${hasGreeks}/${rawChain.length}`);
    console.log(`  Contracts with day.volume: ${hasVolume}/${rawChain.length}`);
    console.log(`  Contracts with open_interest: ${hasOI}/${rawChain.length}`);
    console.log(`  Contracts with strike_price: ${hasStrike}/${rawChain.length}`);

    // Check if any critical field is missing (slimming error)
    const missingFields = [];
    if (hasGreeks === 0) missingFields.push('greeks.delta');
    if (hasVolume === 0) missingFields.push('day.volume');
    if (hasOI === 0) missingFields.push('open_interest');
    if (hasStrike === 0) missingFields.push('strike_price');

    if (missingFields.length > 0) {
        console.log(`\n  ⚠️ MISSING FIELDS: ${missingFields.join(', ')}`);
        console.log(`  → Slimming may have broken data!`);
    } else {
        console.log(`\n  ✅ All critical fields present — slimming preserved data integrity`);
    }
}

main().catch(console.error);
