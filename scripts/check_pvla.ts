import { fetchMassive } from '../src/services/massiveClient';

async function checkPVLA() {
    const data = await fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers/PVLA');
    console.log(JSON.stringify(data.ticker, null, 2));
}

checkPVLA().catch(console.error);
