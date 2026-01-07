
const http = require('http');

http.get('http://localhost:3000/api/live/options/trades?t=TSLA', (res) => {
    const { statusCode } = res;
    let rawData = '';

    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        console.log('Status:', statusCode);
        try {
            const json = JSON.parse(rawData);
            if (json.debug) {
                console.log('Total Snapshot Items:', json.debug.totalSnapshotItems);
                console.log('Sample Item:', json.debug.sampleItem ? 'Yes' : 'No');
            } else {
                console.log('No debug info');
            }
            if (json.error) {
                console.log('Error:', json.error);
            }
        } catch (e) {
            console.log('Body:', rawData);
        }
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});
