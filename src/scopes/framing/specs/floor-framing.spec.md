# Floor Framing Spec

## 1. Purpose

Define the implementation contract for the Floor Framing subsystem.

The Floor Framing subsystem implements the Construction Brain knowledge required to resolve floor framing systems and produce floor framing artifacts for the Framing scope.

This specification defines subsystem ownership, dependencies, and required implementation components.

---

## 2. Responsibilities

The Floor Framing subsystem is responsible for:

- Implementing the primary Construction Brain knowledge for floor framing assemblies
- Producing Floor Framing System schema instances
- Producing Floor Framing Area schema instances
- Producing the Floor Framing Artifact
- Preserving traceability to source evidence
- Producing review, validation, and confidence outputs for floor framing
- Providing floor framing artifacts for downstream framing subsystems

The Floor Framing subsystem owns floor framing systems, framing layout, framing direction, span direction, floor assembly relationships, and **Floor Framing calculator quantities explicitly authorized by the Construction Brain** (see `14-floor-framing-calculations.md` for baseline regularly spaced joist **count** and simple-area baseline joist **material LF**).

It does not own individually identified Structural Member objects, sheathing areas/systems, blocking objects, connectors, or hardware.

It must not emit header/beam/girder linear footage owned by Structural Members, and must not emit sheathing coverage owned by Sheathing. It must not emit Structural Member LF for the same baseline regularly spaced joist population already owned by Floor Framing.

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

- Floor Framing Artifact

The Floor Framing Artifact contains Floor Framing System schema instances, Floor Framing Area schema instances, and associated subsystem outputs.

---

## 5. Primary Knowledge Files

This subsystem primarily implements:

- `04-building-assemblies.md`
- `14-floor-framing-calculations.md`

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

- Floor Framing System Schema
- Floor Framing Area Schema

### Artifacts

- Floor Framing Artifact

### Validators

- Floor Framing Validator

### Calculators

- Floor Framing Calculator (Brain-authorized quantities only; baseline joist count and, when eligible, simple-area baseline joist material LF per `14-floor-framing-calculations.md`)

### Resolvers

- Floor Framing Resolver

### Claude Prompts

- Floor Framing Extraction Prompt

---

## 9. Success Criteria

Implementation is complete when the subsystem can:

- Implement the primary Construction Brain knowledge for floor framing assemblies
- Produce valid Floor Framing System schema instances
- Produce valid Floor Framing Area schema instances
- Produce the Floor Framing Artifact
- Produce deterministic baseline regularly spaced floor joist count quantities when Construction Brain inputs resolve
- Produce deterministic simple-area baseline joist material LF quantities when Construction Brain LF eligibility and `joistMemberLengthFeet` resolve (without blocking count when only member length is missing)
- Integrate correctly with upstream and downstream subsystem dependencies
- Preserve deterministic execution through artifacts
- Surface review items rather than unresolved guesses

---

## 10. Out of Scope

This subsystem does not implement:

- Wall framing
- Roof framing
- Structural member calculations for individually identified members (beams, girders, special members)
- Opening wall-framing calculations
- Sheathing calculations
- Blocking calculations
- Connector calculations
- Rim / band LF (until Brain authorizes a dedicated rim rule)
- Continuous / multi-span / lap / splice joist piece schedules outside the simple-area LF class
- Floor truss package takeoff
- Stock / purchasing length optimization
- Assumption rule definitions
- Validation rule definitions
- Confidence rule definitions
- Pricing
- Supplier integrations
- Proposal generation

These responsibilities belong to their respective subsystem specifications or the Construction Brain.