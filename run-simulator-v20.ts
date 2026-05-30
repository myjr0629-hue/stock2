import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v20_institutional_footprint',
  durationSec: 18.5,
  scriptText: 'SPY is one point three percent from a hidden wall. Dark pool flow is clustering nearby. Most charts do not show this. Pressure may build near that level. Not a prediction. A pressure map. See the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
