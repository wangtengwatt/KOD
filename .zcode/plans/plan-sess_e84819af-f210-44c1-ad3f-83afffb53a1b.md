## First-principles findings and scope correction

The requested MVP can be implemented in the Renderer without creating a new desktop window, but two inputs from the task brief are not directly available in the repository:

1. The attached reference image is not materialized as a local file/path, so it cannot literally be cropped into five PNG files from the current workspace. I will preserve this as an explicit implementation constraint rather than fabricate “cropped” assets. The MVP will use a small, clearly isolated asset adapter with deterministic placeholders/fallbacks; when the original image file is supplied, replacing the five imports will not affect behavior.
2. Existing KOD settings are device-global, not account-scoped. Adding Suanbao fields to `SettingsSchema` would violate your confirmed “按账户持久化” requirement. I will therefore add a dedicated, account-keyed preference store instead of silently claiming the global settings store provides account isolation.

Also, “始终创建新会话” applies to Explain Code and Analyze Error actions. “Continue recent conversation” is a separate navigation action and will continue the persisted current session first, falling back to the existing session list. No automatic clipboard, screen, file, or external-window reads will be introduced.

## Implementation plan

### 1. Add account-scoped Suanbao preferences and pure utilities

Create a focused Suanbao domain module under `src/renderer/components/suanbao/` or `src/renderer/stores/` containing:

- typed preferences and defaults:
  - `enabled: true`
  - `hidden: false`
  - `animation: 'full'`
  - normalized/edge-safe position data for drag persistence
- account namespace derived through the existing `deriveAccountKey` + `authInfoStore.loginEmail` flow;
- safe persistence with versioning, corrupt-data fallback, and account switching rehydration;
- pure helpers for:
  - supported route/settings-modal visibility;
  - viewport-safe position clamping and normalization;
  - mapping existing chat/task message state to `idle | thinking | executing | success | error`.

The store will not collect or persist chat content, prompts, IDs, filenames, or coordinates that are unnecessary for the UI. Position will be stored in a validated normalized form and persisted only on drag end.

### 2. Add five-state visual asset adapter

Add a dedicated `src/renderer/static/suanbao/` asset boundary and a visual component that maps:

- `idle` → 嘿嘿
- `thinking` → 发呆
- `executing` → 得意
- `success` → 大笑
- `error` → 委屈
- optional exceptional fallback → 惊吓

Because the supplied image is not available as a filesystem artifact, initially keep the visual source replaceable and isolated. Use existing bundled-image import conventions, plus a static/error fallback so an asset failure only hides the pet. Add CSS animation classes for full animation and a `prefers-reduced-motion` override; no animation loop or business-state mutation will be allowed.

### 3. Build the presentational pet and host

Create:

- a pure `SuanbaoPet` component for the visual, keyboard-accessible button, pointer drag, click/double-click distinction, position rendering, and action menu;
- a `SuanbaoPetHost` mounted once in `src/renderer/routes/__root.tsx` beside global floating UI.

Visibility will be gated exactly for:

- `/`
- `/session/*`
- `/task` and `/task/*`

and hidden for `/settings/*` plus desktop masked settings (`search.settings`), matching the existing settings-modal precedent. A local `ErrorBoundary name="suanbao-pet"` with a null/minimal fallback will isolate failures from core chat.

The pet will:

- show by default;
- remain hidden after user dismissal until explicitly restored;
- support pointer drag with threshold, pointer capture, cleanup, viewport resize re-clamping, and safe-area bounds;
- disable new-task actions while chat/task generation is active, leaving only cancellation;
- provide keyboard activation and accessible labels.

### 4. Implement quick actions using existing session/task APIs

Create a small action adapter that reuses current primitives rather than duplicating chat logic:

- **New AI session:** navigate to `/` using the established new-session mechanism.
- **Explain code / Analyze error:** show a mini input modal; the user explicitly enters/pastes content. On submit, create a new chat via `initEmptyChatSession` + `createSession`, switch with `switchCurrentSession`, construct a text message, and call `submitNewUserMessage`. No clipboard read occurs.
- **Continue recent conversation:** use the persisted current session ID when valid; otherwise use the first result from the existing session metadata API; call `switchCurrentSession`; fall back to `/` if none exists.
- **Cancel:** extract/reuse the existing chat cancellation sequence as a shared action and call `cancelTaskGeneration` for task sessions.
- **Task context:** route to `/task` for a new task and use current task/history navigation where applicable, without adding concurrent task generation.

The action adapter will keep the “always create new chat” rule limited to the two content-processing quick actions, so recent-session continuation does not accidentally create a duplicate.

### 5. Add settings and recovery controls

Add a dedicated `/settings/suanbao` page and register it in both:

- the normal settings route navigation;
- the desktop masked settings memory router.

Controls will include:

- enable/disable;
- hide/show and a clear “Restore Suanbao” recovery action;
- animation level, defaulting to full;
- position/reset controls if needed for safe recovery.

The existing Sidebar settings entry remains the guaranteed recovery path. If a main/tray menu entry is needed after implementation review, add it through the existing `platform.onNavigate` settings navigation pipeline rather than mutating renderer state from Electron main.

### 6. Add consent-gated anonymous analytics

Create an allowlisted Suanbao analytics helper using the existing `trackingEvent` wrapper so reporting consent is checked at event time. Record only finite, content-free values for:

- enable/disable;
- menu/open interaction;
- quick action type;
- hide/show/recovery;
- cancel;
- success/failure;
- animation level;
- position zone;
- coarse performance bucket if a reliable existing measurement hook is available.

Never include prompt/code/error text, session/task IDs, names, filenames, URLs, account/email data, or raw errors. Events fire only on explicit actions or task transitions, never on every render/animation frame.

### 7. Add tests before verification

Add focused tests for:

- route visibility including desktop settings search state;
- preference defaults, version migration, account isolation, corrupt persistence;
- position clamp/normalization;
- five-state mapping;
- quick-action prompt construction and session navigation/cancellation adapters;
- drag/click/keyboard/hide/recovery behavior (using explicit jsdom setup if needed);
- consent gating and analytics payload allowlists;
- asset fallback/error isolation where practical.

Do not expand the scope into system-level floating windows, drag-and-drop file context, growth/shop features, or automatic context capture.

### 8. Run the agreed MVP gate and report facts

Run relevant targeted tests first, then:

- `pnpm run check`
- `pnpm run lint`
- relevant/full Vitest tests as feasible

If failures originate in existing repository issues, separate them from Suanbao regressions with exact command output and file references. No commit or push will be performed unless separately requested.