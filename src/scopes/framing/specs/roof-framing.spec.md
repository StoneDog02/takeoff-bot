# Roof Framing Spec

## 1. Purpose

Define the implementation contract for the Roof Framing subsystem.

The Roof Framing subsystem implements the Construction Brain knowledge required to resolve roof framing systems and produce roof framing artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Roof Framing subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for roof framing assemblies
- Producing Roof Framing System schema instances
- Producing Roof Plane schema instances
- Producing the Roof Framing Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for roof framing
- Providing roof framing artifacts for downstream framing subsystems

The Roof Framing subsystem owns roof framing systems, roof planes, framing layout, framing direction, span direction, roof pitch relationships, roof assembly relationships, and **Roof Framing calculator quantities explicitly authorized by the Construction Brain** (see `15-roof-framing-calculations.md` for baseline regularly spaced common-rafter **count**).

It does not own individual structural members, sheathing, blocking, connectors, or hardware.

It must not emit ridge/hip/valley/special-member linear footage owned by Structural Members, and must not emit sheathing coverage owned by Sheathing. It must not emit Structural Member quantities for the same baseline regularly spaced common-rafter population already owned by Roof Framing.

---

## 3. Consumed Artifacts

This subsystem consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Wall Framing Artifact
- Openings Artifact
- Extracted Framing Evidence Artifact
- Assumptions Artifact
- User Decisions Artifact
- Any prerequisite artifacts required by the framing pipeline

---

## 4. Produced Artifacts

This subsystem produces:

- Roof Framing Artifact

The Roof Framing Artifact contains Roof Framing System schema instances, Roof Plane schema instances, and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `04-building-assemblies.md`
- `15-roof-framing-calculations.md`

---

## 6. Referenced Knowledge Files

This subsystem may reference:

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
- openings.spec.md

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

- Roof Framing System Schema
- Roof Plane Schema

### Artifacts

- Roof Framing Artifact

### Validators

- Roof Framing Validator

### Calculators

- Roof Framing Calculator (Brain-authorized quantities only; baseline common-rafter count when eligible per `15-roof-framing-calculations.md`)

### Resolvers

- Roof Framing Resolver

### Claude Prompts

- Roof Framing Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for roof framing assemblies
- Produce valid Roof Framing System schema instances
- Produce valid Roof Plane schema instances
- Produce the Roof Framing Artifact
- Produce deterministic baseline regularly spaced common-rafter count quantities when Construction Brain inputs resolve
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Surface review items rather than unresolved guesses

---

## 10. Out of Scope

This subsystem does not implement:

- Wall framing
- Floor framing
- Structural member calculations for individually identified members (ridge, hip, valley, jack, beams, etc.)
- Opening wall-framing calculations
- Sheathing calculations
- Blocking calculations
- Connector calculations
- Common-rafter LF (until Brain authorizes a dedicated LF rule)
- Hip / valley / jack geometry takeoff under the simple-plane count rule
- Roof truss package takeoff or truss stick decomposition
- Stock / purchasing length optimization
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.