import uniq from 'lodash/uniq'
import { ofetch } from 'ofetch'
import { cache } from '../utils/cache'

// KOD: Replaced Chatbox AI domain pool with KOD's own API.
// The pool is configurable via KOD_API_POOL env var (comma-separated URLs).
// Falls back to KOD_API_ORIGIN if no pool is configured.
const KOD_API_ORIGIN = process.env.KOD_API_ORIGIN || 'https://kod.kai.com'
const KOD_API_POOL = process.env.KOD_API_POOL
  ? process.env.KOD_API_POOL.split(',').map((s) => s.trim()).filter(Boolean)
  : []

const DEFAULT_POOL: string[] = KOD_API_POOL.length > 0 ? KOD_API_POOL : []
let POOL: string[] = [...DEFAULT_POOL]
let API_ORIGIN = DEFAULT_POOL.length > 0 ? DEFAULT_POOL[0] : KOD_API_ORIGIN

export function isChatboxAPI(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : ((input as Request).url ?? input.toString())
  return POOL.some((o) => url.startsWith(o)) || url.startsWith(API_ORIGIN)
}

export function getChatboxAPIOrigin() {
  if (process.env.USE_LOCAL_API) {
    return 'http://localhost:8002'
  }
  return API_ORIGIN
}

/**
 * Test API origin availability.
 * KOD: Pool is configurable via KOD_API_POOL env var.
 * If no pool is configured, skips probing and uses KOD_API_ORIGIN directly.
 * When servers return additional origins via /api/api_origins, they are added to the pool.
 */
export async function testApiOrigins() {
  if (DEFAULT_POOL.length === 0) {
    // No pool configured — use KOD_API_ORIGIN directly, no probing needed
    API_ORIGIN = KOD_API_ORIGIN
    POOL = [KOD_API_ORIGIN]
    return POOL
  }

  const result = await cache(
    'api_origins',
    async () => {
      let i = 0
      let pool = POOL
      while (i < pool.length) {
        try {
          const origin: string = pool[i]
          const controller = new AbortController()
          setTimeout(() => controller.abort(), 2000)
          const res = await ofetch<{ data: { api_origins: string[] } }>(`${origin}/api/api_origins`, {
            signal: controller.signal,
            retry: 1,
          })
          if (res.data.api_origins.length > 0) {
            pool = uniq([...pool, ...res.data.api_origins])
          }
          API_ORIGIN = origin
          pool = uniq([origin, ...pool])
          POOL = pool
          return pool
        } catch (e) {
          i++
        }
      }
      // All pool entries failed, fall back to KOD_API_ORIGIN
      API_ORIGIN = KOD_API_ORIGIN
      return POOL
    },
    { ttl: 1000 * 60 * 60, refreshFallbackToCache: true }
  )

  return result
}
