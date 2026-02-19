const http = require('http');
const fs = require('fs');
http.get('http://localhost:3000/api/reports/latest?type=morning', r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
        const j = JSON.parse(d);
        let out = 'V5 TRADE PLAN REPORT\n';
        out += 'Generated: ' + j.meta?.generatedAt + '\n\n';
        const items = j.items.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
        items.forEach((i, x) => {
            const p = i.evidence?.price || {};
            const tp = i.alphaV3?.tradePlan;
            const g = i.alphaV3?.gatesApplied || [];
            out += (x + 1) + '. ' + i.ticker + ' | Score: ' + i.powerScore + ' | Gates: ' + g.join(', ') + '\n';
            out += '   RegClose: $' + (p.last || 0).toFixed(2) + ' (' + (p.changePct || 0).toFixed(2) + '%)';
            out += ' | PM: $' + (p.pmPrice || 0).toFixed(2) + ' (' + (p.pmChangePct !== undefined ? p.pmChangePct.toFixed(2) + '%' : 'N/A') + ')\n';
            if (tp) {
                out += '   --- TRADE PLAN ---\n';
                out += '   Entry: $' + tp.entry + ' (zone: $' + tp.entryZone[0] + ' ~ $' + tp.entryZone[1] + ')\n';
                out += '   Strategy: ' + tp.entryStrategy + '\n';
                out += '   Target1: $' + tp.target1 + ' | Target2: $' + tp.target2 + '\n';
                out += '   TargetBasis: ' + tp.targetBasis + '\n';
                out += '   StopLoss: $' + tp.stopLoss + ' (' + tp.stopBasis + ')\n';
                out += '   R/R: ' + tp.riskReward + ' | ATR: $' + tp.atr + '\n';
                out += '   Note: ' + tp.positionNote + '\n';
            } else {
                out += '   --- NO TRADE PLAN (score < 60) ---\n';
            }
            out += '\n';
        });
        fs.writeFileSync('c:/Users/seamo/backup/stock2/v5_tradeplan.txt', out);
        console.log('Written to v5_tradeplan.txt');
    });
});
