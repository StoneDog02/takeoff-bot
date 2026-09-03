# Framing Scope Spec

## 1. Purpose

Define the implementation contract for the Framing scope.

The Framing scope coordinates all framing subsystem implementations and produces the complete framing takeoff for the pipeline.

Construction logic is defined by the Construction Brain and implemented by framing subsystems.

---

## 2. Responsibilities

The Framing scope is responsible for:

- Coordinating framing subsystem execution
- Defining framing subsystem boundaries
- Managing framing artifact flow
- Producing the final framing takeoff artifact
- Aggregating review items across framing subsystems
- Aggregating validation results across framing subsystems
- Aggregating confidence results across framing subsystems
- Serving as the reference implementation pattern for future scopes

The Framing scope does not implement construction logic directly.

---

## 3. Consumed Artifacts

The Framing scope consumes, when available:

- Verified Plan Set Artifact
- Page Classification Artifact
- Plan Reading Order Artifact
- Building Assemblies Artifact
- Extracted Framing Evidence Artifact
- User Decisions Artifact
- Assumptions Artifact
- Any prerequisite artifacts required by framing subsystem implementations

---

## 4. Produced Artifacts

The Framing scope produces:

- Framing Scope Artifact
- Final Framing Takeoff Artifact
- Aggregated Review Items
- Aggregated Validation Results
- Aggregated Confidence Results

The Framing scope also coordinates production of subsystem artifacts.

---

## 5. Referenced Knowledge Files

The Framing scope references the complete Framing Construction Brain:

- `01-scope-definition.md`
- `02-plan-verification.md`
- `03-plan-reading-order.md`
- `04-building-assemblies.md`
- `05-wall-identification.md`
- `06-wall-types.md`
- `07-openings.md`
- `08-structural-members.md`
- `09-material-taxonomy.md`
- `10-assumptions.md`
- `11-validation-rules.md`
- `12-confidence-rules.md`

Construction behavior is defined by these knowledge files and must not be duplicated within this specification.

---

## 6. Subsystem Dependencies

### Coordinates

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
- confidence.spec.md

---

## 7. Required Implementation Components

### Schemas

- Framing Scope
- Framing Takeoff
- Framing Summary

### Artifacts

- Framing Scope Artifact
- Final Framing Takeoff Artifact

### Validators

- Framing Scope Validator

### Calculators

- Framing Scope Orchestrator
- Framing Aggregation Engine

### Claude Prompts

- Framing Scope Extraction Prompt, if required
- Prompts required by coordinated subsystem implementations

---

## 8. Success Criteria

Implementation is complete when the Framing scope can:

- Execute coordinated framing subsystems in the required order
- Coordinate artifact flow between framing subsystems
- Aggregate subsystem outputs into a final framing takeoff
- Preserve deterministic state throughout the framing pipeline
- Surface aggregated review items
- Surface aggregated validation results
- Surface aggregated confidence results
- Serve as the implementation reference for future construction scopes

---

## 9. Out of Scope

The Framing scope does not implement:

- Construction rule definitions
- Material calculation logic
- Validation rule definitions
- Confidence rule definitions
- Supplier integrations
- Pricing
- Proposal generation
- Customer-specific behavior

These responsibilities belong to the Construction Brain, framing subsystem implementations, or future extension packages.