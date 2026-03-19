/**
 * SIGNUM HQ — Lambda Engine Bundler
 * 
 * Uses esbuild to transpile alphaEngine.ts + alphaEngineV2.ts
 * into a single CJS bundle for Lambda consumption.
 * 
 * Output: scripts/lambda-harvest/alphaEngine.js
 * 
 * Usage: node scripts/build-lambda-engine.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SRC_ENTRY = path.join(__dirname, '..', 'src', 'services', 'alphaEngine.ts');
const OUT_FILE = path.join(__dirname, 'lambda-harvest', 'alphaEngine.js');

async function main() {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  SIGNUM Lambda Engine Bundler (esbuild)       ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    // Verify source exists
    if (!fs.existsSync(SRC_ENTRY)) {
        console.error('ERROR: alphaEngine.ts not found at:', SRC_ENTRY);
        process.exit(1);
    }

    // Check esbuild availability
    try {
        execSync('npx esbuild --version', { stdio: 'pipe' });
    } catch {
        console.log('Installing esbuild...');
        execSync('npm install -D esbuild', { stdio: 'inherit' });
    }

    // Bundle with esbuild
    // - platform=node: Node.js compatible output
    // - target=node18: Lambda runtime
    // - format=cjs: CommonJS for require()
    // - bundle: includes all imports (alphaEngineV2.ts)
    // - external: skip Next.js-specific path aliases that aren't needed
    console.log('Bundling alphaEngine.ts → alphaEngine.js...\n');
    
    const cmd = [
        'npx esbuild',
        `"${SRC_ENTRY}"`,
        `--outfile="${OUT_FILE}"`,
        '--bundle',
        '--platform=node',
        '--target=node18',
        '--format=cjs',
        '--minify-whitespace',
        // Alias resolution: @/services/* → src/services/*
        `--alias:@/services/*=${path.join(__dirname, '..', 'src', 'services', '*')}`,
    ].join(' ');

    try {
        execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch {
        // If alias doesn't work, try with tsconfig paths plugin approach
        // Create a temporary entry that re-exports with resolved paths
        console.log('\nRetrying with path resolution workaround...');
        
        // Read the source and resolve the import
        const alphaSource = fs.readFileSync(SRC_ENTRY, 'utf-8');
        const v2Source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'alphaEngineV2.ts'), 'utf-8');
        
        // Create temp files with resolved imports
        const tempDir = path.join(__dirname, '_temp_bundle');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        
        // Write alphaEngineV2 with no external imports
        fs.writeFileSync(path.join(tempDir, 'alphaEngineV2.ts'), v2Source);
        
        // Write alphaEngine with resolved import path
        const resolvedSource = alphaSource.replace(
            /from\s+['"]\.\/alphaEngineV2['"]/g,
            "from './alphaEngineV2'"
        ).replace(
            /from\s+['"]@\/services\/alphaEngineV2['"]/g,
            "from './alphaEngineV2'"
        );
        fs.writeFileSync(path.join(tempDir, 'alphaEngine.ts'), resolvedSource);
        
        const cmd2 = [
            'npx esbuild',
            `"${path.join(tempDir, 'alphaEngine.ts')}"`,
            `--outfile="${OUT_FILE}"`,
            '--bundle',
            '--platform=node',
            '--target=node18',
            '--format=cjs',
            '--minify-whitespace',
        ].join(' ');
        
        execSync(cmd2, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        
        // Cleanup temp
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Verify output
    if (!fs.existsSync(OUT_FILE)) {
        console.error('\nERROR: Bundle output not created!');
        process.exit(1);
    }

    const outSize = fs.statSync(OUT_FILE).size;
    console.log(`\n✅ Bundle created: ${OUT_FILE}`);
    console.log(`   Size: ${(outSize / 1024).toFixed(1)} KB`);

    // Quick validation: require and test
    try {
        const engine = require(OUT_FILE);
        if (!engine.calculateAlphaScore) {
            console.error('WARNING: calculateAlphaScore not exported!');
            process.exit(1);
        }
        
        // Quick smoke test
        const testResult = engine.calculateAlphaScore({
            ticker: 'TEST',
            session: 'REG',
            price: 100,
            prevClose: 95,
            changePct: 5.26,
            preMarketChangePct: null,
        });
        
        console.log(`   Smoke test: score=${testResult.score}, grade=${testResult.grade}, version=${testResult.engineVersion}`);
        
        if (testResult.score > 0 && testResult.grade && testResult.engineVersion) {
            console.log('   ✅ Engine bundle validated successfully!');
        } else {
            console.error('   ⚠️ Engine returned unexpected result');
        }
    } catch (e) {
        console.error('WARNING: Bundle validation failed:', e.message);
        console.error('The bundle may still work in Lambda but could not be verified locally.');
    }

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║  Done! Run update-lambda.js to deploy.       ║');
    console.log('╚═══════════════════════════════════════════════╝');
}

main().catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
