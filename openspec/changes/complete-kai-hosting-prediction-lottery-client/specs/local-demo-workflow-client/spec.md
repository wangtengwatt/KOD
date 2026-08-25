## Purpose

Allow repeatable manual demonstration of the full workflow locally without exposing demo identity or data controls to production.

## ADDED Requirements

### Requirement: Demo role switching requires loopback and server capability
The client SHALL render administrator, hosting-tenant, and buyer demo roles only when the configured API is loopback and the server explicitly reports guarded demo mode.

#### Scenario: Production server claims demo capability accidentally
- **WHEN** the API origin is not loopback
- **THEN** the client MUST hide and reject demo role switching regardless of the capability response
