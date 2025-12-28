
import { analyzeGemsTicker } from '../src/services/stockTypes';

async function main() {
    console.log("=== S-55.9 Logic Verification ===");

    const tCommon = { ticker: 'TEST', day: { v: 1000 }, prevDay: { c: 100 } };
    const optsCommon = { options_status: 'OK', putCallRatio: 0.5, gems: { gex: 1000 } };

    console.log("\n--- Case 1: Full Data (1D + 1W + 1M) ---");
    {
        const metrics = { change1W: 10, change1M: 20 }; // +10% -> 70, +20% -> 70 (score1M=50+20*1=70)
        const res = analyzeGemsTicker(tCommon, "Neutral", optsCommon, false, metrics);
        const tf = res.v71?.multiTF;
        if (!tf) throw new Error("No multiTF");

        console.log(`1D: ${tf.score1D}, 1W: ${tf.score1W}, 1M: ${tf.score1M}`);
        console.log(`Final: ${tf.finalScore}, Comp: ${tf.composition}`);

        // Expected: 0.5*s1D + 0.3*70 + 0.2*70
        const expected = Number((tf.score1D * 0.5 + 70 * 0.3 + 70 * 0.2).toFixed(1));

        if (Math.abs(tf.finalScore - expected) > 0.1) console.error(`FAIL: Expected ${expected}, Got ${tf.finalScore}`);
        else console.log("PASS");

        if (tf.composition !== "50/30/20") console.error(`FAIL: Comp ${tf.composition}`);
    }

    console.log("\n--- Case 2: Missing 1W (1D + 1M) ---");
    {
        const metrics = { change1M: 20 }; // +20% -> 70
        const res = analyzeGemsTicker(tCommon, "Neutral", optsCommon, false, metrics);
        const tf = res.v71?.multiTF;
        if (!tf) throw new Error("No multiTF");

        console.log(`1D: ${tf.score1D}, 1W: ${tf.score1W}, 1M: ${tf.score1M}`);
        console.log(`Final: ${tf.finalScore}, Comp: ${tf.composition}, Reason: ${tf.fallbackReasonKR}`);

        // Logic: 0.7*1D + 0.3*1M
        const expected = Number((tf.score1D * 0.7 + 70 * 0.3).toFixed(1));

        if (Math.abs(tf.finalScore - expected) > 0.1) console.error(`FAIL: Expected ${expected}, Got ${tf.finalScore}`);
        else console.log("PASS");

        if (tf.composition !== "70/0/30") console.error(`FAIL: Comp ${tf.composition}`);
        if (!tf.fallbackReasonKR?.includes("중기 데이터 부족")) console.error("FAIL: Reason mismatch");
    }

    console.log("\n--- Case 3: Missing 1M (1D + 1W) ---");
    {
        const metrics = { change1W: 10 }; // +10% -> 70
        const res = analyzeGemsTicker(tCommon, "Neutral", optsCommon, false, metrics);
        const tf = res.v71?.multiTF;
        if (!tf) throw new Error("No multiTF");

        console.log(`1D: ${tf.score1D}, 1W: ${tf.score1W}, 1M: ${tf.score1M}`);
        console.log(`Final: ${tf.finalScore}, Comp: ${tf.composition}, Reason: ${tf.fallbackReasonKR}`);

        // Logic: 0.8*1D + 0.2*1W
        const expected = Number((tf.score1D * 0.8 + 70 * 0.2).toFixed(1));

        if (Math.abs(tf.finalScore - expected) > 0.1) console.error(`FAIL: Expected ${expected}, Got ${tf.finalScore}`);
        else console.log("PASS");

        if (tf.composition !== "80/20/0") console.error(`FAIL: Comp ${tf.composition}`);
        if (!tf.fallbackReasonKR?.includes("장기 데이터 부족")) console.error("FAIL: Reason mismatch");
    }

    console.log("\n--- Case 4: Missing Both (1D Only) ---");
    {
        const res = analyzeGemsTicker(tCommon, "Neutral", optsCommon);
        const tf = res.v71?.multiTF;
        if (!tf) throw new Error("No multiTF");

        console.log(`Final: ${tf.finalScore}, Reason: ${tf.fallbackReasonKR}`);

        if (tf.finalScore !== tf.score1D) console.error(`FAIL: Final ${tf.finalScore} !== 1D ${tf.score1D}`);
        else console.log("PASS");

        if (tf.composition !== "100/0/0") console.error(`FAIL: Comp ${tf.composition}`);
        if (!tf.fallbackReasonKR?.includes("중장기 데이터 부족")) console.error("FAIL: Reason mismatch");
    }
}

main().catch(console.error);
