const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

async function run() {
    const ticker = 'NVDA';
    const url = `${POLYGON_BASE}/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
        console.log("Error:", res.status, await res.text());
        return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
run();
