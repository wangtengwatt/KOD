## Purpose

Let eligible buyers claim one transparent, persistent, non-redeemable card-hour reward per qualified settled source.

## ADDED Requirements

### Requirement: Dismissing a draw never consumes eligibility
The client SHALL present new eligibility in a dismissible modal and SHALL retain all pending eligibility in `抽奖中心` until the server returns a draw result.

#### Scenario: User closes the modal
- **WHEN** an eligible user closes the post-settlement lottery modal
- **THEN** the client SHALL leave the eligibility pending and show it in the lottery center

### Requirement: Draw result is server-owned and exactly once
The client MUST display the persisted rate, base, reward amount, source order or term, and non-redeemable bucket returned by the server and MUST NOT generate or reroll outcomes locally.

#### Scenario: Draw request is retried
- **WHEN** a request is repeated after timeout or reconnect
- **THEN** the client SHALL display the original persisted result instead of a new outcome
