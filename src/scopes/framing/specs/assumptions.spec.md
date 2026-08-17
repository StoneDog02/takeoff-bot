# Assumptions Spec

## 1. Purpose

Define the implementation contract for the Assumptions subsystem.

The Assumptions subsystem implements the Construction Brain knowledge required to resolve, record, manage, and preserve deterministic assumptions used throughout the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Assumptions subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for assumptions
- Producing Assumption schema instances
- Producing the Assumptions Artifact
- Preserving assumption traceability
- Recording assumption precedence and source
- Recording user overrides
- Tracking assumption impact across framing objects
- Providing assumption artifacts for downstream engine services

The Assumptions subsystem owns assumption identity, lifecycle, precedence, traceability, and object relationships.

It does not own construction objects, calculations, validation, or confidence.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- All framing subsystem artifacts
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Assumptions Artifact

The Assumptions Artifact contains Assumption schema instances and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `10-assumptions.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

- `04-building-assemblies.md`
- `09-material-taxonomy.md`
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
- sheathing.spec.md
- blocking.spec.md
- connectors-hardware.spec.md

### Used By

- validation.spec.md
- confidence.spec.md

---

## 8. Required Implementation Components

### Schemas

- Assumption Schema

### Artifacts

- Assumptions Artifact

### Validators

- Assumptions Validator

### Calculators

- Assumption Resolver

### Claude Prompts

- None

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for assumptions
- Produce valid Assumption schema instances
- Produce the Assumptions Artifact
- Record deterministic assumptions with complete traceability
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Surface assumptions rather than hiding inferred values

---

## 10. Out of Scope

This subsystem does not implement:

- Construction object resolution
- Material calculations
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.