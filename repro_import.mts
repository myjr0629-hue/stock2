
import YahooFinance from 'yahoo-finance2';

try {
    console.log("Type of default export:", typeof YahooFinance);
    console.log("Is it an object?", typeof YahooFinance === 'object');
    console.log("Is it a function?", typeof YahooFinance === 'function');

    // User code simulation
    const instance = new YahooFinance();
    console.log("Instance created:", instance);
} catch (e) {
    console.error("Error creating instance:", e);
}
