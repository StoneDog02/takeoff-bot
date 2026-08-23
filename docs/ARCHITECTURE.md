# Architecture

This repository implements a deterministic, artifact-first construction takeoff engine.

The system uses AI for evidence extraction and deterministic software for resolution, validation, calculation, and persistence.

The immediate reference implementation is the Framing scope, but the architecture is designed to scale across every future construction scope.

---

# Mission

Build a production-quality construction takeoff engine that is:

- Deterministic
- Explainable
- Traceable
- Maintainable
- Supplier-ready

Optimize every implementation toward accurate material takeoffs rather than maximizing AI output.

---

# Core Philosophy

Claude extracts evidence.

**Project Interpreter** (optional layer between compiler artifacts and Evidence governance) induces a project-local dictionary via bounded, tool-grounded investigation. It does not replace deterministic compilation, resolution, or calculation. Interpreter output is governed before any Evidence emit.

TypeScript resolves.

Artifacts preserve deterministic state.

Validators evaluate correctness.

Calculators compute quantities.

Confidence measures trustworthiness.

Review Items surface uncertainty.

Users resolve uncertainty.

Never maximize extraction.

Maximize deterministic completion.

Never hide assumptions.

Never hallucinate quantities.

Prefer review items over guesses.

---

# Architectural Layers

Construction Brain

↓

Specifications

↓

Schemas

↓

Artifacts

↓

Validators

↓

Calculators

↓

Extraction Prompts

↓

Pipeline Wiring

Each layer owns one responsibility.

Construction behavior is authored in the Construction Brain and must not be redefined in schemas, validators, calculators, or prompts.

Prompts may receive only the scoped Construction Brain context required for the current extraction stage.
---

# Construction Brain

The Construction Brain is the authoritative source of construction behavior.

It defines:

- terminology
- assemblies
- identification rules
- interpretation rules
- validation rules
- confidence rules

Construction knowledge must never be duplicated elsewhere.

---

# Specifications

Specifications implement the Construction Brain.

They define:

- subsystem ownership
- consumed artifacts
- produced artifacts
- implementation responsibilities
- success criteria

Specifications never redefine construction behavior.

---

# Schemas

Schemas define deterministic engine contracts.

Core schemas remain construction-agnostic.

Scope schemas define construction objects.

Schemas describe data.

They never perform calculations.

---

# Artifacts

Artifact payloads represent immutable persisted snapshots.

Changes to resolved state create new artifacts rather than mutating prior payloads.
Persistence metadata may evolve without changing the artifact payload.

Artifacts own:

- execution provenance
- persistence
- lineage
- versioning

Resolved objects do not.

Every persisted artifact is:

Artifact Envelope

↓

Typed Payload

---

# Engine Principles

Relationships reference IDs.

Never embed related domain objects.

Extraction objects and resolved objects are different lifecycle stages.

Evidence never owns confidence.

Confidence is a separate subsystem.

Review Items are immutable.

User Decisions live in separate artifacts.

Property Resolution Traces explain how values were resolved.

NodeNext module resolution requires `.js` imports.

Confidence, completion, review status, and blocking status are independent concepts and must never be collapsed into one score.

---

# Domain Model

Primary Objects

Represent construction.

Examples:

- Wall
- Wall Segment
- Opening
- Structural Member

Supporting Objects

Explain or evaluate construction.

Examples:

- Evidence
- Validation
- Assumptions
- Confidence
- Review Items

Container Objects

Persist and organize.

Examples:

- Artifact Envelope
- Framing Takeoff

Never mix responsibilities.

---

# Deterministic Rules

Never rely on hidden AI memory.

Never perform one-shot takeoffs.

Never inject the entire Construction Brain into every prompt.

Use page bundles to preserve cross-sheet context.

Claude extracts structured evidence.

TypeScript validates, normalizes, calculates, and assembles outputs.

Missing information creates Review Items.

Approved deterministic defaults may be used only when explicitly allowed.

Conflicting information creates Review Items.

Unknown is preferable to incorrect.

---

# Runtime Flow

Plan Set

↓

Plan Indexer

↓

Scope Router

↓

Page Bundle Builder

↓

Scope Pipeline

↓

AI Extraction

↓

Validation

↓

Deterministic Resolution

↓

Calculation

↓

Review Items

↓

Artifact Persistence

↓

Takeoff Report

---

# Design Priorities

When implementation choices exist, prefer:

1. Deterministic behavior
2. Explicit modeling
3. ID references over embedding
4. Immutable artifacts
5. Explainability
6. Maintainability
7. Simplicity
8. Extensibility

Challenge existing designs only when there is a materially better architecture.

Do not redesign stable architecture unnecessarily.

---

# Schedule definition extraction (B2.2L.6)

Compiler schedule extraction establishes **definitions** only (`SW* → properties`). It does **not** bind physical runs or infer ownership. Promoted path: heading-anchored table region + row-band OCR (`extractScheduleFromRowBands`) with `DictionaryGovernor.verifyDefinitionPropertyCitation` against `schedule-*` OCR cache entries.

**Full Framing Takeoff Audit:** Run after B2.2L.6 reaches governed schedule definitions (S3) **and** a subsequent bridge milestone improves end-to-end takeoff completion — see `artifacts/b2.2l.6/RESEARCH.md` §SOP. L.6 does not implement the audit runner.