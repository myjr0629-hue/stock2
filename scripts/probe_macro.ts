
import { getMacroSnapshotSSOT } from '../src/services/macroHubProvider';

async function main() {
    console.log("Probing Macro SSOT...");
    try {
        const snapshot = await getMacroSnapshotSSOT();
        console.log("Snapshot Result:");
        console.log(JSON.stringify(snapshot, null, 2));
    } catch (e) {
        console.error("Probe Failed:", e);
    }
}

main();
