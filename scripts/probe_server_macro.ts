
async function main() {
    try {
        const res = await fetch('http://localhost:3000/api/market/macro');
        const data = await res.json();
        console.log("API Response:");
        console.log("Nasdaq Level:", data.factors?.nasdaq100?.level);
        console.log("VIX Level:", data.factors?.vix?.level);
        console.log("Source Used:", data.factors?.nasdaq100?.source);
    } catch (e) {
        console.error("API Probe Failed:", e.message);
    }
}
main();
