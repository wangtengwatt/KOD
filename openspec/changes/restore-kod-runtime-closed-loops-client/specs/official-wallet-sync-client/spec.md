## Purpose

Ensure the desktop client renders the authenticated official KOD account's wallet, card-hour buckets, and recharge records without stale or cross-account data.

## ADDED Requirements

### Requirement: Official account data is authoritative
The client SHALL display wallet balance, card-hour buckets, and recharge history returned by the authenticated official service and MUST NOT use local placeholder values as successful official data.

#### Scenario: User refreshes official data
- **WHEN** an authenticated user opens the wallet or compute center, returns from recharge, restores the window, or selects refresh
- **THEN** the client requests the current account's official wallet, card-hour, and recharge data and renders the latest successful response

### Requirement: Remote data is isolated by account
The client MUST bind cached queries, retries, token refreshes, and asynchronous response commits to the originating account identity.

#### Scenario: Account changes during a request
- **WHEN** account A starts a request and the user switches to account B before the response or authentication retry completes
- **THEN** account A's request is not replayed with B's credentials and its response is not displayed or stored as B's data

### Requirement: Exact identifiers and balances are preserved
The client SHALL decode identifiers that may exceed JavaScript's safe integer range and exact wallet or card-hour amounts as decimal strings before comparison or formatting.

#### Scenario: Service returns a 19-digit identifier
- **WHEN** an official response contains a 19-digit account, order, invitation, lease, node, product, or actor identifier
- **THEN** the client preserves every digit and uses the exact string for ownership and cache decisions

### Requirement: Transient failures do not destroy the session
The client SHALL clear authentication only after a definitive unauthenticated response and SHALL expose retryable errors for network, timeout, server, or schema failures.

#### Scenario: Recharge history response is temporarily invalid
- **WHEN** balance loading succeeds but recharge history times out or fails contract validation
- **THEN** the user remains signed in, sees an explicit history error with retry, and does not see another account's cached records
