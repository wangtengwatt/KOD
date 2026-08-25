## Purpose

Present Kai prediction and risk analysis as a clearly labeled, failure-tolerant supplement to real GPU market data.

## ADDED Requirements

### Requirement: Realtime market shows cached inference independently from quotes
The client SHALL show prediction, risk state, model, generation time, data freshness, and next-trade verification without changing the authoritative quote panel.

#### Scenario: Inference service is unavailable after a success
- **WHEN** the server returns an unavailable state with a prior successful snapshot
- **THEN** the client SHALL keep that snapshot, mark it stale/unavailable, and continue showing live market quotes

### Requirement: AI output never implies execution authority
The client SHALL label inference as informational and MUST NOT create orders, alter prices, or claim guaranteed returns from a prediction.

#### Scenario: Model predicts a buy event
- **WHEN** the inference answer predicts BUY
- **THEN** the client SHALL display the text and verification status only and SHALL perform no trade action

### Requirement: Unverifiable predictions do not invent actual trades
The client SHALL accept `UNVERIFIABLE` only as the strict status payload containing `status` and `inferenceId`, and SHALL NOT display actual-trade fields for that state.

#### Scenario: A prediction cannot be verified against a real trade
- **WHEN** the server returns `UNVERIFIABLE` because the prediction is unstructured or its source trade is outside the verification window
- **THEN** the client SHALL show the unverifiable state and target inference ID without claiming that a real trade arrived
