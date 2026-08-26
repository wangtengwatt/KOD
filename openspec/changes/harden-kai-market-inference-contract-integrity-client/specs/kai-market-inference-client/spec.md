## Purpose

Decode and display the authoritative Kai inference decimal domain without precision loss or numeric coercion.

## ADDED Requirements

### Requirement: Prediction and verification decimals remain exact strings
The client SHALL accept predicted price/quantity and verified actual price/quantity only as canonical fixed-point strings with normalized precision at most 38 and scale at most 18. It SHALL accept exact signed price error with normalized precision at most 56 and scale at most 18. It SHALL preserve and render the exact string supplied by the backend and SHALL NOT convert through JavaScript `number`, exponent notation, locale formatting, or rounding. Price SHALL remain non-negative, quantity SHALL remain positive, and signed price error SHALL reject negative zero.

#### Scenario: Backend returns a valid high-precision successor
- **WHEN** a prediction or completed verification contains valid precision-38/scale-18 price or quantity strings, including an exact signed error requiring precision 56 / scale 18
- **THEN** strict decoding SHALL succeed and the card SHALL display those exact strings without truncation or rounding

#### Scenario: Decimal payload is numeric or noncanonical
- **WHEN** any inference decimal is a JSON number, exponent string, over-precision/over-scale string, negative unsigned value, zero quantity, leading-zero value, or negative zero error
- **THEN** strict decoding SHALL fail closed and SHALL NOT display a rounded or coerced value
