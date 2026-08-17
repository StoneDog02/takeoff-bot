# Wall Framing Spec

## 1. Purpose

Define the implementation contract for the Wall Framing subsystem.

The Wall Framing subsystem implements the Construction Brain knowledge required to resolve canonical Building Walls and Wall Segments and produce wall framing artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Wall Framing subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for wall framing
- Producing Building Wall schema instances
- Producing Wall Segment schema instances
- Producing the Wall Framing Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for wall framing
- Providing wall framing artifacts for downstream framing subsystems

The Wall Framing subsystem owns wall identity, geometry, hierarchy, and relationships.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Wall Framing Artifact

The Wall Framing Artifact contains Building Wall schema instances, Wall Segment schema instances, and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `04-building-assemblies.md`
- `05-wall-identification.md`
- `06-wall-types.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `07-openings.md`
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

### Used By

- openings.spec.md
- structural-members.spec.md
- sheathing.spec.md
- blocking.spec.md
- connectors-hardware.spec.md
- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Building Wall Schema
- Wall Segment Schema

### Artifacts

- Wall Framing Artifact

### Validators

- Wall Framing Validator

### Calculators

- Wall Resolver

### Claude Prompts

- Wall Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for wall framing
- Produce valid Building Wall schema instances
- Produce valid Wall Segment schema instances
- Produce the Wall Framing Artifact
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Surface review items rather than unresolved guesses

---

## 10. Out of Scope

This subsystem does not implement:

- Floor framing
- Roof framing
- Opening calculations
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