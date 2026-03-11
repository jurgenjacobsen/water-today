const fs = require('fs');

try {
    const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
    // This prints the version so GitHub Actions can capture it
    console.log(manifest.version);
} catch (err) {
    console.error('Error reading manifest.json:', err);
    process.exit(1);
}