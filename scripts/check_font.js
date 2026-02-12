const http = require('http');
const fs = require('fs');

function fetch(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const newUrl = res.headers.location.startsWith('http') ? res.headers.location : 'http://localhost:3000' + res.headers.location;
                return fetch(newUrl).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function main() {
    const css = await fetch('http://localhost:3000/_next/static/css/app/layout.css?v=1770877131845');

    // Save the full CSS for analysis
    fs.writeFileSync('scripts/layout_css_dump.txt', css);
    console.log('CSS saved to scripts/layout_css_dump.txt (' + css.length + ' chars)');

    // Extract just the relevant sections
    const sections = [];

    // 1. Find :root or html blocks with --font-sans
    const rootBlocks = css.match(/(?::root|html)[^{]*\{[^}]*--font-sans[^}]*/g);
    if (rootBlocks) {
        sections.push('=== :root/html blocks with --font-sans ===');
        rootBlocks.forEach(b => sections.push(b.substring(0, 300)));
    }

    // 2. Find __variable class
    const varBlocks = css.match(/\.__variable_[a-f0-9]+[^}]*/g);
    if (varBlocks) {
        sections.push('\n=== __variable class blocks ===');
        varBlocks.forEach(b => sections.push(b.substring(0, 300)));
    }

    // 3. Find .font-sans usage
    const fontSans = css.match(/\.font-sans[^}]*/g);
    if (fontSans) {
        sections.push('\n=== .font-sans class ===');
        fontSans.forEach(b => sections.push(b.substring(0, 200)));
    }

    console.log(sections.join('\n'));
}

main().catch(console.error);
