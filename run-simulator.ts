import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v14_1',
  durationSec: 20.5,
  scriptText: 'SPY is one point three percent below a hidden call wall. Most charts miss this layer. This is where pressure can build. Not a prediction. A pressure map. SignumHQ shows the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review', 'v2');
