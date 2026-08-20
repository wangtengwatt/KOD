import { KOD_API_ORIGIN, NODE_ENV, USE_LOCAL_API } from '@/variables'

interface KodApiOriginOptions {
  configuredOrigin: string
  nodeEnv: string
  useLocalApi: string
}

function isExplicitlyEnabled(value: string) {
  const normalized = value.trim().toLowerCase()
  return (
    normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'no' && normalized !== 'off'
  )
}

export function resolveKodApiOrigin(options: KodApiOriginOptions) {
  if (isExplicitlyEnabled(options.useLocalApi)) return 'http://localhost:8080'
  return options.configuredOrigin
}

export function getKodApiOrigin() {
  return resolveKodApiOrigin({
    configuredOrigin: KOD_API_ORIGIN,
    nodeEnv: NODE_ENV,
    useLocalApi: USE_LOCAL_API,
  })
}
