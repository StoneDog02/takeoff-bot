# Validation Spec

## 1. Purpose

Define the implementation contract for the Validation subsystem.

The Validation subsystem implements the Construction Brain knowledge required to validate framing artifacts throughout the pipeline and produce validation outputs for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Validation subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for validation
- Producing Validation Issue schema instances
- Producing Validation Result schema instances
- Producing the Validation Artifact
- Coordinating validation across framing pipeline stages
- Preserving validation traceability to affected objects and source evidence
- Assigning validation severity and affected calculation scope
- Producing actionable review items from validation issues
- Providing validation outputs for confidence evaluation and final takeoff aggregation

The Validation subsystem owns validation issue identity, severity, affected-object relationships, calculation impact, and review-item relationships.

It does not own or silently modify validated construction objects.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Extracted Framing Evidence Artifact
- Wall Framing Artifact
- Floor Framing Artifact
- Roof Framing Artifact
- Openings Artifact
- Structural Members Artifact
- Sheathing Artifact
- Blocking Artifact
- Connectors & Hardware Artifact
- Assumptions Artifact
- User Decisions Artifact
- Calculation artifacts produced by the framing pipeline
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Validation Artifact

The Validation Artifact contains Validation Issue schema instances, Validation Result schema instances, generated review-item relationships, and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `11-validation-rules.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `01-scope-definition.md`
- `02-plan-verification.md`
- `03-plan-reading-order.md`
- `04-building-assemblies.md`
- `05-wall-identification.md`
- `06-wall-types.md`
- `07-openings.md`
- `08-structural-members.md`
- `09-material-taxonomy.md`
- `10-assumptions.md`
- `12-confidence-rules.md`

Construction behavior is defined by these knowledge files and must not be duplicated within this specification.

---

## 7. Subsystem Dependencies

### Depends On

- framing-scope.spec.md
- wall-framing.spec.md
- floor-framing.spec.md
- roof-framing.spec.md
- openings.spec.md
- structural-members.spec.md
- sheathing.spec.md
- blocking.spec.md
- connectors-hardware.spec.md
- assumptions.spec.md

### Used By

- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Validation Issue Schema
- Validation Result Schema

### Artifacts

- Validation Artifact

### Validators

- Validation Coordinator
- Framing Scope Validator
- Cross-Artifact Validator
- Calculation Validator
- Output Validator

### Calculators

- None

### Claude Prompts

- None

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for validation
- Produce valid Validation Issue schema instances
- Produce valid Validation Result schema instances
- Produce the Validation Artifact
- Execute validation throughout the framing pipeline
- Validate individual objects and relationships across artifacts
- Preserve source and affected-object traceability
- Limit blocking behavior to affected calculation areas when possible
- Produce actionable review items
- Preserve unresolved objects and conflicts without silently modifying them
- Integrate correctly with confidence evaluation and final framing aggregation

---

## 10. Out of Scope

This subsystem does not implement:

- Construction object extraction
- Construction object resolution
- Material calculations
- Assumption rule definitions
- Confidence rule definitions
- Automatic repair of conflicting construction information
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.