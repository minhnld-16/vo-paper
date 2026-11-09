const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
// Verify the generated directory before removing stale build artifacts.
if (path.dirname(output) !== root || path.basename(output) !== 'public') throw new Error('Invalid build directory');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'admin'), { recursive: true });
// Never copy login/dashboard HTML, server source, credentials or runtime data.
for (const file of ['index.html', 'tracker.js', 'admin/styles.css', 'admin/dashboard.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Vercel public assets prepared; admin HTML is served by the authenticated function.');
