const fs = require('fs');

const path = 'src/components/LiveTickerDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const anchorStartBase = "{/* 1. TOP HEADER (Mobile / Desktop Split) */}";
const startIndex = content.indexOf(anchorStartBase);
if (startIndex === -1) {
    console.error("Start not found");
    process.exit(1);
}

const anchorTopDiv = "            <div className=\"sticky top-[58px]";
const topDivIndex = content.indexOf(anchorTopDiv, startIndex);

const anchorMobileStart = "                {/* === MOBILE HEADER (Fully Native App Experience) === */}";
const mobileStartIndex = content.indexOf(anchorMobileStart, topDivIndex);

const anchorEndDiv = "            {/* [PREMIUM-5x2] Quick Intel Gauges";
let endIndex = content.indexOf(anchorEndDiv, mobileStartIndex);

if (topDivIndex === -1 || mobileStartIndex === -1 || endIndex === -1) {
    console.error("Anchors not found");
    process.exit(1);
}

const blockBeforeEnd = content.substring(startIndex, endIndex);
const lastDivIndex = blockBeforeEnd.lastIndexOf("</div>");
const trueEndIndex = startIndex + lastDivIndex + 6;

const desktopBlock = content.substring(topDivIndex, mobileStartIndex)
    .replace('className="hidden md:flex items-stretch gap-3"', 'className="flex items-stretch gap-3"')
    .replace('sticky top-[58px] md:top-[78px] z-30 bg-[#0a0f1a]/90 md:bg-white/5 backdrop-blur-xl rounded-b-xl md:rounded-xl py-2 px-3 md:py-1 border-b border-white/10 md:border md:shadow-[0_8px_32px_rgba(0,0,0,0.3)]', 
             'sticky top-[78px] z-30 bg-white/5 backdrop-blur-xl rounded-xl py-1 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]');

const replacement = `            {/* 1. TOP HEADER */}
            {isMobile ? (
                <MobileCommandHeader 
                    ticker={ticker}
                    name={initialStockData.name}
                    displayPrice={displayPrice}
                    displayChange={displayChangePct}
                    sector={companyOverview?.sector}
                    ssrExtPrice={activeExtPrice}
                    ssrExtChangePct={activeExtPct}
                    ssrExtLabel={activeExtLabel}
                />
            ) : (
` + desktopBlock + `
            </div>
            )}
`;

content = content.substring(0, topDivIndex) + replacement + content.substring(trueEndIndex);
fs.writeFileSync(path, content, 'utf8');
console.log("Replaced header logic successfully!");
