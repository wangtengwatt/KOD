## Purpose

Present Kai prediction and risk analysis as a clearly labeled, failure-tolerant supplement to real GPU market data.

## ADDED Requirements

### Requirement: Prediction targets come from the authenticated real-contract directory
The client SHALL load `GET /api/compute/market/inference/contracts` through the authenticated same-origin backend and SHALL accept only strict entries containing the string fields `contractId`, `name`, `model`, `gpuModel`, `runtime`, `deliveryAt`, and `status`. It SHALL filter entries by the currently selected GPU model, preserve server order, default to the first matching entry whose status is exactly `trading`, and provide a compact `预测合约` selector when matching entries exist. The client MUST NOT use a GPU model name or a hard-coded upstream identifier as a contract ID. A failed background directory refresh SHALL revoke request authority even when cached entries remain available for display; inference reads and refreshes SHALL resume only after a successful directory retry.

#### Scenario: Multiple real contracts match the selected GPU model
- **WHEN** the directory returns multiple H100 contracts and at least one has status `trading`
- **THEN** the client SHALL select the first matching `trading` contract in server order and allow the user to switch to another matching contract

#### Scenario: Contract discovery is unavailable or has no matching contract
- **WHEN** the directory request fails, returns an invalid strict payload, or contains no contract matching the selected GPU model
- **THEN** inference SHALL fail closed without making a prediction GET or refresh POST, while realtime quotes and their retry lifecycle SHALL remain usable; an initial directory failure SHALL offer a manual directory retry

#### Scenario: A cached directory loses authority
- **WHEN** a contract directory previously succeeded but a later background directory refresh fails
- **THEN** the client SHALL keep the selected contract and last inference visible as read-only cached data, disable contract and refresh actions, make no inference GET or POST during quote ticks or manual actions, and restore those actions only after an explicit directory retry succeeds

### Requirement: Realtime market shows cached inference independently from quotes
The client SHALL show prediction, risk state, model, generation time, data freshness, and next-trade verification without changing the authoritative quote panel.

The inference query key SHALL include the stable wallet identity and selected real contract ID. Its query function SHALL consume the TanStack cancellation signal. Successful realtime quote refreshes SHALL request the backend refresh endpoint only for the selected real contract; the client SHALL NOT implement the 60-second or fingerprint decision locally.

Contract-directory, inference-read, and inference-refresh requests SHALL compose caller cancellation with a client hard deadline of 15 seconds, SHALL abort the underlying request at that deadline, and SHALL expose only a sanitized unavailable error. Refresh POSTs SHALL be single-flight per wallet-and-contract owner: repeated quote ticks or manual refreshes while one POST is pending SHALL reuse or ignore that request rather than cancelling and restarting it. Before starting a POST, the client SHALL cancel any older same-owner GET so that a late read cannot overwrite the POST result. A newly mounted or changed wallet/contract owner SHALL treat the current quote timestamp as its baseline and SHALL refresh inference only after a strictly newer successful quote update. Leaving and later returning to the same wallet-and-contract pair SHALL create a new owner lifecycle rather than reviving pending or failed UI state from the earlier visit.

#### Scenario: Account, route, model, or contract changes during a request
- **WHEN** the request owner changes before a contract-directory, inference-read, or inference-refresh response completes
- **THEN** the client SHALL cancel or ignore that response and SHALL NOT display it under the new owner or selection

#### Scenario: Inference transport stalls
- **WHEN** an inference request does not resolve or honor cancellation before 15 seconds
- **THEN** the client SHALL abort the network request, settle locally with a sanitized unavailable state, and keep realtime quotes usable

#### Scenario: Quote updates while a refresh is pending
- **WHEN** one wallet-and-contract refresh POST is pending and further quote updates or manual refresh actions occur
- **THEN** the client SHALL keep exactly one POST in flight and SHALL apply its eventual result only to that same owner

#### Scenario: An older same-owner read finishes after a refresh
- **WHEN** an inference GET is pending and a same-owner refresh POST completes before that GET
- **THEN** the POST result SHALL remain authoritative and the late GET SHALL NOT overwrite it

#### Scenario: A wallet owner leaves and returns
- **WHEN** wallet A has a pending refresh, the renderer switches to wallet B, and later returns to wallet A without a new quote
- **THEN** the old A request SHALL remain cancelled and ignored, A's refresh control SHALL not inherit the old pending state, and one new manual refresh SHALL be allowed for the new A lifecycle

#### Scenario: Cached quote data is present for a new owner
- **WHEN** the component mounts, wallet changes, or contract changes while an existing quote timestamp is cached
- **THEN** the cached timestamp SHALL NOT trigger a refresh POST; only a strictly newer successful quote update SHALL arm one

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
