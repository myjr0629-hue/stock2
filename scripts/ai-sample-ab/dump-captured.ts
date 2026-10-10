import fs from 'node:fs';
import { bootHarness } from './core';
import { loadCaptured } from './captured';
const [envFile, purpose, outFile] = process.argv.slice(2);
bootHarness({ envFile });
(async () => {
    const items = await loadCaptured(purpose);
    fs.writeFileSync(outFile, JSON.stringify(items.map(({ legacy, validate, ...rest }: any) => rest)));
    console.error(purpose, items.length, 'items →', outFile);
    process.exit(0);
})();
