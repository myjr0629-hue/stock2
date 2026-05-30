import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v18_upload_candidate',
  durationSec: 20.0,
  scriptText: 'SPY is one point three percent from a wall most charts don\'t show. That wall is not a prediction. It is a pressure zone. Normal charts show price. SignumHQ shows the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
