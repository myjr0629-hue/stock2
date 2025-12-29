
import { generateReport } from '../src/services/reportScheduler';

async function run() {
    try {
        console.log('Generating Morning Report...');
        const report = await generateReport('morning', true);
        console.log('Report Generated:', report.meta.id);
        console.log('Items:', report.items.length);
        process.exit(0);
    } catch (e) {
        console.error('Failed:', e);
        process.exit(1);
    }
}

run();
