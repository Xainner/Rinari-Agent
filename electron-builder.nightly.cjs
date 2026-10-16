// Rinari Agent Nightly: convive con la normal (docs/planes/idea-nightly.md).
// Otra identidad, otro ejecutable, otra carpeta de salida e iconos con la luna.
// Lo arma `npm run nightly`, que fija la versión en RINARI_NIGHTLY_VERSION; no
// se publica desde aquí.
const version = process.env.RINARI_NIGHTLY_VERSION
if (!version) throw new Error('RINARI_NIGHTLY_VERSION is required (run npm run nightly)')

module.exports = {
  appId: 'com.rinari.agent.nightly',
  productName: 'Rinari Agent Nightly',
  copyright: 'Copyright © 2026 Xainner',
  asar: true,
  compression: 'maximum',
  npmRebuild: false,
  allowMissingDependencies: false,
  extraMetadata: { version },
  directories: { buildResources: 'build', output: 'release/electron-nightly' },
  files: ['dist/**/*', 'dist-electron/**/*', 'package.json'],
  extraResources: [
    { from: 'engine-dist', to: 'engine-dist', filter: ['**/*'] },
    { from: 'build/app-update.yml', to: 'app-update.yml' },
    { from: 'build/nightly/tray.ico', to: 'tray.ico' },
    { from: 'build/indicators', to: 'indicators', filter: ['*.png'] },
  ],
  afterPack: 'build/afterPack.cjs',
  artifactName: 'Rinari-Agent-Nightly-Payload-${version}-${arch}.${ext}',
  forceCodeSigning: false,
  win: {
    target: [{ target: 'dir', arch: ['x64'] }],
    executableName: 'rinari-agent-nightly',
    icon: 'build/nightly/icon.ico',
  },
}
