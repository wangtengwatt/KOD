## 1. Regression Baseline and TDD

- [ ] 1.1 Run and record the current targeted image/video/sidebar tests and type-check baseline without changing production code.
- [ ] 1.2 Add a failing pure test proving a manual relay image model is exposed under `KOD_RELAY_PROVIDER_ID`, excluded models are filtered, and an image-less relay does not fall back silently.
- [ ] 1.3 Add failing video API/action tests proving requests use the authenticated KOD origin, normalized responses drive local records, and no renderer upstream key/direct URL is used.
- [ ] 1.4 Add a failing sidebar rendering test for the KAI wordmark, preserved version text and About navigation target.

## 2. Restore Image Model Discovery

- [ ] 2.1 Add the pure manual-relay image group builder and integrate current relay state into `useImageModelGroups` while keeping automatic mode unchanged.
- [ ] 2.2 Make the image creator reconcile provider/model selection after relay changes and show a station-specific empty message when the active relay has no image model.
- [ ] 2.3 Verify direct image generation receives the selected relay provider/model and repair only stale media test mocks required to exercise that behavior.

## 3. Move Video Calls to the KOD Backend

- [ ] 3.1 Implement a typed video proxy client for availability, submit, task status and authenticated content download using `getKodApiOrigin()` and the current access token.
- [ ] 3.2 Replace direct upstream protocol/key use in video generation actions with the proxy client while preserving local history, progress, retry, cancellation and wallet refresh.
- [ ] 3.3 Remove renderer/build definitions and code paths for `KOD_VIDEO_API_KEY`, prevent direct-video fallback, and map backend errors to concise Simplified Chinese feedback.
- [ ] 3.4 Run the video RED tests to GREEN and verify a failed video task cannot clear auth/provider state or disrupt chat/image features.

## 4. Update the Sidebar Logo

- [ ] 4.1 Copy `C:/Users/Microsoft/Downloads/KAI.svg` unchanged to a stable renderer static asset path and verify it contains no external resource reference or script.
- [ ] 4.2 Replace only the sidebar icon plus `KOD` text with the responsive KAI wordmark while preserving version, collapse controls, accessibility and About navigation.
- [ ] 4.3 Run the branding RED test to GREEN and visually inspect persistent desktop and temporary mobile sidebar layouts.

## 5. Verification and Delivery

- [ ] 5.1 Run targeted image, video, relay and sidebar tests, then run the full client type check and changed-file Biome checks.
- [ ] 5.2 Build the desktop and Web shared renderer and run available iOS/Android shared-renderer build checks without embedding an upstream credential.
- [ ] 5.3 Scan source and built renderer assets for video API keys/direct upstream authorization and verify only authenticated KOD backend URLs remain.
- [ ] 5.4 After the paired backend is configured, perform read-limited smoke verification of manual-relay image model discovery and one low-cost video submit/status/download flow.
- [ ] 5.5 Run `openspec validate restore-kod-media-generation-and-logo --strict`, review the diff for unrelated behavior changes, and record the verified result before commit/push.
