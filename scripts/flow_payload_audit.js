async function main() {
    const r = await fetch('http://localhost:3000/api/live/ticker?t=NVDA');
    const d = await r.json();

    const keys = Object.keys(d);
    console.log('=== Top-level keys ===');
    for (const k of keys) {
        const v = JSON.stringify(d[k]);
        console.log(`  ${k}: ${v.length} bytes`);
    }

    if (d.flow) {
        console.log('\n=== flow breakdown ===');
        const fk = Object.keys(d.flow);
        for (const fkey of fk) {
            const size = JSON.stringify(d.flow[fkey]).length;
            console.log(`  flow.${fkey}: ${size} bytes`);

            if (fkey === 'rawChain' && d.flow.rawChain?.length > 0) {
                console.log(`  rawChain count: ${d.flow.rawChain.length}`);
                const sample = d.flow.rawChain[0];
                console.log('  rawChain[0] keys:', Object.keys(sample));
                console.log('  rawChain[0] size:', JSON.stringify(sample).length, 'bytes');
                if (sample.details) console.log('  details keys:', Object.keys(sample.details));
                if (sample.greeks) console.log('  greeks keys:', Object.keys(sample.greeks));
                if (sample.day) console.log('  day keys:', Object.keys(sample.day));
                if (sample.last_quote) console.log('  last_quote keys:', Object.keys(sample.last_quote));
            }
            if (fkey === 'allExpiryChain') {
                console.log(`  allExpiryChain count: ${d.flow.allExpiryChain?.length}`);
                if (d.flow.allExpiryChain?.length > 0) {
                    const sample = d.flow.allExpiryChain[0];
                    console.log('  allExpiryChain[0] keys:', Object.keys(sample));
                    console.log('  allExpiryChain[0] size:', JSON.stringify(sample).length, 'bytes');
                }
            }
        }
    }

    // Calculate what FlowRadar ACTUALLY needs
    console.log('\n=== Slimmed payload estimate ===');
    if (d.flow?.rawChain) {
        const slimmed = d.flow.rawChain.map(opt => ({
            details: {
                strike_price: opt.details?.strike_price,
                contract_type: opt.details?.contract_type,
                expiration_date: opt.details?.expiration_date,
            },
            day: {
                volume: opt.day?.volume,
                close: opt.day?.close,
                open_interest: opt.day?.open_interest,
            },
            open_interest: opt.open_interest,
            greeks: {
                delta: opt.greeks?.delta,
                gamma: opt.greeks?.gamma,
                implied_volatility: opt.greeks?.implied_volatility,
            },
            implied_volatility: opt.implied_volatility,
            last_quote: opt.last_quote ? { midpoint: opt.last_quote.midpoint } : undefined,
        }));
        console.log(`  Original rawChain: ${JSON.stringify(d.flow.rawChain).length} bytes`);
        console.log(`  Slimmed rawChain:  ${JSON.stringify(slimmed).length} bytes`);
        console.log(`  Savings: ${Math.round((1 - JSON.stringify(slimmed).length / JSON.stringify(d.flow.rawChain).length) * 100)}%`);
    }
}

main().catch(console.error);
