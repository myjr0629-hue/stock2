const fs = require('fs');
const file = 'src/messages/en.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

if (!data.portfolioGuide) {
    data.portfolioGuide = {
        subtitle: "Detailed guide for each portfolio indicator and screen component.",
        cards: {
            alphaScore: {
                meaning: "A comprehensive final score analyzing profitability and risk by AI",
                desc: {
                    a: "90-100: Top tier, aggressive hold",
                    b: "80-89: Excellent, maintain hold",
                    c: "70-79: Average, monitor trend",
                    d: "60-69: Caution, consider trimming",
                    f: "0-59: High risk, consider selling"
                }
            },
            signalBadge: {
                badge: "AI Verdict",
                meaning: "Current trading opinion",
                add: "Strong buy / Add weight",
                hold: "Maintain current weight",
                watch: "Watch and wait",
                trim: "Trim weight / Take profits"
            },
            confidence: {
                badge: "AI Confidence",
                meaning: "Data reliability for the AI signal",
                high: "High data alignment, reliable signal",
                mid: "Mixed signals, approach partially",
                low: "No stable signal, conservative approach"
            },
            sparkline: {
                badge: "5D Flow",
                meaning: "Short-term momentum flow over the last 5 days",
                descIntro: "Identify short-term trends intuitively through line colors.",
                uptrend: "Green line: Short-term uptrend",
                downtrend: "Red line: Short-term downtrend",
                sideways: "Gray line: No clear direction (range-bound)"
            }
        }
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
    console.log('portfolioGuide added successfully to EN');
} else {
    console.log('portfolioGuide already exists in EN');
}
