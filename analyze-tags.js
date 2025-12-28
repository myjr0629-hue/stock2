const fs = require('fs');
const content = fs.readFileSync('src/app/tier-01/page.tsx', 'utf8');
const lines = content.split(/\r?\n/);

let stack = [];
const voidTags = ['img', 'br', 'hr', 'input', 'meta', 'link'];

lines.forEach((line, lineIdx) => {
    const regex = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
        const fullTag = match[0];
        const tagName = match[1];
        const isClosing = fullTag.startsWith('</');
        const isSelfClosing = fullTag.endsWith('/>') || voidTags.includes(tagName);

        if (isClosing) {
            if (stack.length === 0) {
                console.log(`Line ${lineIdx + 1}: Unexpected closing tag </${tagName}> (Stack empty)`);
            } else {
                const last = stack[stack.length - 1];
                if (last !== tagName) {
                    // Check if it's likely a void tag mismatch or genuine error
                    console.log(`Line ${lineIdx + 1}: Mismatch! Expected </${last}> but found </${tagName}>`);
                } else {
                    stack.pop();
                }
            }
        } else if (!isSelfClosing) {
            stack.push(tagName);
        }
    }
});

if (stack.length > 0) {
    console.log('Unclosed tags at end:', stack);
}
