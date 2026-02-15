const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'src', 'messages');

const newKeys = {
    landing: {
        searchPlaceholder: { ko: '분석할 Ticker...', en: 'Search Ticker...', ja: 'Ticker 検索...' },
    },
    // WeeklyBriefing trump schedule locale-aware event names
    // These are mock data, so we handle with locale-based field selection
};

['ko', 'en', 'ja'].forEach(lang => {
    const file = path.join(basePath, `${lang}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Add to landing section
    if (!data.landing) data.landing = {};
    data.landing.searchPlaceholder = newKeys.landing.searchPlaceholder[lang];

    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8');
    console.log(`${lang}: landing.searchPlaceholder added`);
});

console.log('Done!');
