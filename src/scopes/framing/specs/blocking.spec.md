# Blocking Spec

## 1. Purpose

Define the implementation contract for the Blocking subsystem.

The Blocking subsystem implements the Construction Brain knowledge required to resolve blocking systems and produce blocking artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Blocking subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for blocking
- Producing Blocking schema instances
- Producing the Blocking Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for blocking
- Providing blocking artifacts for downstream framing subsystems

The Blocking subsystem owns blocking identity, classification, location, purpose, and relationships.

It does not own structural members, sheathing, connectors, or framing systems.

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
- Sheathing Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Blocking Artifact

The Blocking Artifact contains Blocking schema instances and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `08-structural-members.md`
- `09-material-taxonomy.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `04-building-assemblies.md`
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
- structural-members.spec.md
- sheathing.spec.md

### Used By

- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Blocking Schema

### Artifacts

- Blocking Artifact

### Validators

- Blocking Validator

### Calculators

- Blocking Resolver

### Claude Prompts

- Blocking Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for blocking
- Produce valid Blocking schema instances
- Produce the Blocking Artifact
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
- Connector calculations
- Material taxonomy definitions
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.