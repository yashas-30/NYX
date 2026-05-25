const fs = require('fs');
const path = require('path');

const hasBinaries = fs.existsSync(path.join(__dirname, 'binaries'));

module.exports = {
  appId: 'com.nyx.app',
  productName: 'NYX',
  electronDist: path.join(__dirname, 'node_modules/electron/dist'),
  directories: {
    output: 'dist-desktop',
  },
  files: [
    'dist/**/*',
    'dist-server/**/*',
    'dist-electron/**/*',
    'package.json',
  ],
  extraResources: hasBinaries ? [
    {
      from: 'binaries/${os}/${arch}/',
      to: 'binaries',
      filter: ['**/*'],
    },
  ] : [],
  asar: true,
  asarUnpack: [
    '**/binaries/**/*',
    '**/node_modules/sharp/**/*',
    '**/node_modules/@xenova/transformers/**/*',
    '**/dist/nyx-icon.png',
    '**/dist/nyx-icon.ico',
    '**/public/nyx-icon.png',
    '**/public/nyx-icon.ico',
  ],
  win: {
    target: 'nsis',
    icon: 'public/nyx-icon.ico',
    executableName: 'NYX',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'NYX',
    runAfterFinish: true,
    installerIcon: 'public/nyx-icon.ico',
    uninstallerIcon: 'public/nyx-icon.ico',
    installerHeaderIcon: 'public/nyx-icon.ico',
  },
  mac: {
    hardenedRuntime: !!process.env.MAC_NOTARIZE_PASSWORD,
    entitlements: process.env.MAC_ENTITLEMENTS_PATH || undefined,
    entitlementsInherit: process.env.MAC_ENTITLEMENTS_PATH || undefined,
  },
};
