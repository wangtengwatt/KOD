## Purpose

Give administrators and hosting users one understandable desktop workflow for KAI inventory, monthly cost, automatic listing, and exact downstream income.

## ADDED Requirements

### Requirement: Administrator can manage platform server inventory
The client SHALL expose platform SKU listing and idempotent create/update controls only inside the existing authenticated compute administrator workspace.

#### Scenario: Administrator saves inventory
- **WHEN** an administrator submits valid server specifications, prices, inventory, and status
- **THEN** the client SHALL display the server-returned total and available inventory plus audit confirmation without calculating allocation locally

### Requirement: Hosting user can reconcile cost and income
The client SHALL show monthly rent periods, settled and pending order income, platform fee, net income, renewal, and exit status for each lease.

#### Scenario: Downstream order settles
- **WHEN** the server reports a settled order-income event for a hosted product
- **THEN** the lease view SHALL show immutable order snapshots and refresh the redeemable-income summary
