## Context

The client already treats inference identifiers and decimals as strings, but three Zod schemas impose narrower bounds than the authoritative feed and repaired backend. The visual component already renders those strings directly, so the smallest safe change is contract-only unless a test proves a coercion path.

## Decisions

### One canonical decimal schema family

Unsigned price and positive quantity SHALL use fixed-point strings with normalized precision at most 38 and scale at most 18. Exact signed price error SHALL use normalized precision at most 56 and scale at most 18 so subtraction is closed over the accepted price domain. Exponent notation, plus signs, leading zeroes, trailing decimal points, JSON numbers, negative unsigned values, zero quantities, and negative zero SHALL remain invalid. The original server-provided canonical string SHALL be retained and displayed unchanged.

### Scope remains inference-only

No quote, wallet, order, hosting, lottery, payment, video, branding, or local-demo schema changes are authorized. No renderer call may target the colleague or Kai upstream directly. Existing cancellation, owner identity, 15-second deadline, directory authority, and quote-trigger behavior remain unchanged.

## Risks / Trade-offs

- Wider accepted strings require exact boundary tests so malformed large values do not enter the UI.
- The component may display longer values; existing compact text wrapping must remain usable without altering the surrounding green/white design.

## Rollback

Revert the isolated client commit together with the coordinated backend commit if the new backend is not deployed. No local or remote user data is migrated by this client change.
