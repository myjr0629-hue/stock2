
import { getTreasuryYields } from '../src/services/fedApiClient';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
    console.log("Checking Treasury Yields (Massive API)...");
    const data = await getTreasuryYields();
    console.log("Result:", JSON.stringify(data, null, 2));
}

check();
