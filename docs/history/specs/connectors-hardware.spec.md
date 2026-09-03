# Connectors & Hardware Spec

## 1. Purpose

Define the implementation contract for the Connectors & Hardware subsystem.

The Connectors & Hardware subsystem implements the Construction Brain knowledge required to resolve structural connectors, fasteners, and framing hardware and produce connector artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Connectors & Hardware subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for connectors, fasteners, and framing hardware
- Producing Connector schema instances
- Producing Hardware schema instances
- Producing Fastener schema instances
- Producing the Connectors & Hardware Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for connectors and hardware
- Providing connector and hardware artifacts for downstream framing subsystems

The Connectors & Hardware subsystem owns connector identity, classification, hardware relationships, fastener relationships, and member associations.

It does not own structural members or framing systems.

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
- Blocking Artifact
- Sheathing Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Connectors & Hardware Artifact

The Connectors & Hardware Artifact contains Connector schema instances, Hardware schema instances, Fastener schema instances, and associated subsystem outputs.

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
- openings.spec.md
- structural-members.spec.md
- blocking.spec.md
- sheathing.spec.md

### Used By

- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Connector Schema
- Hardware Schema
- Fastener Schema

### Artifacts

- Connectors & Hardware Artifact

### Validators

- Connectors & Hardware Validator

### Calculators

- Fastener Calculator

### Claude Prompts

- Connectors & Hardware Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for connectors, fasteners, and framing hardware
- Produce valid Connector schema instances
- Produce valid Hardware schema instances
- Produce valid Fastener schema instances
- Produce the Connectors & Hardware Artifact
- Produce deterministic specified fastener quantities from resolved Construction Brain inputs
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
- Material taxonomy definitions
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.