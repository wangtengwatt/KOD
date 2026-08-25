## Purpose

Allow eligible users to play the server-managed KOD promotional advertisement reliably and receive one verified ten-card-hour reward per Shanghai day.

## ADDED Requirements

### Requirement: Server-managed advertisement is playable
The client SHALL load the active campaign's same-origin media URL, MIME type, actual duration, minimum watch duration, and poster from the server and SHALL expose loading, retry, and unavailable states.

#### Scenario: Initial KOD promotional campaign is active
- **WHEN** the campaign references the approved KOD promotional video and the media endpoint supports playback
- **THEN** the client can start, seek only as permitted by the media element, recover from ordinary buffering, and reach the natural end without a black placeholder

### Requirement: Reward follows verified complete viewing
The client MUST NOT announce or locally credit a reward until the authenticated server accepts progress, completion, and claim for the current account.

#### Scenario: Eligible user completes the advertisement
- **WHEN** the server verifies the required playback progress and accepts the day's claim
- **THEN** the client refreshes the current account and displays `10 卡时已到账` with the non-redeemable restriction
