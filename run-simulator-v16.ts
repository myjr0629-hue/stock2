import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v16_upload_candidate',
  durationSec: 20.5,
  scriptText: 'SPY is one point three percent below a hidden call wall. Most charts miss this layer. Pressure can build here. Not a prediction. A pressure map. SignumHQ shows the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
