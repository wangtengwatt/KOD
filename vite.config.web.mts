// Standalone Vite config for KOD web-only development.
// This bypasses electron-vite to avoid Electron bug #49034 on Windows
// where require('electron') returns a string path instead of the API.
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
    // Inject viewport content for web
    {
      name: 'inject-viewport-content',
      transformIndexHtml(html: string) {
        return html.replace(
          '%VIEWPORT_CONTENT%',
          'height=device-height, width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover'
        )
      },
    },
    // Inject base tag for web SPA routing
    {
      name: 'inject-base-tag',
      transformIndexHtml() {
        return [{ tag: 'base', attrs: { href: '/' }, injectTo: 'head-prepend' }]
      },
    },
    // Inject release date
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
    // Replace Plausible data-domain for web
    {
      name: 'replace-plausible-domain',
      transformIndexHtml(html: string) {
        return html.replace('data-domain="app.chatboxai.app"', 'data-domain="web.chatboxai.app"')
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
    port: Number(process.env.DEV_PORT) || 1212,
  },
  define: {
    'process.type': '"renderer"',
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.CHATBOX_BUILD_TARGET': JSON.stringify('unknown'),
    'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify('web'),
    'process.env.CHATBOX_BUILD_CHANNEL': JSON.stringify('unknown'),
    'process.env.USE_LOCAL_API': JSON.stringify(''),
    'process.env.USE_BETA_API': JSON.stringify(''),
    'process.env.USE_NEWDB_API': JSON.stringify(''),
    'process.env.USE_LOCAL_CHATBOX': JSON.stringify(''),
    'process.env.USE_BETA_CHATBOX': JSON.stringify(''),
    'process.env.KOD_API_ORIGIN': JSON.stringify(process.env.KOD_API_ORIGIN || 'https://kod.kai.com'),
  },
  optimizeDeps: {
    // Disabled to avoid esbuild OOM on this machine — the pre-bundling step
    // requires more physical RAM than available for this large monorepo.
    disabled: true,
  },
})
