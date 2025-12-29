
// scripts/trigger_refresh.ts
async function run() {
    console.log("Triggering Morning Report Regeneration...");
    try {
        const res = await fetch("http://localhost:3000/api/cron/report?type=morning&force=true", {
            method: 'GET'
        });
        const json = await res.json();
        console.log("Response Status:", res.status);
        console.log("Response Body:", JSON.stringify(json, null, 2));
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
run();
