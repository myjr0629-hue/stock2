const http = require('http');
http.get('http://localhost:3001/api/command/unified?t=NVDA', res => {
    let d = '';
    res.on('data', c => d+=c);
    res.on('end', () => {
        try {
            const j = JSON.parse(d);
            console.log("Analyst:", JSON.stringify(j.analystCard, null, 2));
            console.log("Inst:", JSON.stringify(j.institutional, null, 2));
        } catch(e) { console.log(d.slice(0, 500)); }
    });
});
