// Write report to text file
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('c:/Users/seamo/backup/stock2/snapshots/reports/2026-02-10/draft.json', 'utf8'));
const out = [];

out.push('=== SIGNUM Alpha Report V3.4.1 (PM Validation Rebuild) ===');
out.push(`Date: 2026-02-10 | Generated: ${r.meta.generatedAtET}`);
out.push(`Version: ${r.meta.version} | Engine: 3.4.0`);
out.push(`Type: ${r.meta.type} | Items: ${r.items?.length}`);
out.push('');

const mc = r.macro;
out.push('=== MACRO ===');
out.push(`VIX: ${mc.vix} | NQ%: ${mc.nqChangePercent?.toFixed(2)}% | US10Y: ${mc.us10y} | DXY: ${mc.dxy}`);
out.push(`Market Status: ${JSON.stringify(mc.marketStatus).substring(0, 60)}`);
out.push('');

// Top 3
if (r.meta.top3?.length) {
    out.push('=== TOP 3 ===');
    r.meta.top3.forEach((t, i) => out.push(`  #${i + 1} ${t.ticker} Score:${t.alphaScore} ${t.velocity || ''} ${t.whySummaryKR || ''}`));
    out.push('');
}

// Items
out.push('=== ALPHA GRID ===');
out.push('Rank | Ticker | Price      | Chg%      | PScore | Tier       | Grade | PCR  | CW      | PF      | Reason');
out.push('-----|--------|------------|-----------|--------|------------|-------|------|---------|---------|-------');

const items = (r.items || []).sort((a, b) => (a.rank || 99) - (b.rank || 99));
items.forEach((it) => {
    const p = it.evidence?.price || {};
    const o = it.evidence?.options || {};
    const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '?';
    const grade = it.alphaGrade || it.grade || '?';
    out.push(
        `  ${String(it.rank || '?').padStart(2)} | ${(it.ticker || '').padEnd(6)} | $${String((p.last || 0).toFixed(2)).padStart(9)} | ${chg.padStart(9)} | ${String(it.powerScore || '?').padStart(6)} | ${(it.qualityTier || '?').padEnd(10)} | ${grade.padEnd(5)} | ${(o.pcr != null ? o.pcr.toFixed(2) : '-').padStart(4)} | $${String(o.callWall || '-').padStart(6)} | $${String(o.putFloor || '-').padStart(6)} | ${(it.qualityReasonKR || '').substring(0, 70)}`
    );
});
out.push('');

// M7
const m7 = r.sectors?.m7 || [];
if (m7.length) {
    out.push('=== M7 SECTOR ===');
    m7.forEach(it => {
        const p = it.evidence?.price || {};
        const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '?';
        out.push(`  ${(it.ticker || '').padEnd(6)} $${(p.last || 0).toFixed(2).padStart(9)} ${chg.padStart(9)} Score:${String(it.powerScore || '?').padStart(3)} ${it.qualityTier || ''} ${it.alphaGrade || ''}`);
    });
    out.push('');
}

// Physical AI
const pai = r.sectors?.physicalAi || [];
if (pai.length) {
    out.push('=== PHYSICAL AI SECTOR ===');
    pai.forEach(it => {
        const p = it.evidence?.price || {};
        const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '?';
        out.push(`  ${(it.ticker || '').padEnd(6)} $${(p.last || 0).toFixed(2).padStart(9)} ${chg.padStart(9)} Score:${String(it.powerScore || '?').padStart(3)} ${it.qualityTier || ''} ${it.alphaGrade || ''}`);
    });
    out.push('');
}

// Sentiment
const likes = r.marketSentiment?.likes || r.likes || [];
const dislikes = r.marketSentiment?.dislikes || r.dislikes || [];
out.push('=== MARKET SENTIMENT ===');
likes.forEach(l => out.push(`  + ${typeof l === 'string' ? l : l.text || JSON.stringify(l)}`));
dislikes.forEach(d => out.push(`  - ${typeof d === 'string' ? d : d.text || JSON.stringify(d)}`));

const outputPath = 'c:/Users/seamo/backup/stock2/snapshots/reports/2026-02-10/report_v2.txt';
fs.writeFileSync(outputPath, out.join('\n'), 'utf8');
console.log('Written to ' + outputPath);
console.log(out.length + ' lines');
