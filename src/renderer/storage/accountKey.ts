/**
 * Derive a safe account key from login email for database namespace isolation.
 * Each account gets its own IndexedDB database (e.g., chatbox-session-meta-{key}).
 */

function hashEmail(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

export function deriveAccountKey(email: string): string {
  return hashEmail(email.toLowerCase().trim())
}

export function getAccountDBName(baseName: string, accountKey?: string | null): string {
  if (accountKey) {
    return `${baseName}-${accountKey}`
  }
  return baseName
}
