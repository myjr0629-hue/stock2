/** Shared, offline-testable prompt rendering: null is unavailable; measured zero stays zero. */
export function deepMetricXml(s: any): string {
  const signalCore = s.signalCore || {};
  const structure = s.structure || {};
  const sma = s.sma || {};
  const fundamental = s.fundamental || {};
  const analyst = s.analyst || {};
  const institutional = s.institutional || {};
  const volatility = s.volatility || {};
  const squeeze = s.squeeze || {};
  const flow = s.flow || {};
  const conviction = s.conviction || {};
  return `  <signal_core direction="${signalCore.direction ?? 'N/A'}" conviction="${signalCore.conviction ?? 'N/A'}" condition="${signalCore.condition ?? 'N/A'}">
    <conclusion>${signalCore.conclusion || 'N/A'}</conclusion>
    <bull_signals count="${signalCore.bullCount ?? 'N/A'}">${signalCore.bullSignals || 'N/A'}</bull_signals>
    <bear_signals count="${signalCore.bearCount ?? 'N/A'}">${signalCore.bearSignals || 'N/A'}</bear_signals>
  </signal_core>

  <material_sources note="Historical values are dated observations, never current readings. Cite their asOf date whenever used. Missing N/A values are unavailable; never infer a neutral score.">${JSON.stringify(s.sources ?? {})}</material_sources>
  <high_level_gauges>
    <context_score value="${s.contextScore?.value ?? 'N/A'}" grade="${s.contextScore?.grade ?? 'N/A'}"/>
    <smart_flow value="${s.smartFlow?.value ?? 'N/A'}" trend="${s.smartFlow?.trend ?? 'N/A'}"/>
  </high_level_gauges>

  <technicals>
    <sma cross="${sma.cross ?? 'N/A'}" sma50="${sma.sma50 ?? 'N/A'}" sma200="${sma.sma200 ?? 'N/A'}"/>
    <vwap value="${s.vwap || 'N/A'}" distance="${s.vwapDistance || 'N/A'}"/>
    <conviction score="${conviction.score ?? 'N/A'}" grade="${conviction.grade ?? 'N/A'}"/>
    <trend_phase>${sma.trendPhase ?? 'N/A'}</trend_phase>
  </technicals>

  <options_flow>
    <net_gex>${structure.netGex != null ? (structure.netGex / 1e6).toFixed(1) + 'M' : 'N/A'}</net_gex>
    <gamma_flip_level note="THIS_IS_NOT_CALL_WALL">$${structure.gammaFlipLevel ?? 'N/A'} (${!(Number(structure.gammaFlipLevel) > 0) ? 'UNKNOWN' : s.price > structure.gammaFlipLevel ? 'LONG_GAMMA' : 'SHORT_GAMMA'} zone)</gamma_flip_level>
    <squeeze_risk>${structure.squeezeRisk ?? 'N/A'} (${structure.squeezeScore ?? 'N/A'}%)</squeeze_risk>
    <pc_ratio>${structure.pcRatio?.toFixed(2) || 'N/A'}</pc_ratio>
    <call_wall note="HIGHEST_CALL_CONCENTRATION">$${structure.callWall ?? 'N/A'}</call_wall>
    <put_floor note="HIGHEST_PUT_CONCENTRATION">$${structure.putFloor ?? 'N/A'}</put_floor>
    <max_pain>$${structure.maxPain ?? 'N/A'}</max_pain>
    <net_premium>${typeof flow.netPremium === 'number' && Number.isFinite(flow.netPremium) ? `${flow.netPremium > 0 ? '+' : ''}$${(Math.abs(flow.netPremium) / 1e6).toFixed(1)}M (${flow.netPremium > 0 ? 'CALL dominant' : flow.netPremium < 0 ? 'PUT dominant' : 'NEUTRAL'})` : 'N/A'}</net_premium>
    <gamma_concentration>${structure.gammaConcentration ?? 'N/A'}% (${structure.gammaConcentrationLabel ?? 'N/A'})</gamma_concentration>
  </options_flow>

  <fundamentals score="${fundamental.score ?? 'N/A'}" grade="${fundamental.grade ?? 'N/A'}" pe="${fundamental.pe ?? 'N/A'}" fcf_margin="${fundamental.fcfMargin ?? 'N/A'}"/>

  <institutional>
    <analyst_score>${analyst.score ?? 'N/A'}/100 (Buy ${analyst.buyPct ?? 'N/A'}%)</analyst_score>
    <insider note="SEC_FORM_4_LAST_30D">${institutional.insiderNet30d != null
        ? `net ${institutional.insiderNet30d > 0 ? '+' : ''}$${(Math.abs(institutional.insiderNet30d) / 1e6).toFixed(1)}M, buys ${institutional.insiderBuy ?? 'N/A'}, sells ${institutional.insiderSell ?? 'N/A'}`
        : 'N/A'} (${institutional.activity || 'N/A'})</insider>
    <short_squeeze status="${squeeze.status ?? 'N/A'}" si="${squeeze.siPercent ?? 'N/A'}%"/>
  </institutional>

  <volatility regime="${volatility.regime ?? 'N/A'}" score="${volatility.regimeScore ?? 'N/A'}" gex_long="${volatility.gexLong ?? 'N/A'}%"/>

`;
}
