const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'app', '[locale]', 'quant-radar', 'QuantRadarClient.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// 1. Fix copyBracketToClipboard
const targetCopyBracket = `    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot.score;
        const grade = item.alphaSnapshot.grade;`;

const replacementCopyBracket = `    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot?.score || 50;
        const grade = item.alphaSnapshot?.grade || 'B';`;

if (content.includes(targetCopyBracket)) {
    content = content.replace(targetCopyBracket, replacementCopyBracket);
} else {
    console.log("targetCopyBracket not found, trying inline replacement...");
    content = content.replace(`const score = item.alphaSnapshot.score;`, `const score = item.alphaSnapshot?.score || 50;`);
    content = content.replace(`const grade = item.alphaSnapshot.grade;`, `const grade = item.alphaSnapshot?.grade || 'B';`);
}

// 2. Fix trimsList
const targetTrimsList = `                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot.score, item };`;
const replacementTrimsList = `                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, item };`;

if (content.includes(targetTrimsList)) {
    content = content.replace(targetTrimsList, replacementTrimsList);
} else {
    console.error("targetTrimsList not found!");
}

// 3. Fix buysList
const targetBuysList = `                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot.score, item };`;
const replacementBuysList = `                                             return { ticker: item.ticker, diffQty, heldQty, targetShares, livePrice, score: item.alphaSnapshot?.score || 50, item };`;

if (content.includes(targetBuysList)) {
    content = content.replace(targetBuysList, replacementBuysList);
} else {
    console.error("targetBuysList not found!");
}

// 4. Fix Rotation Swaps
const targetRotation1 = `lowestScoreHolding && highestScoreScanned && (highestScoreScanned.alphaSnapshot.score > (lowestScoreHolding.alphaScore || 0))`;
const replacementRotation1 = `lowestScoreHolding && highestScoreScanned && (highestScoreScanned.alphaSnapshot?.score > (lowestScoreHolding.alphaScore || 0))`;

if (content.includes(targetRotation1)) {
    content = content.replace(targetRotation1, replacementRotation1);
} else {
    console.log("targetRotation1 not found, trying direct replace...");
    content = content.replace(`highestScoreScanned.alphaSnapshot.score >`, `highestScoreScanned.alphaSnapshot?.score >`);
}

const targetRotation2 = `Score {highestScoreScanned.alphaSnapshot.score}`;
const replacementRotation2 = `Score {highestScoreScanned.alphaSnapshot?.score}`;

if (content.includes(targetRotation2)) {
    content = content.replace(targetRotation2, replacementRotation2);
} else {
    console.log("targetRotation2 not found, trying direct replace...");
    content = content.replace(`highestScoreScanned.alphaSnapshot.score}`, `highestScoreScanned.alphaSnapshot?.score}`);
}

// Restore CRLF line endings
content = content.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully completed optional chaining safety additions in QuantRadarClient.tsx!");
