// Standalone Vite config for KOD iOS mobile device-frame preview in a browser.
// Mirrors vite.config.web.mts (which bypasses electron-vite to avoid the
// Windows Electron bug #49034) but targets the mobile_app + ios build so the
// renderer uses MobilePlatform and the iOS safe-area setup, exactly like the
// canonical "manual iOS device-frame preview" documented in KOD-iOS/README.md.
//
// Run (from this repo root):
//   pnpm exec vite --config vite.config.ios-preview.mts
// Then open http://127.0.0.1:1213/ in a browser with an iPhone-sized viewport,
// or open the device-frame wrapper served alongside it.
//
// This serves the SAME renderer source the desktop dev server uses, only the
// build-target defines differ. It does not launch Electron, so it does not
// conflict with a concurrently running `electron-vite dev` desktop instance
// (which occupies port 1212). Default port is 1213; override with DEV_PORT.
import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Replaces dvh units with vh units (copied from electron.vite.config.ts) */
function dvhToVh() {
  return {
    name: 'dvh-to-vh',
    transform(code: string, id: string) {
      if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.sass')) {
        return {
          code: code.replace(/(\d+)dvh/g, '$1vh'),
          map: null,
        }
      }
      return null
    },
  }
}

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/renderer/routes',
      generatedRouteTree: './src/renderer/routeTree.gen.ts',
    }),
    react({}),
    dvhToVh(),
    // Inject the mobile viewport content (matches injectViewportContent(false)
    // in electron.vite.config.ts: includes viewport-fit=cover for safe areas).
    {
      name: 'inject-viewport-content',
      transformIndexHtml(html: string) {
        return html.replace(
          '%VIEWPORT_CONTENT%',
          'height=device-height, width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover'
        )
      },
    },
    // Inject release date (matches the canonical renderer build).
    {
      name: 'inject-release-date',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            children: `window.chatbox_release_date="${new Date().toISOString().slice(0, 10)}";`,
            injectTo: 'head-prepend',
          },
        ]
      },
    },
    // jeep-sqlite (used by @capacitor-community/sqlite web backend) is a Stencil
    // component whose loader (bootstrapLazy) registers a proxy class, then at
    // runtime issues a dynamic `import('./jeep-sqlite.entry.js')` (with a
    // /* @vite-ignore */ comment) to lazily load the real component. That
    // relative import resolves to a raw `/node_modules/jeep-sqlite/dist/esm/...`
    // URL, which Vite's dev server serves as the SPA index.html fallback (not
    // JS) — so the dynamic import fails, the component never upgrades, its
    // connectedCallback/openStore never run, and every @Method call (e.g.
    // isStoreOpen) hangs forever. This middleware rewrites those raw
    // jeep-sqlite chunk requests to the /@fs/ form Vite serves as real JS.
    {
      name: 'jeep-sqlite-fs-rewrite',
      configureServer(server) {
        const root = path.resolve(__dirname, 'node_modules/jeep-sqlite/dist/esm').replace(/\\/g, '/')
        server.middlewares.use((req, res, next) => {
          const url = req.url || ''
          // Only intercept requests that target jeep-sqlite dist files via the
          // raw /node_modules/... path (the form Stencil's runtime import uses).
          const m = url.match(/^\/node_modules\/jeep-sqlite\/dist\/esm\/(.+?)(\?|$)/)
          if (m) {
            const fileRel = m[1]
            const query = m[2] ? url.slice(url.indexOf(m[2])) : ''
            const fsUrl = '/@fs/' + root + '/' + fileRel + query
            // Rewrite the request URL so Vite's static middleware serves the file.
            req.url = fsUrl
          }
          next()
        })
      },
    },
  ],
  css: {
    modules: {
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
    postcss: './postcss.config.cjs',
  },
  server: {
    port: Number(process.env.DEV_PORT) || 1213,
    fs: {
      strict: false, // Allow serving files outside of the root (matches renderer config)
    },
  },
  define: {
    'process.type': '"renderer"',
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.CHATBOX_BUILD_TARGET': JSON.stringify('mobile_app'),
    'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify('ios'),
    'process.env.CHATBOX_BUILD_CHANNEL': JSON.stringify('unknown'),
    'process.env.USE_LOCAL_API': JSON.stringify(''),
    'process.env.USE_BETA_API': JSON.stringify(''),
    'process.env.USE_NEWDB_API': JSON.stringify(''),
    'process.env.USE_LOCAL_CHATBOX': JSON.stringify(''),
    'process.env.USE_BETA_CHATBOX': JSON.stringify(''),
    'process.env.KOD_API_ORIGIN': JSON.stringify('https://kod.kai.com'),
    'process.env.KOD_MARKET_API_ORIGIN': JSON.stringify(process.env.KOD_MARKET_API_ORIGIN || ''),
    'process.env.KOD_PAYMENT_HOSTS': JSON.stringify('kod.kai.com,mzf.mapay.cc'),
  },
  optimizeDeps: {
    // Match the electron-vite renderer config: pre-bundle dependencies so Vite
    // does not open thousands of source files concurrently on first load (which
    // triggers EMFILE "too many open files" on Windows). `disabled: true` (as
    // used in vite.config.web.mts) causes that flood for this large module graph.
    force: process.env.VITE_FORCE_DEP_OPTIMIZE === 'true',
    include: ['mermaid'],
    // jeep-sqlite (the @capacitor-community/sqlite web backend's Stencil
    // component) MUST NOT be pre-bundled. Stencil's loader (bootstrapLazy)
    // lazily `import('./jeep-sqlite.entry.js')` at runtime; if Vite pre-bundles
    // the loader/runtime into one chunk but serves the lazily-imported entry as
    // source (or a different pre-bundled chunk), two separate copies of the
    // Stencil runtime load and the host-element registry does not match, causing
    // "Couldn't find host element for jeep-sqlite as it is unknown to this
    // Stencil runtime" / "$instanceValues$ undefined". Excluding it keeps the
    // loader, runtime, and entry all served as source from /@fs/ so they share
    // a single Stencil runtime, and the relative lazy import stays in /@fs/.
    exclude: ['jeep-sqlite'],
    esbuildOptions: {
      target: 'es2015',
    },
  },
})
