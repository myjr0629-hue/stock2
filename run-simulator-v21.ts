import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v21_institutional_footprint_event_driven',
  durationSec: 17.5,
  scriptText: 'SPY looks normal. But off-exchange flow is clustering near the six hundred wall. The gap is only one point three percent. Most charts do not show this layer. Not a prediction. A pressure map. See the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
