const http = require('http');
http.get('http://localhost:3001/api/flow/realtime-metrics?ticker=NVDA', res => {
    let d = ''; res.on('data', c=>d+=c);
    res.on('end', () => console.log('Live Flow API metrics:', JSON.stringify(JSON.parse(d), null, 2)));
}).on('error', e=>console.error(e));
