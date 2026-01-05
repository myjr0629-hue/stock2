
const https = require('https');

const url = "https://api.massive.com/fed/v1/treasury-yields?limit=1&sort=date.desc&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

console.log(`Fetching: ${url}`);

https.get(url, (res) => {
    let data = '';
    console.log(`Status: ${res.statusCode} ${res.statusMessage}`);

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            console.log("Body Preview:", data.substring(0, 300));
            const json = JSON.parse(data);
            console.log("JSON Parse Success. Keys:", Object.keys(json));
            if (json.results && json.results.length > 0) {
                console.log("Sample Result Item:", JSON.stringify(json.results[0], null, 2));
            } else {
                console.log("No results in array.");
            }
        } catch (e) {
            console.log("Not JSON.");
        }
    });

}).on('error', (e) => {
    console.error(`Error: ${e.message}`);
});
