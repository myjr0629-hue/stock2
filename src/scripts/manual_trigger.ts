
import { generateReport } from '../services/reportScheduler';

async function main() {
    try {
        console.log("=== MANUAL LIVE FIRE TEST ===");

        console.log("[1/2] Triggering DRAFT (Discovery Phase)...");
        const draft = await generateReport('draft', true);
        console.log("✅ DRAFT Generated:", draft.meta.id);
        console.log(`stats: items=${draft.items.length}, hunters=${draft.hunters?.length || 0}`);
        if (draft.hunters && draft.hunters.length > 0) {
            console.log("Sample Hunter:", draft.hunters[0].ticker, draft.hunters[0].tacticalRole);
        }

        console.log("\n[2/2] Triggering FINAL (Lock Phase)...");
        const finalRep = await generateReport('final', true);
        console.log("✅ FINAL Generated:", finalRep.meta.id);
        console.log(`stats: items=${finalRep.items.length}, hunters=${finalRep.hunters?.length || 0}`);

        if (finalRep.hunters && finalRep.hunters.length > 0) {
            console.log("Sample Hunter (Final):", finalRep.hunters[0].ticker, finalRep.hunters[0].decisionSSOT);
        }

    } catch (e) {
        console.error("❌ FAILURE:", e);
    }
}

main();
