## Why

The full test suite on the current `xcx_KOD` history has nine failures outside the Windows launcher surface. Mixing those behavior changes into the launcher repair would make the dependency fix unsafe and difficult to review.

## What Changes

- Align default-language tests with the product's Simplified Chinese default.
- Repair Windows path portability in skill discovery tests.
- Update stale relay/provider, image generation, migration, and web-search test contracts without weakening production safeguards.
- Keep this work separate from `fix-windows-dev-launcher-dependencies`.

## Capabilities

### New Capabilities

- `stable-test-baseline`: The repository test suite reflects the intended KOD behavior on Windows.

## Impact

Affected tests currently include `defaults`, skill discovery, ChatboxAI relay behavior, image generation actions, migration initialization, and session web-search tool construction. No production behavior is authorized by this proposal until each mismatch is independently diagnosed and specified.
