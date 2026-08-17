# Sheathing Spec

## 1. Purpose

Define the implementation contract for the Sheathing subsystem.

The Sheathing subsystem implements the Construction Brain knowledge required to resolve structural sheathing systems and produce sheathing artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Sheathing subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for structural sheathing
- Producing Sheathing System schema instances
- Producing Sheathing Area schema instances
- Producing the Sheathing Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for sheathing
- Providing sheathing artifacts for downstream framing subsystems

The Sheathing subsystem owns structural sheathing systems, sheathing areas, panel layout relationships, and panel specification references.

It does not own wall geometry, floor framing systems, roof framing systems, structural members, blocking, connectors, or material taxonomy.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Wall Framing Artifact
- Floor Framing Artifact
- Roof Framing Artifact
- Openings Artifact
- Structural Members Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Sheathing Artifact

The Sheathing Artifact contains Sheathing System schema instances, Sheathing Area schema instances, and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `04-building-assemblies.md`
- `09-material-taxonomy.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `07-openings.md`
- `08-structural-members.md`
- `10-assumptions.md`
- `11-validation-rules.md`
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

### Used By

- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Sheathing System Schema
- Sheathing Area Schema

### Artifacts

- Sheathing Artifact

### Validators

- Sheathing Validator

### Calculators

- Sheathing Resolver

### Claude Prompts

- Sheathing Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for structural sheathing
- Produce valid Sheathing System schema instances
- Produce valid Sheathing Area schema instances
- Produce the Sheathing Artifact
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
- Opening calculations
- Blocking calculations
- Connector calculations
- Material taxonomy definitions
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.