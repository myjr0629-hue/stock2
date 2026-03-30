const fs = require('fs');
const sharp = require('sharp');

const svgCode = fs.readFileSync('public/signum-sg-vectorized.svg', 'utf8');
const svgBuffer = Buffer.from(svgCode);

(async () => {
    try {
        console.log("Generating 192x192 icon...");
        await sharp(svgBuffer).resize(192, 192).png().toFile('public/icons/icon-192x192.png');
        
        console.log("Generating 512x512 icon...");
        await sharp(svgBuffer).resize(512, 512).png().toFile('public/icons/icon-512x512.png');
        
        console.log("Generating apple-icon (180x180)...");
        await sharp(svgBuffer).resize(180, 180).png().toFile('public/apple-icon.png');
        
        console.log("Copying icon.svg...");
        fs.copyFileSync('public/signum-sg-vectorized.svg', 'src/app/icon.svg');
        
        console.log("Removing legacy favicon.ico...");
        if (fs.existsSync('src/app/favicon.ico')) {
            fs.unlinkSync('src/app/favicon.ico');
        }
        
        console.log("Successfully generated all icons.");
    } catch (error) {
        console.error("Error generating icons:", error);
    }
})();
