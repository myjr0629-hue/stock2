import { normalizeVwap, vwapDistancePct } from './vwap';
import { netPremiumOf } from './premiumFlow';

type ConvictionLabel = '—' | 'convStrong' | 'convBullish' | 'convSlightUp' | 'convNeutral'
    | 'convSlightDown' | 'convBearish' | 'convStrongDown';

/** Command screen and AI use identical observation tests, weights and grades. */
export function commandScores(data: any) {
    const q = data || {};
    const structure = q.unified?.structure || {};
    const volatility = q.unified?.volatility || {};
    const sma = q.unified?.sma || {};
    // Missing inputs do not vote. Keep the existing bases/weights only when
    // at least one usable observation exists (a measured GEX/flow zero counts).
    const finite = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const positive = (value: unknown): number | null => {
      const n = finite(value);
      return n !== null && n > 0 ? n : null;
    };
    const netGex = finite(structure.netGex);
    const fLevel = positive(structure.gammaFlipLevel);
    const priceVal = positive(q.price);
    const fDist = fLevel !== null && priceVal !== null ? ((priceVal - fLevel) / fLevel) * 100 : null;
    // Unified volatility.iv is percent; structure.atmIV is a decimal.
    // IV/flip zero are upstream unavailable sentinels, unlike GEX/flow zero.
    const cachedIv = positive(volatility.iv);
    const iv = positive(structure.atmIV) ?? (cachedIv !== null ? cachedIv / 100 : null);
    const volContributions: number[] = [];
    if (netGex !== null) {
      volContributions.push(netGex < 0
        ? Math.min(30, Math.abs(netGex) / 1000000 * 3)
        : Math.min(10, Math.abs(netGex) / 2000000 * 3));
    }
    if (fDist !== null) {
      const dist = Math.abs(fDist);
      volContributions.push(dist < 1 ? 15 : dist < 3 ? 10 : dist < 5 ? 5 : dist < 10 ? 2 : 0);
    }
    if (iv !== null) {
      volContributions.push(iv > 0.6 ? 25 : iv > 0.4 ? 15 : iv > 0.25 ? 8 : iv > 0.15 ? 4 : 0);
    }
    const rs = volContributions.length > 0
      ? Math.min(100, Math.round(5 + volContributions.reduce((sum, value) => sum + value, 0))) : null;
    const rg = rs === null ? null : rs >= 75 ? 'ERUPTING' : rs >= 50 ? 'LOADED' : rs >= 25 ? 'COILING' : 'CALM';

    const vwapVal = normalizeVwap(data?.vwap);
    const vwapDiff = vwapDistancePct(priceVal, vwapVal);
    const convictionContributions: number[] = [];
    // NONE is a measured neutral cross only when explicitly supplied by SMA.
    if (sma.cross === 'GOLDEN' || sma.cross === 'DEAD' || sma.cross === 'NONE') {
      convictionContributions.push(sma.cross === 'GOLDEN' ? 15 : sma.cross === 'DEAD' ? -15 : 0);
    }
    if (vwapDiff !== null) convictionContributions.push(vwapDiff > 1 ? 8 : vwapDiff < -1 ? -8 : 0);
    const cPcr = finite(structure.pcRatio);
    if (cPcr !== null && cPcr >= 0) convictionContributions.push(cPcr > 0 && cPcr < 0.7 ? 7 : cPcr > 1.2 ? -7 : 0);
    if (netGex !== null) convictionContributions.push(netGex > 0 ? 5 : netGex < 0 ? -5 : 0);
    // 관측 판정은 생산자 규칙 한 벌(netPremiumOf) — 실패·계약 0 건은 투표하지 않고, 관측된 0 은 0 으로 투표한다.
    const netPrem = netPremiumOf(q.rawTickerData?.flow);
    if (netPrem !== null) convictionContributions.push(netPrem > 500000 ? 5 : netPrem < -500000 ? -5 : 0);
    const cScore = convictionContributions.length > 0
      ? Math.max(0, Math.min(100, 50 + convictionContributions.reduce((sum, value) => sum + value, 0))) : null;
    let cLabel: ConvictionLabel = '—'; let cGrade: string | null = null;
    if (cScore !== null) {
      if (cScore >= 80) { cLabel = 'convStrong'; cGrade = 'A'; }
      else if (cScore >= 65) { cLabel = 'convBullish'; cGrade = 'B+'; }
      else if (cScore >= 55) { cLabel = 'convSlightUp'; cGrade = 'B'; }
      else if (cScore >= 45) { cLabel = 'convNeutral'; cGrade = 'C'; }
      else if (cScore >= 35) { cLabel = 'convSlightDown'; cGrade = 'D'; }
      else if (cScore >= 20) { cLabel = 'convBearish'; cGrade = 'D-'; }
      else { cLabel = 'convStrongDown'; cGrade = 'F'; }
    }

    return { netGex, fLevel, fDist, rs, rg, vwapVal, vwapDiff, cScore, cGrade, cLabel };
}
