// Standalone script
async function fetchConditions() {
    const API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
    const url = `https://api.polygon.io/v3/reference/conditions?limit=1000&apiKey=${API_KEY}`;

    try {
        console.log("Fetching: " + url);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Failed: ${res.status} ${res.statusText}`);
            console.error(await res.text());
            return;
        }
        const data = await res.json();
        const results = data.results || [];

        const fs = require('fs');
        let out = "";
        results.forEach((c: any) => {
            out += `${c.id}: ${c.name}\n`;
        });
        fs.writeFileSync('scripts/conditions_out.txt', out);
        console.log("Written " + results.length + " conditions to scripts/conditions_out.txt");

    } catch (e) {
        console.error(e);
    }
}

fetchConditions();
