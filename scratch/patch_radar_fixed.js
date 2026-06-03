const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'app', '[locale]', 'quant-radar', 'QuantRadarClient.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF (\n) to make matching robust across environments
content = content.replace(/\r\n/g, '\n');

// 1. Insert sortedTickers memo
const targetState = `    // Dynamic data loading states
    const [isPending, startTransition] = useTransition();
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const activeTickers = useMemo(() => tickers.map(t => t.ticker), [tickers]);
    const { getPrice } = useRealtimeData(activeTickers);`;

const replacementState = `    // Dynamic data loading states
    const [isPending, startTransition] = useTransition();
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const activeTickers = useMemo(() => tickers.map(t => t.ticker), [tickers]);
    const sortedTickers = useMemo(() => {
        if (isAutoPilot) {
            return [...tickers].sort((a, b) => ((b as any).weight || 0) - ((a as any).weight || 0));
        }
        return tickers;
    }, [tickers, isAutoPilot]);
    const { getPrice } = useRealtimeData(activeTickers);`;

if (!content.includes(targetState)) {
    console.error("targetState not found!");
    process.exit(1);
}
content = content.replace(targetState, replacementState);

// 2. Update copyEntireAllocationMatrixToClipboard
const targetCopy = `        const tickersText = tickers.map((item, i) => {`;
const replacementCopy = `        const tickersText = sortedTickers.map((item, i) => {`;

if (!content.includes(targetCopy)) {
    console.error("targetCopy not found!");
    process.exit(1);
}
content = content.replace(targetCopy, replacementCopy);

// 3. Update executionSequence
const targetExec = `    // Mechanical execution sequence (priority score descending)
    const executionSequence = useMemo(() => {
        return tickers
            .map(item => {
                const targetShares = (item as any).targetShares || 0;
                const heldObj = holdings.find(h => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                const heldQty = heldObj ? heldObj.quantity : 0;
                const diffQty = targetShares - heldQty;
                const exec = (item as any).execution || {};
                const score = item.alphaSnapshot?.score || 50;
                const wsPriceObj = getPrice(item.ticker);
                const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                return {
                    ticker: item.ticker,
                    diffQty,
                    entry: exec.entry || livePrice || 0,
                    stopLoss: exec.stopLoss || 0,
                    takeProfit: exec.takeProfit || 0,
                    score
                };
            })
            .filter(item => item.diffQty > 0)
            .sort((a, b) => b.score - a.score);
    }, [tickers, holdings, getPrice]);`;

const replacementExec = `    // Mechanical execution sequence (priority score descending)
    const executionSequence = useMemo(() => {
        return sortedTickers
            .map(item => {
                const targetShares = (item as any).targetShares || 0;
                const heldObj = holdings.find(h => h.ticker.toUpperCase() === item.ticker.toUpperCase());
                const heldQty = heldObj ? heldObj.quantity : 0;
                const diffQty = targetShares - heldQty;
                const exec = (item as any).execution || {};
                const score = item.alphaSnapshot?.score || 50;
                const wsPriceObj = getPrice(item.ticker);
                const livePrice = wsPriceObj ? wsPriceObj.price : (item.realtime?.price || 0);
                return {
                    ticker: item.ticker,
                    diffQty,
                    entry: exec.entry || livePrice || 0,
                    stopLoss: exec.stopLoss || 0,
                    takeProfit: exec.takeProfit || 0,
                    score
                };
            })
            .filter(item => item.diffQty > 0)
            .sort((a, b) => b.score - a.score);
    }, [sortedTickers, holdings, getPrice]);`;

if (!content.includes(targetExec)) {
    console.error("targetExec not found!");
    process.exit(1);
}
content = content.replace(targetExec, replacementExec);

// 4. Locate the grid container using unique landmarks
const targetGridStart = `                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">`;
const landmarkEnd = `                    ) : tickers.length === 0 ? (`;

const startIndex = content.indexOf(targetGridStart);
const endIndex = content.indexOf(landmarkEnd);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find layout landmarks in clean file!");
    process.exit(1);
}

// Find the last closing tag of the grid container (which is just before the closing tag of the isAutoPilot flex-col)
const originalGridContent = content.substring(startIndex, endIndex);

// Find the last index of `</div>` in originalGridContent
const lastDivIndex = originalGridContent.lastIndexOf('</div>');
if (lastDivIndex === -1) {
    console.error("Could not locate div bounds!");
    process.exit(1);
}

// Extract up to and including the matching closing </div> of the grid
const gridContainerBlock = originalGridContent.substring(0, lastDivIndex + 6);

// Read the new grid layout and append the third closing </div> to balance the tags
const newGridContent = fs.readFileSync(path.join(__dirname, 'new_grid.txt'), 'utf8').trim() + '\n                            </div>';

// Replace the original grid container block with the new layout
content = content.replace(gridContainerBlock, newGridContent);

// Restore CRLF line endings to match Windows git configuration
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched QuantRadarClient.tsx with absolute precision and proper CRLF handling!");
