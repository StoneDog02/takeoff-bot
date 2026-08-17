# Plan Reading Order

## Purpose

Construction drawings should be read in dependency order, not sheet-number order.

The objective is to progressively build an increasingly complete understanding of the structure while minimizing assumptions and maximizing cross-sheet validation.

Each stage produces artifacts that later stages depend on.

---

## Companion Execution Graph

This document describes the conceptual plan reading order and the reasoning behind it.

The executable orchestration for this knowledge lives in:

`03-plan-reading-order.json`

The JSON file is the canonical source for:

- Stage execution order
- Stage dependencies
- Artifact production
- Downstream consumers
- Review item triggers

This Markdown explains the reasoning behind the workflow. The pipeline should consume the JSON rather than parse this document.

---

# Reading Order

## 1. Project Metadata

Extract:

- Project type
- Discipline index
- Sheet index
- Revision information
- Scale information
- Drawing legends
- Symbols
- Abbreviations

Produces:

- Project Metadata
- Sheet Catalog

Required before all later stages.

---

## 2. General Notes

Extract:

- General construction notes
- Structural notes
- Material specifications
- Lumber requirements
- Fastener requirements
- Framing requirements
- Typical design assumptions
- Deferred submittals
- Applicable code references

Produces:

- General Notes Artifact

Dependencies:

Used by every framing calculation.

---

## 3. Foundation Information

Extract:

- Foundation layout
- Bearing locations
- Footings
- Stem walls
- Slab edges
- Structural grid
- Anchor requirements

Produces:

- Foundation Artifact

Dependencies:

Required before wall framing.

---

## 4. Floor Framing

Extract:

- Joists
- Rim board
- Beams
- Girders
- LVLs
- PSLs
- Glulams
- Headers
- Hangers
- Blocking
- Floor sheathing

Produces:

- Floor Framing Artifact

Dependencies:

Supports wall and roof load paths.

---

## 5. Wall Layout

Extract:

- Wall locations
- Wall identifiers
- Exterior walls
- Interior walls
- Bearing walls
- Non-bearing walls

Produces:

- Wall Layout Artifact

Dependencies:

Required before wall type assignment.

---

## 6. Wall Types

Extract:

- Wall type references
- Typical assemblies
- Stud spacing
- Stud size
- Plate requirements
- Fire walls
- Shear walls
- Rated assemblies

Produces:

- Wall Type Artifact

Dependencies:

Required before framing calculations.

---

## 7. Openings

Extract:

- Doors
- Windows
- Garage doors
- Cased openings
- Rough openings
- Header references
- Window schedules
- Door schedules

Produces:

- Opening Artifact

Dependencies:

Required before stud and header calculations.

---

## 8. Roof Framing

Extract:

- Trusses
- Rafters
- Ridge beams
- Valleys
- Hips
- Roof blocking
- Outlookers
- Roof sheathing
- Roof framing notes

Produces:

- Roof Framing Artifact

Dependencies:

Required for complete framing package.

---

## 9. Structural Details

Extract:

- Connection details
- Typical framing details
- Header details
- Shear details
- Holdowns
- Blocking requirements
- Framing exceptions

Produces:

- Detail Artifact

Dependencies:

May override previous assumptions.

---

## 10. Schedules

Extract:

- Beam schedules
- Header schedules
- Column schedules
- Opening schedules
- Truss schedules
- Material schedules

Produces:

- Schedule Artifact

Dependencies:

Overrides plan callouts when conflicts exist.

---

## 11. Cross Validation

Compare all previously extracted artifacts.

Validate:

- Wall tags exist
- Wall types exist
- Openings resolve
- Structural members resolve
- Details referenced exist
- Schedules referenced exist

Generate Review Items for every unresolved dependency.

---

# Dependency Graph

Project Metadata

↓

General Notes

↓

Foundation

↓

Floor Framing

↓

Wall Layout

↓

Wall Types

↓

Openings

↓

Roof Framing

↓

Structural Details

↓

Schedules

↓

Cross Validation

---

# Review Item Rules

Create review items when:

- referenced sheet is missing
- referenced detail is missing
- wall type cannot be resolved
- opening schedule missing
- header schedule missing
- beam schedule missing
- framing member size missing
- conflicting dimensions exist
- conflicting notes exist
- structural references cannot be located

Never stop the pipeline.

Complete every deterministic calculation possible.

Generate review items for unresolved information.

---

# Guiding Principles

- Read by information dependency rather than sheet number.
- The execution order is defined in `03-plan-reading-order.json`.
- Earlier artifacts feed later artifacts.
- Later stages may refine or override earlier assumptions.
- Cross-reference every framing decision.
- Prefer deterministic calculations over assumptions.
- Missing information produces review items, not failed takeoffs.