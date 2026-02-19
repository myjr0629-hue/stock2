import { getOptionsData } from '../src/services/stockApi';
import { computeIVSkew } from '../src/services/alphaEngine';

async function test(ticker: string) {
    const opts = await getOptionsData(ticker) as any;
    const all: any[] = opts?.rawContracts || [];
    const spot = opts?.currentPrice || 0;
    if (!all.length) return { ticker, error: 'no data' };

    const now = new Date();
    const exps = [...new Set(all.map((c: any) => c.expiry))].sort() as string[];

    let weeklyExp = exps.find(e => {
        const d = Math.ceil((new Date(e).getTime() - now.getTime()) / 86400000);
        return d >= 2 && d <= 7;
    }) || exps.find(e => Math.ceil((new Date(e).getTime() - now.getTime()) / 86400000) >= 2) || exps[0];

    const weekly = all.filter((c: any) => c.expiry === weeklyExp);

    function calc(cs: any[]) {
        let gex = 0, cOI = 0, pOI = 0, cw = 0, pf = 0, mcOI = 0, mpOI = 0;
        for (const c of cs) {
            const oi = c.open_interest || 0, g = c.greeks?.gamma || 0, s = c.strike_price || 0;
            if (c.contract_type === 'call') { cOI += oi; gex += oi * g * spot * spot * 0.01; if (oi > mcOI) { mcOI = oi; cw = s } }
            else { pOI += oi; gex -= oi * g * spot * spot * 0.01; if (oi > mpOI) { mpOI = oi; pf = s } }
        }
        return { gex: Math.round(gex), cw, pf, pcr: cOI > 0 ? +(pOI / cOI).toFixed(2) : 1, cOI, pOI, n: cs.length };
    }
    const a = calc(all), w = calc(weekly);

    function gs(g: number) { return g > 500000 ? 2 : g > 0 ? 1 : g < -50000 ? 2 : g < -10000 ? 1 : 0 }

    const chainAll = all.map(c => ({ details: { strike_price: c.strike_price, contract_type: c.contract_type }, implied_volatility: c.implied_volatility }));
    const chainW = weekly.map(c => ({ details: { strike_price: c.strike_price, contract_type: c.contract_type }, implied_volatility: c.implied_volatility }));

    return {
        ticker, spot, weeklyExp, totalExps: exps.length,
        ALL: { ...a, gexScore: gs(a.gex), ivSkew: computeIVSkew(chainAll, spot) },
        WEEKLY: { ...w, gexScore: gs(w.gex), ivSkew: computeIVSkew(chainW, spot) },
        gexScoreChanged: gs(a.gex) !== gs(w.gex)
    };
}

async function main() {
    const results = [];
    for (const t of ['NVDA', 'AAPL', 'TSLA', 'PONY']) {
        try { results.push(await test(t)); } catch (e: any) { results.push({ ticker: t, error: e.message }); }
    }
    console.log(JSON.stringify(results, null, 2));
}
main();
