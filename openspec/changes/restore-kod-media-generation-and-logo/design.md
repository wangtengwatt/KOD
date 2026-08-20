## Context

See `proposal.md` and the two capability specs. The current image page only builds groups for the automatic KOD provider and selected BYOK providers; the active manual relay is registered as a separate OpenAI-compatible provider but is not considered by the image group hook. The current video transport compiles an upstream host and key into renderer code, while all four target runtimes share that renderer and therefore cannot protect the key.

The paired backend contract is defined by `D:/watt/kod-ai-portal/openspec/changes/add-kod-video-generation-proxy` and must be deployed before enabling the new client video path.

## Goals / Non-Goals

**Goals:**

- Route a selected manual relay image model through the exact selected relay provider.
- Keep automatic KOD image discovery unchanged when no manual relay is active.
- Make the client depend only on authenticated KOD video APIs and normalized task responses.
- Preserve current local media history, progress, cancellation, retry and error isolation.
- Render the supplied KAI wordmark cleanly in the single requested sidebar location.

**Non-Goals:**

- Adding new image or video models, changing prompts, or changing the existing manual station/node UI.
- Keeping a developer-only direct-video fallback or embedding any upstream secret.
- Replacing application, tray, installer, splash, about-page or other brand assets.
- Deploying or rotating the production upstream key from client code.

## Decisions

### 1. Build a distinct image group for the active manual relay

`useImageModelGroups` will consume the current relay selection and its enriched models. When a manual relay is active, it will construct a KOD image group whose provider id is `KOD_RELAY_PROVIDER_ID`, not `ChatboxAI`. This is essential: merely copying relay models into the automatic provider would show models but send the generation request to the wrong host/key.

The transformation from provider models to an image group will be a pure exported helper so tests can prove filtering, preferred-model ordering, provider identity and empty-state behavior without browser storage or network mocks. Automatic mode continues to use `useChatboxAIModels`; the two modes do not silently fall back into each other.

Alternative rejected: remove the manual-relay guard from `useChatboxAIModels`. That would repopulate the UI but bind the selected model to automatic KOD credentials and violate the existing station/node selection contract.

### 2. Replace direct video transport with a typed KOD video API client

The renderer video module will call `getKodApiOrigin()` and attach the current KOD access token to availability, submit, status and content requests. Wire responses will be validated before being transformed into the existing `NormalizedVideoTask` shape. The store remains responsible for local records and downloads, but server billing replaces the missing client-side consumption report; completion triggers wallet query invalidation only.

All build-time `KOD_VIDEO_API_KEY` use and direct upstream protocol detection will be removed from renderer code. The backend owns protocol selection and returns a public task id that the client can persist safely.

Alternative rejected: loading `.env.local` into Electron. Vite would still place the value into renderer bundles and the approach would not work securely for Web/iOS/Android.

### 3. Fail explicitly when the backend video capability is unavailable

The video page will preserve its current isolated error card, but errors will distinguish login, insufficient balance, unavailable backend configuration, validation, upstream failure and network failure. No failure clears unrelated provider settings or disables chat/image features.

### 4. Use the supplied SVG as a repository static asset

The provided `KAI.svg` will be copied unchanged into the renderer static assets with a stable ASCII filename. The sidebar will render that wordmark at a bounded width and auto height, remove the redundant icon plus `KOD` text, keep the existing version element, click target and responsive controls, and add an accessible `alt` label.

Alternative rejected: rasterizing the SVG. The vector source is smaller, scales correctly across desktop and high-density mobile screens, and requires no generated derivative.

### 5. Verify behavior at pure, hook and action boundaries

Tests will cover manual/automatic model grouping, correct provider id, excluded/empty models, video wire validation and auth/error mapping, completion wallet invalidation, and sidebar branding. Existing image/video action tests will be repaired only where their mocks no longer match the production import contract; unrelated baseline failures will not be folded into this change.

## Risks / Trade-offs

- [Backend and client can be deployed out of order] → Deploy backend first; the client handles an unavailable capability explicitly and has no insecure fallback.
- [A manual relay may not classify an image-looking model] → Use the existing registry enrichment at relay fetch time and show a station-specific empty message rather than guessing unsupported models.
- [A stored selected model becomes invalid after station switch] → Existing selection reconciliation chooses the first valid group/model after the relay group changes.
- [The wide KAI wordmark competes with version and collapse controls] → Bound the wordmark width responsively and test both persistent and temporary sidebar layouts.

## Migration Plan

1. Deploy and verify the paired KOD backend video proxy with a newly rotated key and complete price rules.
2. Add client regression tests, then implement manual-relay image grouping and video API transport.
3. Copy the approved KAI SVG and update only the sidebar brand slot.
4. Run targeted tests, full type checking, formatting/lint checks and desktop/Web build verification; run mobile shared-renderer build checks where available.
5. Smoke-test image generation through a manually selected relay and video submit/status/download against the configured backend using non-production test content.
6. Rollback by reverting the client commit; the backend endpoints can remain deployed or be disabled by removing their server-side enabled flag. Never restore the historical client key.
