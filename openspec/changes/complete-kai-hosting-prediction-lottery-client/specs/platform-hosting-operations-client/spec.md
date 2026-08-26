## Purpose

Give administrators and hosting users one understandable desktop workflow for KAI inventory, monthly cost, automatic listing, and exact downstream income.

## ADDED Requirements

### Requirement: Administrator can manage platform server inventory
The client SHALL expose platform SKU listing and idempotent create/update controls only inside the existing authenticated compute administrator workspace. It SHALL consume the server-returned allocated inventory as authoritative and SHALL validate administrator SKU inputs against the server code and Java-integer boundaries before sending a request.

The public platform SKU decoder SHALL accept `id`, `monthlyRent`, and `platformSalePrice` only as backend strings. It SHALL preserve legal positive 19-digit identifiers and nonnegative DECIMAL(20,3) strings through rendering without numeric coercion, including the maximum 17-whole-digit and 3-fraction-digit boundary, and SHALL reject numeric JSON values for those fields.

#### Scenario: Administrator saves inventory
- **WHEN** an administrator submits valid server specifications, prices, inventory, and status
- **THEN** the client SHALL normalize and validate the SKU code, display the server-returned total, allocated, and available inventory without calculating allocation locally, and confirm only that the server accepted and returned the latest configuration

#### Scenario: Public inventory contains exact large values
- **WHEN** the backend returns a string SKU ID and legal DECIMAL(20,3) monthly rent and sale price at the contract boundary
- **THEN** the client SHALL retain and render the original strings and SHALL reject number-typed variants

### Requirement: Hosting user can reconcile cost and income
The client SHALL show monthly rent periods, settled and pending order income, platform fee, net income, renewal, and exit status for each lease. Expanded lease details SHALL refresh every ten seconds while visible and SHALL stop polling when collapsed or unmounted.

#### Scenario: Downstream order settles
- **WHEN** the server reports a settled order-income event for a hosted product
- **THEN** the lease view SHALL show immutable order snapshots and refresh the redeemable-income summary

#### Scenario: An expanded pending income settles
- **WHEN** an expanded lease detail first reports `PENDING` and a later ten-second refresh reports `SETTLED`
- **THEN** the visible status and exact settled totals SHALL update, and collapsing the detail SHALL stop further polling
