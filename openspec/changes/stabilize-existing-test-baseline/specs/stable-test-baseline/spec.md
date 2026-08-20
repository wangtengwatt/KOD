## ADDED Requirements

### Requirement: Full tests represent approved KOD behavior on Windows

The repository SHALL provide a deterministic Windows test baseline whose assertions match approved KOD product behavior and whose mocks expose every dependency used by the unit under test.

#### Scenario: Platform-specific path representation

- **WHEN** a path-producing unit is tested on Windows
- **THEN** the assertion normalizes platform separators without weakening ownership or traversal checks

#### Scenario: KOD-specific default or relay behavior differs from upstream

- **WHEN** KOD intentionally changes an upstream default or disables an upstream fallback
- **THEN** the test asserts the approved KOD behavior instead of restoring obsolete Chatbox behavior

#### Scenario: Unit mocks fall behind implementation dependencies

- **WHEN** a unit begins using a new imported dependency
- **THEN** its test mock supplies the dependency and continues verifying the business result rather than failing at mock-module resolution
