import path, { resolve } from 'node:path'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin } from 'vite'
import packageJson from './release/app/package.json'
/**
 * Vite plugin to inject <base href="/"> for web builds
 * This ensures relative paths resolve correctly for SPA routes like /session/xxx
 */
export function injectBaseTag(): Plugin {
  return {
    name: 'inject-base-tag',
    transformIndexHtml() {
      return [
        {
          tag: 'base',
          attrs: { href: '/' },
          injectTo: 'head-prepend', // Inject at the beginning of <head>
        },
      ]
    },
  }
}

/**
 * Vite plugin to inject window.chatbox_release_date for web builds
 */
export function injectReleaseDate(): Plugin {
  const releaseDate = new Date().toISOString().slice(0, 10)
  return {
    name: 'inject-release-date',
    transformIndexHtml(_html, context) {
      if (context.path.endsWith('/suanbao-window/index.html')) return []
      return [
        {
          tag: 'script',
          children: `window.chatbox_release_date="${releaseDate}";`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

/**
 * Vite plugin to replace Plausible data-domain for web builds
 */
export function replacePlausibleDomain(): Plugin {
  return {
    name: 'replace-plausible-domain',
    transformIndexHtml(html) {
      return html.replace('data-domain="app.chatboxai.app"', 'data-domain="web.chatboxai.app"')
    },
  }
}

/**
 * Vite plugin to inject platform-appropriate viewport meta content.
 * Desktop builds omit `height=device-height` and `viewport-fit=cover` which trigger
 * Chromium's Virtual Keyboard API on macOS, causing an empty bottom margin on input focus.
 * See: https://github.com/chatboxai/chatbox/issues/2023
 */
export function injectViewportContent(isDesktop: boolean): Plugin {
  const content = isDesktop
    ? 'width=device-width, initial-scale=1, user-scalable=no'
    : 'height=device-height, width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover'
  return {
    name: 'inject-viewport-content',
    transformIndexHtml(html) {
      return html.replace('%VIEWPORT_CONTENT%', content)
    },
  }
}

/** Keep the isolated Suanbao renderer strict in production while allowing Vite HMR in development. */
export function injectSuanbaoContentSecurityPolicy(isProduction: boolean): Plugin {
  const productionPolicy =
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
  const developmentPolicy =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"

  return {
    name: 'inject-suanbao-content-security-policy',
    transformIndexHtml(html, context) {
      if (!context.path.endsWith('/suanbao-window/index.html')) return html
      return html.replace('%SUANBAO_CONTENT_SECURITY_POLICY%', isProduction ? productionPolicy : developmentPolicy)
    },
  }
}

/**
 * Vite plugin to replace dvh units with vh units
 * This replaces the webpack string-replace-loader functionality
 */
export function dvhToVh(): Plugin {
  return {
    name: 'dvh-to-vh',
    transform(code, id) {
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

const inferredRelease = process.env.SENTRY_RELEASE || packageJson.version
const inferredDist = process.env.SENTRY_DIST || undefined

process.env.SENTRY_RELEASE = inferredRelease
if (inferredDist) {
  process.env.SENTRY_DIST = inferredDist
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const isWeb = process.env.CHATBOX_BUILD_PLATFORM === 'web'
  const isMobile = process.env.CHATBOX_BUILD_TARGET === 'mobile_app'
  const isDesktop = !isWeb && !isMobile
  const computeMarketSimulation = process.env.COMPUTE_MARKET_SIMULATION ?? 'true'
  const computeMarketSimulationApiBase = process.env.COMPUTE_MARKET_SIMULATION_API_BASE ?? 'https://kod.kai.com/api/v1'
  const computeMarketSimulationAllowedOrigins =
    process.env.COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS ?? 'https://kod.kai.com'
  const computeMarketSimulationRemoteRequired =
    isProduction && computeMarketSimulation === 'true'
      ? 'true'
      : (process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED ?? 'true')

  return {
    main: {
      plugins: [
        ...(isProduction
          ? [
              visualizer({
                filename: 'release/app/dist/main/stats.html',
                open: false,
                title: 'Main Process Dependency Analysis',
              }),
            ]
          : [externalizeDepsPlugin()]),
        process.env.SENTRY_AUTH_TOKEN
          ? sentryVitePlugin({
              authToken: process.env.SENTRY_AUTH_TOKEN,
              org: 'sentry',
              project: 'chatbox',
              url: 'https://sentry.midway.run/',
              release: {
                name: inferredRelease,
                ...(inferredDist ? { dist: inferredDist } : {}),
              },
              sourcemaps: {
                assets: isProduction ? 'release/app/dist/main/**' : 'output/main/**',
              },
              telemetry: false,
            })
          : undefined,
      ].filter(Boolean),
      build: {
        outDir: isProduction ? 'release/app/dist/main' : undefined,
        lib: {
          entry: resolve(__dirname, 'src/main/main.ts'),
        },
        sourcemap: isProduction ? 'hidden' : false, // KOD opt: disable sourcemaps in dev to save ~40% memory
        minify: isProduction,
        rollupOptions: {
          external: Object.keys(packageJson.dependencies || {}),
          output: {
            entryFileNames: '[name].js',
            inlineDynamicImports: true,
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src/renderer'),
          '@shared': path.resolve(__dirname, './src/shared'),
          'src/shared': path.resolve(__dirname, './src/shared'),
        },
      },
      define: {
        'process.type': '"browser"',
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || (isProduction ? 'production' : 'development')),
        'process.env.CHATBOX_BUILD_TARGET': JSON.stringify(process.env.CHATBOX_BUILD_TARGET || 'unknown'),
        'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || 'unknown'),
        'process.env.CHATBOX_BUILD_CHANNEL': JSON.stringify(process.env.CHATBOX_BUILD_CHANNEL || 'unknown'),
        'process.env.USE_LOCAL_API': JSON.stringify(process.env.USE_LOCAL_API || ''),
        'process.env.USE_BETA_API': JSON.stringify(process.env.USE_BETA_API || ''),
        'process.env.USE_NEWDB_API': JSON.stringify(process.env.USE_NEWDB_API || ''),
        'process.env.USE_LOCAL_CHATBOX': JSON.stringify(process.env.USE_LOCAL_CHATBOX || ''),
        'process.env.USE_BETA_CHATBOX': JSON.stringify(process.env.USE_BETA_CHATBOX || ''),
        'process.env.KOD_API_ORIGIN': JSON.stringify(process.env.KOD_API_ORIGIN || 'https://kod.kai.com'),
        'process.env.KOD_MARKET_API_ORIGIN': JSON.stringify(process.env.KOD_MARKET_API_ORIGIN || ''),
        'process.env.KOD_PAYMENT_HOSTS': JSON.stringify(process.env.KOD_PAYMENT_HOSTS || 'kod.kai.com,mzf.mapay.cc'),
      },
    },
    preload: {
      plugins: [
        visualizer({
          filename: 'release/app/dist/preload/stats.html',
          open: false,
          title: 'Preload Process Dependency Analysis',
        }),
      ],
      build: {
        outDir: isProduction ? 'release/app/dist/preload' : undefined,
        lib: {
          entry: {
            index: resolve(__dirname, 'src/preload/index.ts'),
            suanbao: resolve(__dirname, 'src/preload/suanbao.ts'),
            tinpay: resolve(__dirname, 'src/preload/tinpay.ts'),
          },
        },
        sourcemap: isProduction ? 'hidden' : false, // KOD opt: disable sourcemaps in dev to save ~40% memory
        minify: isProduction,
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src/renderer'),
          '@shared': path.resolve(__dirname, './src/shared'),
          'src/shared': path.resolve(__dirname, './src/shared'),
        },
      },
    },
    renderer: {
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
        injectViewportContent(isDesktop),
        injectSuanbaoContentSecurityPolicy(isProduction),
        isWeb ? injectBaseTag() : undefined,
        injectReleaseDate(),
        isWeb ? replacePlausibleDomain() : undefined,
        visualizer({
          filename: 'release/app/dist/renderer/stats.html',
          open: false,
          title: 'Renderer Process Dependency Analysis',
        }),
        process.env.SENTRY_AUTH_TOKEN
          ? sentryVitePlugin({
              authToken: process.env.SENTRY_AUTH_TOKEN,
              org: 'sentry',
              project: 'chatbox',
              url: 'https://sentry.midway.run/',
              release: {
                name: inferredRelease,
                ...(inferredDist ? { dist: inferredDist } : {}),
              },
              sourcemaps: {
                assets: isProduction ? 'release/app/dist/renderer/**' : 'output/renderer/**',
              },
              telemetry: false,
            })
          : undefined,
      ].filter(Boolean),
      build: {
        outDir: isProduction ? 'release/app/dist/renderer' : undefined,
        target: 'es2020', // Avoid static initialization blocks for browser compatibility
        sourcemap: isProduction ? 'hidden' : false, // KOD opt: disable sourcemaps in dev to save ~40% memory
        minify: isProduction ? 'esbuild' : false, // Use esbuild for faster, less memory-intensive minification
        rollupOptions: {
          input: isDesktop
            ? {
                index: resolve(__dirname, 'src/renderer/index.html'),
                suanbao: resolve(__dirname, 'src/renderer/suanbao-window/index.html'),
              }
            : resolve(__dirname, 'src/renderer/index.html'),
          output: {
            entryFileNames: 'js/[name].[hash].js',
            chunkFileNames: 'js/[name].[hash].js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.name?.endsWith('.css')) {
                return 'styles/[name].[hash][extname]'
              }
              if (/\.(woff|woff2|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
                return 'fonts/[name].[hash][extname]'
              }
              if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(assetInfo.name || '')) {
                return 'images/[name].[hash][extname]'
              }
              return 'assets/[name].[hash][extname]'
            },
            // Optimize chunk splitting to reduce memory usage during build
            manualChunks(id) {
              const normalizedId = id.split(path.sep).join('/')
              const isNodeModulePackage = (pkg: string) => normalizedId.includes(`/node_modules/${pkg}/`)

              if (normalizedId.includes('/node_modules/')) {
                // Split large vendor chunks
                if (isNodeModulePackage('@ai-sdk') || isNodeModulePackage('ai')) {
                  return 'vendor-ai'
                }
                if (isNodeModulePackage('@mantine') || isNodeModulePackage('@tabler')) {
                  return 'vendor-ui'
                }
                if (
                  isNodeModulePackage('mermaid') ||
                  isNodeModulePackage('d3') ||
                  /\/node_modules\/d3-[^/]+\//.test(normalizedId)
                ) {
                  return 'vendor-charts'
                }
              }
            },
          },
        },
      },
      css: {
        modules: {
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
        postcss: './postcss.config.cjs',
      },
      server: {
        port: Number(process.env.DEV_PORT) || 1212,
        // KOD opt: reduce file system watcher overhead on Windows (saves ~100MB)
        watch: {
          ignored: ['**/node_modules/**', '**/.git/**', '**/release/**', '**/out/**', '**/dist/**'],
        },
        fs: {
          strict: false, // Allow serving files outside of the root
        },
      },
      define: {
        'process.type': '"renderer"',
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : process.env.NODE_ENV || 'development'),
        'process.env.CHATBOX_BUILD_TARGET': JSON.stringify(process.env.CHATBOX_BUILD_TARGET || 'unknown'),
        'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify(process.env.CHATBOX_BUILD_PLATFORM || 'unknown'),
        'process.env.CHATBOX_BUILD_CHANNEL': JSON.stringify(process.env.CHATBOX_BUILD_CHANNEL || 'unknown'),
        'process.env.USE_LOCAL_API': JSON.stringify(process.env.USE_LOCAL_API || ''),
        'process.env.USE_BETA_API': JSON.stringify(process.env.USE_BETA_API || ''),
        'process.env.USE_NEWDB_API': JSON.stringify(process.env.USE_NEWDB_API || ''),
        'process.env.USE_LOCAL_CHATBOX': JSON.stringify(process.env.USE_LOCAL_CHATBOX || ''),
        'process.env.USE_BETA_CHATBOX': JSON.stringify(process.env.USE_BETA_CHATBOX || ''),
        'process.env.KOD_API_ORIGIN': JSON.stringify(process.env.KOD_API_ORIGIN || 'https://kod.kai.com'),
        'process.env.KOD_MARKET_API_ORIGIN': JSON.stringify(process.env.KOD_MARKET_API_ORIGIN || ''),
        'process.env.KOD_PAYMENT_HOSTS': JSON.stringify(process.env.KOD_PAYMENT_HOSTS || 'kod.kai.com,mzf.mapay.cc'),
        'process.env.COMPUTE_MARKET_V2': JSON.stringify(process.env.COMPUTE_MARKET_V2 ?? 'true'),
        'process.env.COMPUTE_MARKET_SIMULATION': JSON.stringify(computeMarketSimulation),
        'process.env.COMPUTE_MARKET_SIMULATION_API_BASE': JSON.stringify(computeMarketSimulationApiBase),
        'process.env.COMPUTE_MARKET_SIMULATION_ALLOWED_ORIGINS': JSON.stringify(computeMarketSimulationAllowedOrigins),
        'process.env.COMPUTE_MARKET_SIMULATION_REMOTE_REQUIRED': JSON.stringify(computeMarketSimulationRemoteRequired),
      },
      optimizeDeps: {
        // KOD opt: disabled force to allow Vite dependency cache (saves ~200MB on repeated dev starts).
        // Opt in via env when needed: VITE_FORCE_DEP_OPTIMIZE=true (or --force on the CLI).
        // If MUI breaks after dependency changes, run: pnpm exec electron-vite dev --force
        force: process.env.VITE_FORCE_DEP_OPTIMIZE === 'true',
        include: ['mermaid'],
        esbuildOptions: {
          target: 'es2015',
        },
      },
    },
  }
})
