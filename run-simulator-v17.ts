import { ViewerLockInSimulator } from './src/shorts/evaluation/ViewerLockInSimulator';

ViewerLockInSimulator.runSimulation({
  videoId: 'v17_revenue_grade_rebuild',
  durationSec: 20.0,
  scriptText: 'SPY is one point three percent from a wall most charts do not show. Near walls pressure can build. This is not a prediction. It is a pressure map. Call wall. Gamma flip. Put floor. SignumHQ reveals the structure behind price.',
  hasPublicData: false,
  hasCompressionTest: false
}, './out/review');
