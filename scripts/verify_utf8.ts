// scripts/verify_utf8.ts
// UTF-8 Encoding Verification Script
// Prevents future file corruption by detecting invalid byte sequences

import fs from "fs";
import path from "path";

const SCAN_DIRS = ["src/app", "src/components", "src/services", "src/hooks", "src/lib"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function isValidUtf8(buffer: Buffer): { valid: boolean; position?: number } {
    let i = 0;
    while (i < buffer.length) {
        const byte = buffer[i];

        if (byte <= 0x7f) {
            // ASCII
            i++;
        } else if ((byte & 0xe0) === 0xc0) {
            // 2-byte sequence
            if (i + 1 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80) {
                return { valid: false, position: i };
            }
            i += 2;
        } else if ((byte & 0xf0) === 0xe0) {
            // 3-byte sequence
            if (i + 2 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80 || (buffer[i + 2] & 0xc0) !== 0x80) {
                return { valid: false, position: i };
            }
            i += 3;
        } else if ((byte & 0xf8) === 0xf0) {
            // 4-byte sequence
            if (i + 3 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80 || (buffer[i + 2] & 0xc0) !== 0x80 || (buffer[i + 3] & 0xc0) !== 0x80) {
                return { valid: false, position: i };
            }
            i += 4;
        } else {
            return { valid: false, position: i };
        }
    }
    return { valid: true };
}

function scanDirectory(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...scanDirectory(fullPath));
        } else if (entry.isFile() && EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
        }
    }
    return files;
}

async function main() {
    console.log("=== UTF-8 Encoding Verification ===\n");

    let totalFiles = 0;
    let failedFiles: { path: string; position: number }[] = [];

    for (const dir of SCAN_DIRS) {
        const files = scanDirectory(dir);
        for (const file of files) {
            totalFiles++;
            const buffer = fs.readFileSync(file);
            const result = isValidUtf8(buffer);

            if (!result.valid) {
                failedFiles.push({ path: file, position: result.position! });
                console.log(`FAIL: ${file} (invalid byte at position ${result.position})`);
            }
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total files scanned: ${totalFiles}`);
    console.log(`Valid UTF-8: ${totalFiles - failedFiles.length}`);
    console.log(`Invalid UTF-8: ${failedFiles.length}`);

    if (failedFiles.length > 0) {
        console.log(`\nFailed files:`);
        failedFiles.forEach(f => console.log(`  - ${f.path} (byte ${f.position})`));
        console.log(`\n=== FAIL ===`);
        process.exit(1);
    } else {
        console.log(`\n=== PASS ===`);
        process.exit(0);
    }
}

main();
