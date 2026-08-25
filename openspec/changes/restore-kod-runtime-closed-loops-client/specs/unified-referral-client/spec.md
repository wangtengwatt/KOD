## Purpose

Provide one clear invitation experience that tracks email registration referrals and their non-redeemable card-hour rewards without duplicating legacy commission navigation.

## ADDED Requirements

### Requirement: Invitation uses one sidebar entry
The client SHALL expose a single `邀请好友` sidebar entry and MUST NOT expose a separate user-facing `历史邀请佣金` entry for the same referral intent.

#### Scenario: User opens invitation tools
- **WHEN** the user selects `邀请好友`
- **THEN** one drawer provides email input, copyable registration links, invitation tracking, and reward receipt history

### Requirement: Invitation states are distinguishable
The client SHALL show persisted invitation status with neutral or gray pending styling, green accepted styling, and red failed or expired styling with a safe reason when available.

#### Scenario: Invited email registers KOD
- **WHEN** the official service reports the invitation accepted and the inviter reward credited
- **THEN** the row becomes green `已接受`, the wallet refreshes, and the inviter sees `10 卡时已到账`
