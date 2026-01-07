
import { ForensicService } from '../src/services/forensicService.ts';

async function run() {
    console.log("Debugging Forensic Service for AMD...");
    const result = await ForensicService.analyzeTarget('AMD');
    console.log(JSON.stringify(result, null, 2));
}

run();
