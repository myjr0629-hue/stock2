const fs = require('fs');
const langs = ['en', 'ko', 'ja'];
langs.forEach(lang => {
    const f = 'src/messages/' + lang + '.json';
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/Alpha Score/g, 'Analytics Score');
    c = c.replace(/Alpha Leaders/g, 'Top Leaders');
    c = c.replace(/Whale Index/g, 'Institutional Index');
    c = c.replace(/Signal Badge/g, 'Status Indicator');
    c = c.replace(/Alpha Seek/g, 'Trend Seek');
    fs.writeFileSync(f, c, 'utf8');
    console.log(lang + ' done');
});
