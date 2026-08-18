import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const environment = process.argv[2]
const identities = {
  production: { appId: 'com.kod.app', displayName: 'KOD' },
  localtest: { appId: 'com.kod.app.localtest', displayName: 'KOD 本地测试' },
}
const identity = identities[environment]
if (!identity) throw new Error('Android environment marker must be production or localtest')

const output = resolve(process.cwd(), 'android/app/src/main/assets/kod-build-environment.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({ environment, ...identity }, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote Android ${environment} environment marker.\n`)
