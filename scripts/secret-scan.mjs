import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const secretPatterns = [
    /sk-[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9]{36}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /AIza[0-9A-Za-z_-]{35}/,
    /-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----/,
];

function getTrackedFiles() {
    const output = execSync('git ls-files', { encoding: 'utf8' });
    return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function hasBinaryByte(content) {
    return content.includes('\u0000');
}

const files = getTrackedFiles();
const findings = [];

for (const file of files) {
    let content;
    try {
        content = readFileSync(file, 'utf8');
    } catch {
        continue;
    }
    if (hasBinaryByte(content)) continue;

    const lines = content.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        if (secretPatterns.some((pattern) => pattern.test(line))) {
            findings.push(`${file}:${idx + 1}`);
        }
    }
}

if (findings.length > 0) {
    console.error('Potential secrets found in tracked files:');
    for (const finding of findings) {
        console.error(` - ${finding}`);
    }
    process.exit(1);
}

console.log('Secret scan passed: no obvious credentials found in tracked files.');
