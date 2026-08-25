## Purpose

Expose the colleague-authored shared read-only market experience through the official KOD production origin while retaining its contracts, units, provenance, and failures.

## ADDED Requirements

### Requirement: Colleague market behavior remains authoritative
The client SHALL use the market adapter, versioned contracts, display units, update cadence, provenance, and unavailable states supplied by colleague commit `b8c66432632bfa688cb34eccc8e8e4981e7160c3`.

#### Scenario: Shared market service is available
- **WHEN** the user opens real-time market and the official proxy returns valid colleague-contract data
- **THEN** the client renders snapshots, dashboards, history, and activity using the colleague implementation without substituting a redesigned data model

### Requirement: Production market access is constrained and transparent
The client MUST use an approved HTTPS KOD origin for public market reads, MUST omit user credentials, and MUST show a deterministic unavailable state instead of presenting local generated data as a remote observation.

#### Scenario: Official market proxy is unavailable
- **WHEN** HTTP or WebSocket market routes fail, time out, or return an unsupported schema
- **THEN** the client shows the colleague-defined retryable unavailable state and preserves the required provenance disclosure
