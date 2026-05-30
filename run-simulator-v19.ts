import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v19_true_upload_candidate',
  durationSec: 19.0,
  scriptText: 'SPY is one point three percent from a wall most charts miss. A wall you can\'t see. Pressure can build here. Not a prediction. A pressure map. Normal chart price only. SignumHQ structure layer. Wall. Floor. Flip. See the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
