const fs = require('fs');

const path = 'src/components/LiveTickerDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetAnchor = "{/* [PREMIUM-5x2] Quick Intel Gauges";
const startIndex = content.indexOf(targetAnchor);

// The container starts right after the anchor
const divAnchor = "<div className=\"";
const divStartIndex = content.indexOf(divAnchor, startIndex);

// Find the matching closing div
let openCount = 0;
let endIndex = -1;
let index = divStartIndex;

// Very basic HTML tag matching
while (index < content.length) {
    if (content.substr(index, 4) === "<div") {
        openCount++;
    } else if (content.substr(index, 5) === "</div") {
        openCount--;
        if (openCount === 0) {
            endIndex = index + 6; // include "</div>"
            break;
        }
    }
    index++;
}

if (startIndex === -1 || endIndex === -1) {
    console.error("Not found");
    process.exit(1);
}

const originalBlock = content.substring(divStartIndex, endIndex);

// Replace grid classes in originalBlock so it still works for desktop
const desktopBlock = originalBlock.replace(
    /className="([^"]*?)flex flex-col md:grid md:grid-cols-5 snap-x snap-mandatory lg:grid lg:grid-cols-5 xl:grid-cols-5 gap-3 mb-6 relative w-full pt-1 px-5 md:px-0 \-mx-5 md:mx-0 overflow-x-auto md:overflow-visible hide-scrollbars"/g,
    'className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 relative w-full pt-1"'
);

const mobileBlock = originalBlock.replace(
    /className="([^"]*?)flex flex-col md:grid md:grid-cols-5 snap-x snap-mandatory lg:grid lg:grid-cols-5 xl:grid-cols-5 gap-3 mb-6 relative w-full pt-1 px-5 md:px-0 \-mx-5 md:mx-0 overflow-x-auto md:overflow-visible hide-scrollbars"/g,
    'className="hide-scrollbars"' // MobileSnapCarousel handles the flex
).replace(/<div className="([^"]*?)w-\[85vw\] max-w-\[320px\] md:w-auto md:max-w-none md:min-w-0 snap-center shrink-0([^"]*?)"/g, 
    '<div className="relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border w-[85vw] max-w-[320px] shrink-0 $2"'
);

// Actually, I don't need to parse the block rigorously if I just wrap it in a custom component or conditional.
// Let's do string replacement for the grid div class.
const wrapper = `
            {isMobile ? (
                <MobileSnapCarousel title="Quick Intel">
                    ${originalBlock.replace(/className="[^"]*grid-cols-5[^"]*"/, 'className="flex w-full"')}
                </MobileSnapCarousel>
            ) : (
                ${originalBlock}
            )}
`;

// wait, originalBlock has <div className="..."> ... kids ... </div>
// For MobileSnapCarousel, the root `div` inside it should NOT be a CSS flex/grid if MobileSnapCarousel expects kids.
// MobileSnapCarousel renders: <div className="flex ... gap-3">{React.Children.map(children, child => ... )}
// So `children` should be the raw cards, not a wrapped div!

// So we extract the 5 children.
// This is too complex for regex. I will just render:
let newContent = content.substring(0, divStartIndex) + `
            {isMobile ? (
                <div className="w-[100vw] -ml-5 -mr-5 pb-6">
                   <MobileSnapCarousel title="Quick Intel">
                      {/* The cards are already horizontally scrollable in previous hack, let's keep originalBlock inside but strip grid */}
                      ${originalBlock.replace(/className="[^"]*?gap-3[^"]*?"/, 'className="flex w-full"')}
                   </MobileSnapCarousel>
                </div>
            ) : (
                ${originalBlock}
            )}
` + content.substring(endIndex);

fs.writeFileSync(path, newContent, 'utf8');
console.log("Updated Quick Intel Gauges wrapper!");

