require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
let code = fs.readFileSync('scripts/lambda-flow-harvest/index.js', 'utf8');
code += "\n\n(async () => {\n  console.log('Running TSLA harvest...');\n  const res = await harvestTicker('TSLA');\n  console.log('Result:', res);\n  process.exit(0);\n})();\n";
fs.writeFileSync('scripts/tmp_lambda_run.js', code);
require('../scripts/tmp_lambda_run.js');
