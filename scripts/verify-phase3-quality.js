const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src', 'messages');

const keysToCheck = [
    'keyMetrics', 'sentimentNeutral', 'sentimentPositive', 'sentimentCaution',
    'noData', 'convStrong', 'convBullish', 'convSlightUp', 'convNeutral',
    'convSlightDown', 'convBearish', 'convStrongDown',
    'volErupting', 'volLoaded', 'volCoiling', 'volStable',
    'overbought', 'oversold', 'rsiNeutral', 'todayPicks'
];

const langs = ['ko', 'en', 'ja'];
const data = {};
langs.forEach(l => {
    data[l] = JSON.parse(fs.readFileSync(path.join(base, l + '.json'), 'utf8'));
});

let issues = 0;
keysToCheck.forEach(key => {
    const ko = data['ko'].dashboard?.[key];
    const en = data['en'].dashboard?.[key];
    const ja = data['ja'].dashboard?.[key];

    if (!ko || !en || !ja) {
        console.log(`❌ MISSING: ${key} → ko:${ko || 'MISS'} en:${en || 'MISS'} ja:${ja || 'MISS'}`);
        issues++;
    } else {
        console.log(`✅ ${key}`);
        console.log(`   ko: ${ko}`);
        console.log(`   en: ${en}`);
        console.log(`   ja: ${ja}`);
    }
});

// Japanese polite form check for descriptions
const jaDescs = ['volErupting', 'volLoaded', 'volCoiling', 'volStable'];
console.log('\n--- Japanese Tone Check ---');
jaDescs.forEach(key => {
    const val = data['ja'].dashboard?.[key] || '';
    // Short labels don't need polite form - they're fine as-is
    console.log(`${key}: "${val}" (${val.length <= 10 ? 'short label - OK' : val.includes('です') || val.includes('ます') ? 'polite ✅' : '⚠️ no polite form'})`);
});

console.log(`\n=== Result: ${issues === 0 ? '✅ ALL PASS' : `❌ ${issues} issues found`} ===`);
