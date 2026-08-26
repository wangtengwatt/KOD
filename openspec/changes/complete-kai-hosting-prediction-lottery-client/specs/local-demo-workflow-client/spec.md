## Purpose

Allow repeatable manual demonstration of the full workflow locally without exposing demo identity or data controls to production.

## ADDED Requirements

### Requirement: Demo role switching requires loopback and server capability
The client SHALL render administrator, hosting-tenant, and buyer demo roles only when the configured API is loopback and the server explicitly reports guarded demo mode.

#### Scenario: Production server claims demo capability accidentally
- **WHEN** the API origin is not loopback
- **THEN** the client MUST hide and reject demo role switching regardless of the capability response

### Requirement: Demo sessions are strict and currently usable
The client SHALL accept a local demo session only when the raw response contains exactly the string fields `token`, `accountId`, and `expiresAt`, the account ID is a positive bounded digit string, and the expiry parses to an instant later than the renderer's current time. The client MUST reject an expired response independently from rejecting an extra refresh token.

#### Scenario: The loopback server returns an expired session
- **WHEN** an otherwise strict demo session has `expiresAt` at or before the renderer's current time
- **THEN** the client SHALL reject the session and SHALL NOT install it as the current account

### Requirement: Guarded demo state is visible and server-owned
After both loopback-origin and affirmative capability guards succeed, the client SHALL load raw `GET /api/compute/local-demo/scenario` and SHALL offer an idempotent raw `POST /api/compute/local-demo/scenario/run`. It SHALL strictly decode the backend scenario record and display its stage, reconciliation flag, account and source IDs, monthly rent, sale price, settled income, buyer reward, tenant reward, and available inventory without deriving substitute values.

#### Scenario: A completed scenario is reconciled
- **WHEN** the run endpoint returns stage `COMPLETED` with `reconciled: true`
- **THEN** the client SHALL visibly show `COMPLETED`, the reconciliation result, exact decimal strings, exact IDs, and authoritative inventory

#### Scenario: The run control is activated repeatedly
- **WHEN** the user activates the scenario run control while a run request is pending or after completion
- **THEN** the client SHALL keep at most one request in flight and SHALL display the idempotent server response rather than creating local progress or values

### Requirement: Role cleanup cannot delete the newly installed role
A local demo role switch SHALL cancel and remove the previous owner's compute and wallet queries before installing the new access-only session. After awaited cleanup, the client SHALL re-check the captured owner and generation; an external account change SHALL remain authoritative.

#### Scenario: Old-owner cancellation is deferred
- **WHEN** old compute and wallet cancellation completes after the demo session response is available
- **THEN** the old session SHALL remain installed until cleanup finishes, then the new role SHALL mount and its successful account query SHALL remain cached

#### Scenario: An external account wins during cleanup
- **WHEN** an external account is installed before old-owner cleanup completes
- **THEN** the client SHALL neither install the stale demo session nor remove the external account's queries
