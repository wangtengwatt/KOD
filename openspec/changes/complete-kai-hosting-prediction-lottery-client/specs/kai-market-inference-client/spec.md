## Purpose

Present Kai prediction and risk analysis as a clearly labeled, failure-tolerant supplement to real GPU market data.

## ADDED Requirements

### Requirement: Prediction targets come from the authenticated real-contract directory
The client SHALL load `GET /api/compute/market/inference/contracts` through the authenticated same-origin backend and SHALL accept only strict entries containing the string fields `contractId`, `name`, `model`, `gpuModel`, `runtime`, `deliveryAt`, and `status`. It SHALL filter entries by the currently selected GPU model, preserve server order, default to the first matching entry whose status is exactly `trading`, and provide a compact `预测合约` selector when matching entries exist. The client MUST NOT use a GPU model name or a hard-coded upstream identifier as a contract ID.

#### Scenario: Multiple real contracts match the selected GPU model
- **WHEN** the directory returns multiple H100 contracts and at least one has status `trading`
- **THEN** the client SHALL select the first matching `trading` contract in server order and allow the user to switch to another matching contract

#### Scenario: Contract discovery is unavailable or has no matching contract
- **WHEN** the directory request fails, returns an invalid strict payload, or contains no contract matching the selected GPU model
- **THEN** inference SHALL fail closed without making a prediction GET or refresh POST, while realtime quotes and their retry lifecycle SHALL remain usable

### Requirement: Realtime market shows cached inference independently from quotes
The client SHALL show prediction, risk state, model, generation time, data freshness, and next-trade verification without changing the authoritative quote panel.

The inference query key SHALL include the stable wallet identity and selected real contract ID. Its query function SHALL consume the TanStack cancellation signal. Successful realtime quote refreshes SHALL request the backend refresh endpoint only for the selected real contract; the client SHALL NOT implement the 60-second or fingerprint decision locally.

#### Scenario: Account, route, model, or contract changes during a request
- **WHEN** the request owner changes before a contract-directory, inference-read, or inference-refresh response completes
- **THEN** the client SHALL cancel or ignore that response and SHALL NOT display it under the new owner or selection

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
