## Context

See `proposal.md` for motivation. Commit `b8c66432632bfa688cb34eccc8e8e4981e7160c3` is already an ancestor of the local branch after an externally performed rebase. The prior local work is commit `47daf9c9a596312a218258987e079e55d9140abe`, and `backup/pre-realtime-quotes-20260824` protects the combined state. The colleague feature is a shared **simulated** market feed, not direct live Vast.ai/Akamai collection. The desktop development shortcut invokes `D:\watt\.kod-local\run-kod-full-stack.ps1`, which delegates the client launch to `D:\watt\kod\start-kod-dev.ps1`.

## Goals / Non-Goals

**Goals:**

- Treat the colleague commit as the implementation source of truth for the new market panel.
- Prove the remote feed adapter, contracts, UI states, type safety, and production build.
- Apply only test-driven repairs that are required for the colleague feature to run.
- Redirect the existing development launcher to a launch script owned by `D:\watt\kod` after verification.
- Preserve a simple, auditable rollback point.

**Non-Goals:**

- Converting the simulation into real third-party rental-market collection.
- Changing KAI/KOD logos, other compute-center features, settings, backend services, or unrelated local work.
- Rewriting the colleague architecture or adding speculative features.

## Decisions

### Keep the rebased commit order

The branch will retain `b8c6643` followed by local commit `47daf9c`. This preserves both authorship and the existing local behavior. Re-cherry-picking would duplicate the feature and manufacture conflicts, so ancestry verification replaces another cherry-pick.

### Verify the simulation contract as written

Tests and manual evidence will evaluate the configured shared simulation endpoint, explicit provenance, origin allowlist, credential omission, remote-required failure behavior, and UI rendering. Direct Vast.ai/Akamai authentication is excluded because the colleague implementation deliberately does not perform it.

### Repair only from a failing test

If a focused test or manual launch reveals a defect, add the smallest regression test that fails for that defect before changing production code. If a repair conflicts with protected local work or expands behavior beyond this specification, stop for user approval.

### Keep the verified full-stack launcher chain

Retain the stable desktop shortcut and `run-kod-full-stack.ps1` indirection so future builds do not require recreating the `.lnk`. Verify that it delegates the client launch to `D:\watt\kod\start-kod-dev.ps1`, then inspect the shortcut target and working directory. The stale, unreferenced `D:\watt\.kod-local\run-kod-latest.ps1` still targets `kod-web`; changing or deleting it is outside this task because the active shortcut does not use it. The separate SVG shortcut remains untouched.

## Risks / Trade-offs

- [The feature name can be mistaken for real third-party行情] → Keep simulation disclosure visible and report this limitation in delivery evidence.
- [The shared endpoint may be unavailable from the user's network] → Verify deterministic failure behavior and distinguish endpoint availability from client correctness.
- [The external rebase occurred before this OpenSpec was created] → Record exact commit ancestry and use the protected backup branch; do not rewrite history merely to recreate process order.
- [Launcher changes can start stale code] → Resolve every target path and perform a desktop-launch smoke test only after build verification.
- [Full repository tests may include known baseline failures] → Run focused suites first, then classify full-suite failures against the existing baseline specification without hiding new regressions.

## Migration Plan

1. Validate commit ancestry, clean worktree, and backup branch.
2. Run focused tests for the colleague market modules and route integration.
3. Run type, changed-file lint, broader regression, and production build checks.
4. If failures identify a product defect, follow RED-GREEN-REFACTOR and re-run the gates.
5. Verify the stable full-stack launcher chain resolves to `D:\watt\kod` and perform a bounded startup smoke test.
6. Roll back by restoring the launcher script and resetting a new recovery branch to `backup/pre-realtime-quotes-20260824`; never discard user work in place.
