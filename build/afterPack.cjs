const { access, rm } = require('node:fs/promises')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const app = context.appOutDir
  const primary = join(app, 'rinari-agent.exe')
  const alias = join(app, 'rinari-code.exe')
  const engine = join(app, 'resources', 'engine-dist', 'python.exe')
  await access(primary)
  await access(engine)
  // Setup creates this compatibility executable as a hard link after payload
  // verification. Keeping a physical copy in the archive adds ~235 MiB.
  await rm(alias, { force: true })
}
