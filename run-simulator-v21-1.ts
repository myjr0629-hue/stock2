import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v21_1_upload_candidate',
  durationSec: 17.5,
  scriptText: 'SPY looks normal. The flow doesn\'t. Four hundred twenty million off exchange near the six hundred wall. The gap is only one point three percent. Most charts don\'t show this layer. Not a prediction. A pressure map. See the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
