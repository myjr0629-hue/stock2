const fs = require('fs');

const path = 'src/components/LiveTickerDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the gauges container
content = content.replace(
    /className="relative flex overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-3 lg:grid-cols-5 gap-1\.5 pb-2 md:pb-0 scrollbar-hide"/g,
    'className={isMobile ? "flex overflow-x-auto snap-x snap-mandatory gap-3 pb-4 -mx-5 px-5 scrollbar-hide" : "grid grid-cols-3 lg:grid-cols-5 gap-3"}'
);

// Replace children class name hacks that were added previously
content = content.replace(
    /className="w-\[85vw\] max-w-\[320px\] md:w-auto md:max-w-none md:min-w-0 snap-center shrink-0"/g,
    'className={isMobile ? "w-[85vw] max-w-[320px] snap-center shrink-0" : ""}'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Refactored Gauges wrapper class names to use isMobile instead of CSS breakpoints.");
