## Purpose

Provide a verifiable compute-market intelligence experience that consumes the shared server-owned simulated feed while clearly distinguishing it from real third-party rental quotes or executable trades.

## ADDED Requirements

### Requirement: Shared simulated market feed is the default market-intelligence source
The client SHALL display the market-intelligence panel at the existing compute-center real-time market entry and SHALL request the shared server-owned simulation feed by default.

#### Scenario: Market panel loads shared data
- **WHEN** the user opens the real-time market entry and the configured shared feed returns valid contracts and dashboards
- **THEN** the panel displays the returned market snapshots, history, and activity using the feed's update cadence

### Requirement: Simulated provenance is explicit
The client MUST label the new market data as simulated demonstration data and MUST NOT present it as live Vast.ai, Akamai, or other third-party rental inventory.

#### Scenario: User reviews market provenance
- **WHEN** the new market-intelligence panel is visible
- **THEN** the panel displays an explicit simulation disclosure and disables market write or order execution behavior

### Requirement: Remote feed configuration is constrained
Production clients MUST accept only the configured HTTPS feed origin and MUST omit credentials when requesting public market data.

#### Scenario: Unsafe feed origin is configured
- **WHEN** the configured feed URL contains credentials, query data, fragments, an unapproved origin, or a non-HTTPS remote scheme
- **THEN** the client rejects the configuration and does not issue the request

### Requirement: Required remote failures are visible
When the remote feed is required, the client SHALL surface an unavailable state rather than silently replacing failed remote data with per-device generated fallback values.

#### Scenario: Shared feed cannot be loaded
- **WHEN** the required remote endpoint is unavailable, invalid, empty, or times out
- **THEN** the panel exposes a deterministic unavailable/error state without presenting generated fallback values as remote observations

### Requirement: Existing local work and branding remain intact
Integration SHALL preserve the local commit layered above the colleague change and MUST NOT modify KAI/KOD logo or unrelated settings and compute-center behavior.

#### Scenario: Integration scope is reviewed
- **WHEN** the final diff is compared with the protected checkpoint
- **THEN** changes are limited to approved market verification or repair, OpenSpec artifacts, and launcher delivery files, with no logo changes

### Requirement: Desktop launcher starts the verified local client
After verification, the existing KOD development desktop shortcut SHALL start the client from `D:\watt\kod` using the verified local launch chain.

#### Scenario: User starts manual testing from the desktop
- **WHEN** the user activates `KOD蒜粒-开发版.lnk`
- **THEN** the launcher starts the current `D:\watt\kod` client and records startup failure information in the existing local launcher log
