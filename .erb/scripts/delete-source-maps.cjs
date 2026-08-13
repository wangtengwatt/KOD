const fs = require('node:fs')
const path = require('node:path')

const buildDirectories = [
  path.resolve(__dirname, '../../release/app/dist/main'),
  path.resolve(__dirname, '../../release/app/dist/preload'),
  path.resolve(__dirname, '../../release/app/dist/renderer'),
]

function deleteSourceMaps(directory) {
  if (!fs.existsSync(directory)) {
    return
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      deleteSourceMaps(entryPath)
    } else if (entry.name.endsWith('.map')) {
      fs.rmSync(entryPath)
    }
  }
}

for (const directory of buildDirectories) {
  deleteSourceMaps(directory)
}
