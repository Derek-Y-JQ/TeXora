const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const modules = path.join(context.appOutDir, 'TeXora.app', 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
  const prebuilds = path.join(modules, 'node-pty', 'prebuilds');
  for (const arch of ['arm64', 'x64']) {
    const helper = path.join(prebuilds, 'darwin-' + arch, 'spawn-helper');
    try { await fs.chmod(helper, 0o755); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
};
