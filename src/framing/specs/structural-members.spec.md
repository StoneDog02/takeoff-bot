# Structural Members Spec

## 1. Purpose

Define the implementation contract for the Structural Members subsystem.

The Structural Members subsystem implements the Construction Brain knowledge required to resolve load-carrying structural framing members and produce structural member artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Structural Members subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for structural members
- Producing Structural Member schema instances
- Producing the Structural Members Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for structural members
- Providing structural member artifacts for downstream framing subsystems

The Structural Members subsystem owns structural member identity, classification, material reference, geometry, relationships, and associated hardware references.

It does not own connector or hardware objects themselves.

It does not own baseline regularly spaced floor joist **count** or simple-area baseline joist **material LF**; those quantities are owned by Floor Framing per `14-floor-framing-calculations.md`. Do not emit SM net material LF for that same repetitive baseline population.

It does not own baseline regularly spaced common-rafter **count**; that quantity is owned by Roof Framing per `15-roof-framing-calculations.md`. Do not emit SM quantities for that same repetitive baseline common-rafter population.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Wall Framing Artifact
- Openings Artifact
- Floor Framing Artifact
- Roof Framing Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Structural Members Artifact

The Structural Members Artifact contains Structural Member schema instances and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `08-structural-members.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `04-building-assemblies.md`
- `05-wall-identification.md`
- `06-wall-types.md`
- `07-openings.md`
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
- openings.spec.md
- floor-framing.spec.md
- roof-framing.spec.md

### Used By

- connectors-hardware.spec.md
- blocking.spec.md
- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Structural Member Schema

### Artifacts

- Structural Members Artifact

### Validators

- Structural Members Validator

### Calculators

- Structural Members Calculator

### Claude Prompts

- Structural Member Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for structural members
- Produce valid Structural Member schema instances
- Produce the Structural Members Artifact
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Produce deterministic net structural member material quantities from resolved Construction Brain inputs
- Surface review items rather than unresolved guesses
- Preserve references to associated connectors and hardware without owning those objects

---

## 10. Out of Scope

This subsystem does not implement:

- Wall framing
- Floor framing layout systems
- Baseline regularly spaced floor joist count or simple-area baseline joist material LF (Floor Framing / `14-floor-framing-calculations.md`)
- Baseline regularly spaced common-rafter count (Roof Framing / `15-roof-framing-calculations.md`)
- Roof framing layout systems
- Opening identity or geometry
- Connector calculations
- Hardware calculations
- Sheathing calculations
- Blocking calculations
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.