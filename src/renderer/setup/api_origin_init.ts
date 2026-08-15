/**
 * KOD: API origin initialization.
 *
 * In KOD, the API origin is set to KOD_API_ORIGIN (default: https://kod.kai.com).
 * The pool mechanism is retained for future multi-server support via KOD_API_POOL env var.
 * When no pool is configured, no probing is necessary — KOD_API_ORIGIN is used directly.
 *
 * This MUST run early in the renderer lifecycle — before any component
 * that calls remote.ts functions depending on getAPIOrigin().
 */
import { testApiOrigins } from '../../shared/request/chatboxai_pool'

// Fire-and-forget: testApiOrigins() will use KOD_API_ORIGIN directly
// when no KOD_API_POOL is configured.
testApiOrigins().catch(() => {
  // Silently swallow — KOD_API_ORIGIN is the fallback.
})
