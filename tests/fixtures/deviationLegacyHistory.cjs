// 운영 행을 복사하지 않은 합성 자료. 9/22~10/23, 종목당 3,000행 중 오늘 5행만 새 표식.
const tickers = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'AMD', 'MU',
    'NFLX', 'PLTR', 'COIN', 'SMCI', 'INTC', 'JPM', 'UNH', 'XOM', 'LLY', 'COST',
    'BA', 'CAT', 'QQQ', 'SPY', 'IWM',
];
const dates = [];
for (let ms = Date.parse('2026-09-22'); ms <= Date.parse('2026-10-22'); ms += 86400000) {
    if (![0, 6].includes(new Date(ms).getUTCDay())) dates.push(new Date(ms).toISOString().slice(0, 10));
}
const pcrToday = { AAPL: .2, AVGO: 3, MU: .4, AMD: 1.8, MSFT: 1.5 };
function fixture({ legacyToday = false } = {}) {
    return Object.fromEntries(tickers.map((ticker, index) => {
        const dollars = ticker === 'LLY' ? 10 : ticker === 'INTC' ? 8 : index < 19 ? 2 + index / 20 : 1;
        const rows = Array.from({ length: 2995 }, (_, i) => {
            const day = i % dates.length, sample = Math.floor(i / dates.length);
            const noise = [.85, .9, .95, 1, 1.05, 1.1, 1.15][day % 7];
            return {
                ticker, timestamp: Date.parse(`${dates[day]}T08:00:00Z`) + sample * 7 * 60000,
                totalCallOI: 50000 * noise, totalPutOI: 50000 * noise, pcr: noise,
                totalPremium: 1000000 * noise,
                callPremium: 1000000 * noise * dollars / (1 + dollars),
                putPremium: 1000000 * noise / (1 + dollars),
            };
        });
        for (let i = 0; i < 5; i++) {
            const totalPremium = ticker === 'AVGO' ? 2000000 : 1000000;
            rows.push({ ticker, timestamp: Date.parse('2026-10-23T20:00:00Z') + i * 60000,
                totalCallOI: 50000, totalPutOI: 50000, pcr: pcrToday[ticker] || 1, totalPremium,
                callPremium: totalPremium * dollars / (1 + dollars), putPremium: totalPremium / (1 + dollars),
                ...(legacyToday ? {} : { chainDate: '2026-10-23', optionBasis: 'eod', premiumBasis: 'volume-close', partial: false }),
            });
        }
        return [ticker, rows.sort((a, b) => a.timestamp - b.timestamp)];
    }));
}
module.exports = { fixture };
