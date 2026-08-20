// Browser-only setup for the iOS mobile preview.
//
// The mobile build uses @capacitor-community/sqlite for storage. Its web
// backend requires a <jeep-sqlite> Stencil component whose lazy-loading is
// incompatible with Vite's dev server (runtime dynamic import hits the SPA
// HTML fallback / splits the Stencil runtime / the lazy lifecycle's rAF
// scheduler stalls), so the store never opens and every SQLite operation
// fails. The canonical repo never hits this because the mobile build only
// ever runs inside the real iOS Capacitor shell (native SQLite).
//
// For a plain-browser preview on Windows (no macOS/Xcode), we provide a
// browser-only storage shim at the SQLiteConnection layer: createConnection
// returns a localforage-backed fake DB that implements the small subset of
// SQL the app's key_value storage uses (CREATE TABLE / INSERT OR REPLACE /
// SELECT / DELETE on a (key,value) table). This lets the app's settings store
// work via IndexedDB so the UI renders. Complex SQLite storages (image gen /
// session meta) are lazily constructed and not needed for initial render;
// their advanced queries (COUNT/ORDER BY/LIMIT) gracefully no-op here.
//
// Patching happens at the SQLiteConnection prototype level (imported from
// @capacitor-community/sqlite directly) so it does NOT trigger the platform
// module graph (which would hit a circular-import TDZ if we imported
// storages.ts before index.tsx). This module is imported (with top-level
// await) before ./index.tsx via a single entry module in ios-debug.html.
//
// It also no-ops the @capacitor/keyboard plugin, which has no web impl.

import localforage from 'localforage'

function diag(msg: string) {
  console.info('[ios-web-preview] ' + msg)
  try {
    let box = document.getElementById('__sqlite_diag__')
    if (!box) {
      box = document.createElement('pre')
      box.id = '__sqlite_diag__'
      box.style.cssText =
        'position:fixed;z-index:1000001;top:0;right:0;max-width:50vw;max-height:60vh;overflow:auto;' +
        'padding:6px 8px;margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;' +
        'line-height:1.35;white-space:pre-wrap;word-break:break-word;color:#042;background:rgba(220,255,235,0.92);'
      document.body.appendChild(box)
    }
    box.textContent += msg + '\n'
  } catch {
    /* ignore */
  }
}

