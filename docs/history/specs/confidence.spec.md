# Confidence Spec

## 1. Purpose

Define the implementation contract for the Confidence subsystem.

The Confidence subsystem implements the Construction Brain knowledge required to evaluate object confidence, completion, review status, and blocking status throughout the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Confidence subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for confidence
- Producing Confidence schema instances
- Producing the Confidence Artifact
- Evaluating object-level confidence
- Evaluating takeoff-level confidence
- Evaluating completion status
- Evaluating review status
- Evaluating blocking status
- Preserving confidence traceability
- Providing confidence outputs for final framing takeoff reporting

The Confidence subsystem owns confidence evaluation, completion evaluation, review status evaluation, blocking status evaluation, and confidence traceability.

It does not own construction objects, assumptions, validation results, or calculations.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Wall Framing Artifact
- Floor Framing Artifact
- Roof Framing Artifact
- Openings Artifact
- Structural Members Artifact
- Sheathing Artifact
- Blocking Artifact
- Connectors & Hardware Artifact
- Assumptions Artifact
- Validation Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Confidence Artifact

The Confidence Artifact contains Confidence schema instances and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `12-confidence-rules.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `10-assumptions.md`
- `11-validation-rules.md`

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
- validation.spec.md

### Used By

- None

---

## 8. Required Implementation Components

### Schemas

- Confidence Schema

### Artifacts

- Confidence Artifact

### Validators

- None

### Calculators

- Confidence Evaluator

### Claude Prompts

- None

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for confidence
- Produce valid Confidence schema instances
- Produce the Confidence Artifact
- Evaluate object-level confidence
- Evaluate takeoff-level confidence
- Evaluate completion independently from confidence
- Evaluate review status independently from confidence
- Evaluate blocking status independently from confidence
- Preserve confidence traceability
- Integrate correctly with upstream subsystem dependencies
- Preserve deterministic execution through artifacts

---

## 10. Out of Scope

This subsystem does not implement:

- Construction object extraction
- Construction object resolution
- Material calculations
- Assumption rule definitions
- Validation rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.