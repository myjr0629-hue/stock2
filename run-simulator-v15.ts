import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v15_creative_rebuild',
  durationSec: 20.5,
  scriptText: 'SPY looks normal. But the wall is only one point three percent away. Most charts miss this layer. Pressure can build here. Not a prediction. A pressure map. SignumHQ shows the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
