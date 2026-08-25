## Purpose

Give users a concise monthly KAI server rental and resale workflow with platform pricing, automatic listing, visible income, and controlled renewal or exit.

## ADDED Requirements

### Requirement: User can rent and automatically list a KAI server
The client SHALL present available platform server SKUs, redeemable-card-hour monthly rent, platform-controlled resale price, and a single confirmation that requests rent plus automatic hosting activation.

#### Scenario: Monthly hosting starts
- **WHEN** the current account has sufficient redeemable card hours and confirms an available SKU
- **THEN** the client displays the server lease, hosted node, marketplace listing, current term, and enabled auto-renew state returned by the server

### Requirement: Reward card hours cannot fund hosting
The client SHALL display redeemable card hours as the hosting payment capacity and MUST NOT include advertisement or referral reward card hours in that capacity.

#### Scenario: Total balance is sufficient but redeemable balance is not
- **WHEN** reward plus redeemable card hours cover rent but redeemable card hours alone do not
- **THEN** the client prevents confirmation and explains that reward card hours cannot pay hosting rent

### Requirement: Hosting lifecycle and income are visible
The client SHALL show listing status, cumulative redeemable income, next renewal, renewal control, and drain-before-exit progress using server-owned states.

#### Scenario: User disables auto-renew
- **WHEN** the user turns off auto-renew
- **THEN** the client shows that the current term remains active, new orders stop at expiry, and delisting occurs after existing obligations drain
