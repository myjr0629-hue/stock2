
const http = require('http');

const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/debug/guardian?force=true',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            if (res.statusCode !== 200) {
                console.error(`Status: ${res.statusCode}`);
                return;
            }
            const json = JSON.parse(data);
            console.log("SUCCESS. Data Keys:", Object.keys(json));
            if (json.rlsi) console.log(`RLSI Score: ${json.rlsi.score}`);
            if (json.marketStatus) console.log(`Market Status: ${json.marketStatus}`);
        } catch (e) {
            console.error("Parse error:", e.message);
            console.log("Raw trunk:", data.substring(0, 100));
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
