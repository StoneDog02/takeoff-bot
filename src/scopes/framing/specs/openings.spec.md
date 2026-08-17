# Openings Spec

## 1. Purpose

Define the implementation contract for the Openings subsystem.

The Openings subsystem implements the Construction Brain knowledge required to resolve canonical Opening objects and produce opening artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Openings subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for framed openings
- Producing canonical Opening schema instances
- Producing the Openings Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for openings
- Providing opening artifacts for downstream framing subsystems

The Openings subsystem owns opening identity, geometry, classification, and relationships.

It does not own framing members created because of openings.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Wall Framing Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Openings Artifact

The Openings Artifact contains Opening schema instances and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `07-openings.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `04-building-assemblies.md`
- `05-wall-identification.md`
- `06-wall-types.md`
- `08-structural-members.md`
- `09-material-taxonomy.md`
- `10-assumptions.md`
- `11-validation-rules.md`
- `12-confidence-rules.md`

Construction behavior is defined by these knowledge files and must not be duplicated within this specification.

---

## 7. Subsystem Dependencies

### Depends On

- framing-scope.spec.md
- wall-framing.spec.md

### Used By

- structural-members.spec.md
- sheathing.spec.md
- blocking.spec.md
- connectors-hardware.spec.md
- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Opening Schema

### Artifacts

- Openings Artifact

### Validators

- Openings Validator

### Calculators

- Opening Resolver

### Claude Prompts

- Opening Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for openings
- Produce valid Opening schema instances
- Produce the Openings Artifact
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Surface review items rather than unresolved guesses

---

## 10. Out of Scope

This subsystem does not implement:

- Wall framing
- Floor framing
- Roof framing
- Structural member calculations
- Sheathing calculations
- Blocking calculations
- Connector calculations
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.