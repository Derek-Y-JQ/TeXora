// Use typed builder options on both PowerShell and Bash.
const { build, Platform, Arch } = require('electron-builder');
const mac = process.platform === 'darwin';
const arch = process.argv[2] || process.arch;
if (!['x64','arm64'].includes(arch)) throw Error('Unsupported architecture ' + arch);
const platform = mac ? Platform.MAC : Platform.WINDOWS;
const config = {forceCodeSigning:true};
if (mac) {
  if (!process.env.CSC_LINK) throw Error('Developer ID certificate required for a macOS release');
  config.mac = {hardenedRuntime:true, notarize:false};
  config.dmg = {sign:true};
}
build({targets:platform.createTarget(mac ? 'dmg' : 'nsis', Arch[arch]), config, publish:'never'})
  .catch(error => { console.error(error); process.exitCode = 1; });