// A localforage-backed fake SQLiteDBConnection. Stores rows per (database,
// table) in localforage, keyed by the first column (treated as the primary
// key, which matches the app's key_value schema).
function createFakeDb(database: string) {
  const store = localforage.createInstance({ name: 'kod-sqlite-' + database })
  const tableKey = (table: string, rowKey: string) => `t:${table}:${rowKey}`

  async function open() {}
  async function close() {}
  async function execute(_statements: string) {
    // CREATE TABLE / ALTER TABLE — no-op (the localforage store is schema-less)
    return { changes: { changes: 0 } }
  }

  async function run(statement: string, values: any[]) {
    const sql = statement.trim()
    // INSERT OR REPLACE INTO <table> (<cols>) VALUES (?,?,...)
    let m = sql.match(/^INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i)
    if (m) {
      const table = m[1]
      const cols = m[2].split(',').map((c) => c.trim())
      const row: any = {}
      cols.forEach((c, i) => (row[c] = values?.[i]))
      const pk = values?.[0] != null ? String(values[0]) : String(Date.now())
      await store.setItem(tableKey(table, pk), row)
      return { changes: { changes: 1 } }
    }
    // DELETE FROM <table> WHERE <col> = ?
    m = sql.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i)
    if (m) {
      const table = m[1]
      const pk = values?.[0] != null ? String(values[0]) : ''
      await store.removeItem(tableKey(table, pk))
      return { changes: { changes: 1 } }
    }
    // Generic INSERT (e.g. image_generation) — best-effort: store by first col.
    m = sql.match(/^INSERT\s+INTO\s+(\w+)/i)
    if (m) {
      const table = m[1]
      const pk = values?.[0] != null ? String(values[0]) : String(Date.now())
      await store.setItem(tableKey(table, pk), { values })
      return { changes: { changes: 1 } }
    }
    return { changes: { changes: 0 } }
  }

  async function query(statement: string, values?: any[]) {
    const sql = statement.trim()
    // SELECT <cols> FROM <table> [WHERE <col> = ?]
    let m = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?)?/i)
    if (m) {
      const colsRaw = m[1].trim()
      const table = m[2]
      const whereCol = m[3]
      const allRows: any[] = []
      await store.iterate((row: any, key: string) => {
        if (key.startsWith(`t:${table}:`)) allRows.push(row)
      })
      let rows = allRows
      if (whereCol && values && values.length > 0) {
        rows = allRows.filter((r) => String(r[whereCol]) === String(values[0]))
      }
      // Project columns
      const cols = colsRaw.split(',').map((c) => c.trim())
      const project = (r: any) => {
        if (colsRaw === '*') return r
        const out: any = {}
        cols.forEach((c) => {
          if (c === '*' ) Object.assign(out, r)
          else out[c] = r[c]
        })
        return out
      }
      return { values: rows.map(project) }
    }
    // SELECT COUNT(*) ... → empty count (not needed for initial render)
    if (/^SELECT\s+COUNT/i.test(sql)) {
      return { values: [{ total: 0 }] }
    }
    return { values: [] }
  }

  // Provide the full SQLiteDBConnection surface as graceful no-ops so any
  // lazily-accessed storage doesn't throw during render.
  const noop = async () => ({ changes: { changes: 0 }, values: [] })
  return {
    open,
    close,
    execute,
    run,
    query,
    executeSet: noop,
    beginTransaction: noop,
    commitTransaction: noop,
    rollbackTransaction: noop,
    isTransactionActive: async () => ({ result: false }),
    getVersion: async () => ({ version: 0 }),
    getTableList: async () => ({ values: [] }),
    isDBExists: async () => ({ result: false }),
    isDBOpen: async () => ({ result: true }),
    deleteDatabase: noop,
    isTableExists: async () => ({ result: false }),
  } as any
}

async function patchSQLiteConnection() {
  try {
    const mod = await import('@capacitor-community/sqlite')
    const SQLiteConnection = mod.SQLiteConnection
    const proto = SQLiteConnection.prototype
    proto.createConnection = async function (database: string) {
      const db = database.endsWith('.db') ? database.slice(0, -3) : database
      diag('createConnection shim: ' + db)
      return createFakeDb(db)
    }
    proto.closeConnection = async function () {
      return
    }
    proto.closeAllConnections = async function () {
      return
    }
    diag('SQLiteConnection.createConnection patched to IndexedDB-backed fake DB')
  } catch (e) {
    diag('patchSQLiteConnection FAILED: ' + (e as Error).message)
    console.error('[ios-web-preview] patchSQLiteConnection failed', e)
  }
}

async function stubKeyboardPlugin() {
  try {
    const Keyboard = await import('@capacitor/keyboard')
    const proto = Object.getPrototypeOf(Keyboard.Keyboard)
    if (proto && typeof proto.addListener === 'function') {
      proto.addListener = async () => ({ remove: async () => {} }) as any
    }
    diag('Keyboard plugin stubbed')
  } catch (e) {
    diag('Keyboard stub skipped: ' + (e as Error).message)
  }
}

// @capacitor/app has no web implementation either; the app calls App.getInfo()
// (version checks) and App.addListener('appUrlOpen', ...) (deep links). Stub
// them so these resolve instead of rejecting with "Not implemented on web".
async function stubAppPlugin() {
  try {
    const App = await import('@capacitor/app')
    const proto = Object.getPrototypeOf(App.App)
    if (proto) {
      proto.addListener = async () => ({ remove: async () => {} }) as any
      proto.getInfo = async () => ({
        name: 'KOD',
        id: 'com.kai.kod',
        build: '1',
        version: '0.0.0-ios-preview',
      }) as any
    }
    diag('App plugin stubbed')
  } catch (e) {
    diag('App stub skipped: ' + (e as Error).message)
  }
}

await Promise.all([patchSQLiteConnection(), stubKeyboardPlugin(), stubAppPlugin()])
diag('ios_web_preview_init complete')
