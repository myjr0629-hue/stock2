import { fetchMassive } from '../src/services/massiveClient';

async function checkTSLA() {
    const data = await fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers/TSLA');
    console.log(JSON.stringify({
        ticker: data.ticker.ticker,
        todaysChangePerc: data.ticker.todaysChangePerc,
        day: data.ticker.day,
        prevDay: data.ticker.prevDay
    }, null, 2));
}

checkTSLA().catch(console.error);
