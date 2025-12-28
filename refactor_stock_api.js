
const fs = require('fs');
const path = require('path');

const targetPath = path.join(process.cwd(), 'src/services/stockApi.ts');
let content = fs.readFileSync(targetPath, 'utf-8');
const lines = content.split('\n');

// Helper to remove lines by range (1-based, inclusive)
function removeLines(start, end) {
    for (let i = start - 1; i < end; i++) {
        lines[i] = null; // Mark for deletion
    }
}

// 1. Remove duplicate exports (Lines 11-14 in 1604 view)
// Check content
if (lines[10].trim().startsWith('export type { StockData') && lines[13].trim() === '// --- CONFIGURATION ---') {
    console.log('Removing duplicate exports (11-14)...');
    removeLines(11, 14);
}

// 2. Remove StatusUpdate garbage (Lines 19-36)
if (lines[18].trim().startsWith('progress ?: {') && lines[35].trim() === '};') {
    console.log('Removing StatusUpdate garbage (19-36)...');
    removeLines(19, 36);
}

// 3. Remove middle garbage (Lines 38-97)
// Check start and end
if (lines[37].startsWith('let statusCallback') && lines[96].trim() === '}') {
    console.log('Removing middle garbage (38-97)...');
    removeLines(38, 97);
}

// 4. Remove fetchMassive (Find line with HELPER signature)
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i] && lines[i].includes('// --- HELPER: Massive API Core')) {
        startIdx = i;
    }
    if (startIdx !== -1 && lines[i] && lines[i].trim() === 'return null;' && lines[i + 1] && lines[i + 1].trim() === '}') {
        endIdx = i + 1;
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    console.log(`Removing fetchMassive (${startIdx + 1}-${endIdx + 1})...`);
    removeLines(startIdx + 1, endIdx + 1);
} else {
    console.warn('Could not find fetchMassive definition.');
}

// Reassemble
const newContent = lines.filter(l => l !== null).join('\n');
fs.writeFileSync(targetPath, newContent, 'utf-8');
console.log('Done.');
