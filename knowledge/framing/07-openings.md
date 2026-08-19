# Openings

## Purpose

This document defines how the framing engine identifies, resolves, validates, and interprets framed openings.

An opening is a first-class construction object.

It is not simply a hole in a wall.

It represents the complete framing condition required to support doors, windows, garage doors, framed floor openings, roof openings, and other structural penetrations.

Openings should be fully resolved before framing calculations begin.

---

# Core Rule

Never identify an opening from a single source.

An opening should be resolved using corroborating evidence from multiple plan sources.

Never calculate framing around an opening until the opening itself has been fully resolved.

---

# Opening Categories

The engine should recognize:

- Door
- Window
- Garage door
- Cased opening
- Pass-through opening
- Overhead door
- Floor opening
- Stair opening
- Elevator opening
- Shaft opening
- Roof opening
- Mechanical opening
- Future opening
- Existing opening
- Demolition opening
- Unknown opening

If an opening cannot be confidently classified, create an Unknown Opening and generate review items.

---

# Opening Identification Inputs

Use all available evidence.

Geometry:

- Breaks in wall linework
- Window symbols
- Door swing symbols
- Opening dimensions
- Framed floor openings
- Roof penetrations

Annotations:

- Door tags
- Window tags
- Opening tags
- Keynotes
- Callouts
- Schedule references
- Detail references

Schedules:

- Door schedule
- Window schedule
- Opening schedule
- Header schedule

Structural:

- Header callouts
- Structural details
- Framing plans
- Sections
- Beam schedules
- Load path notes

Context:

- Wall association
- Room relationship
- Exterior/interior location
- Repeated unit layouts
- Building sections
- Elevations

Never rely on only one input.

---

# Opening Resolution Workflow

For every detected opening:

1. Detect geometry.
2. Associate opening with wall.
3. Resolve opening tag.
4. Resolve schedule entry.
5. Resolve dimensions.
6. Resolve framing requirements.
7. Resolve referenced details.
8. Validate all evidence.
9. Produce normalized Opening object.
10. Generate review items for unresolved data.

---

# Door Openings

Typical framing components:

- Header
- King studs
- Jack studs
- Cripple studs when required
- Plates
- Structural connections

Extract:

- Door tag
- Schedule reference
- Nominal size
- Rough opening if specified
- Header reference
- Wall association
- Swing
- Exterior/interior
- Fire rating when applicable

Review items:

- Door tag missing
- Door schedule missing
- Header missing
- Wall association unclear
- Rough opening unresolved

---

# Window Openings

Typical framing components:

- Header
- King studs
- Jack studs
- Sill plate
- Cripple studs
- Structural connections

Extract:

- Window tag
- Schedule reference
- Nominal size
- Rough opening if specified
- Header reference
- Sill height
- Wall association
- Exterior/interior

Review items:

- Window tag missing
- Window schedule missing
- Header unresolved
- Sill height missing
- Rough opening unresolved

---

# Garage Door Openings

Typical framing components:

- Engineered header
- King studs
- Jack studs
- Posts
- Portal framing when required
- Holdowns when required

Extract:

- Opening width
- Opening height
- Header size
- Portal framing requirements
- Holdown references
- Structural detail references

Review items:

- Garage header missing
- Portal detail missing
- Holdown missing
- Structural detail unresolved

---

# Cased Openings

Typical framing components:

- Header when required
- King studs
- Jack studs

Extract:

- Opening dimensions
- Header requirement
- Wall association

Review items:

- Header requirement unclear
- Wall association missing

---

# Stair Openings

Typical framing components:

- Headers
- Trimmers
- Double joists
- Blocking
- Hangers

Extract:

- Opening dimensions
- Framing direction
- Header sizes
- Trimmer sizes
- Hanger requirements

Review items:

- Opening dimensions missing
- Header missing
- Trimmer unresolved
- Framing direction unclear

---

# Floor Openings

Typical framing components:

- Headers
- Trimmers
- Double joists
- Blocking
- Rim framing
- Hangers

Extract:

- Opening size
- Supported system
- Framing members
- Structural references

Review items:

- Framing detail missing
- Opening size unresolved
- Structural references missing

---

# Roof Openings

Typical framing components:

- Trimmers
- Headers
- Cripples
- Blocking
- Roof framing modifications

Extract:

- Roof opening size
- Roof framing impact
- Structural references
- Detail references

Review items:

- Roof framing modification missing
- Opening detail missing

---

# Mechanical Openings

Examples:

- Duct openings
- Large plumbing penetrations
- Equipment openings
- Access openings

Extract:

- Opening type
- Dimensions
- Structural framing modifications
- Supporting details

Review items:

- Structural framing unresolved
- Detail missing

---

# Opening Association Rules

Every opening should reference exactly one parent object.

Typically:

Wall

Some openings reference:

- Floor framing
- Roof framing
- Shaft framing

Never leave an opening unattached unless evidence is insufficient.

Generate review items instead.

---

# Schedule Resolution

Schedules may define:

- Opening ID
- Nominal size
- Rough opening
- Header type
- Hardware
- Fire rating
- Glass type
- Manufacturer
- Notes

The engine should resolve every available property.

---

# Rough Opening Rules

Never assume nominal dimensions equal rough opening dimensions.

Prefer:

1. Opening schedule
2. Manufacturer requirements
3. Structural details
4. Project notes

If rough opening cannot be resolved:

Generate review item.

---

# Cross Validation

Validate:

Geometry

↓

Wall association

↓

Schedule

↓

Structural detail

↓

Header

↓

Sections

↓

Elevations

↓

General notes

Every opening should successfully cross-reference these sources whenever available.

---

# Confidence Guidance

Confidence increases when:

- Geometry exists
- Wall association succeeds
- Opening tag resolves
- Schedule resolves
- Structural detail exists
- Header resolves
- Dimensions agree
- Sections agree

Confidence decreases when:

- Geometry only
- Missing schedule
- Missing tag
- Missing header
- Conflicting dimensions
- Conflicting references

---

# Conflict Resolution

Prefer:

1. Structural schedules
2. Structural details
3. Structural sections
4. Structural plans
5. Door/window schedules
6. Architectural plans
7. Elevations
8. General notes

Generate review items for unresolved conflicts.

---

# Opening Object

Every opening should produce a normalized object.

Properties:

- Opening ID
- Opening category
- Parent object
- Source sheets
- Schedule reference
- Detail reference
- Geometry
- Nominal width
- Nominal height
- Rough opening width
- Rough opening height
- Header reference
- Wall association
- Structural framing requirements
- Fire rating
- Confidence
- Review items

---

# Review Item Triggers

Create review items when:

- Geometry exists without schedule
- Schedule exists without geometry
- Wall association fails
- Header cannot be resolved
- Rough opening missing
- Structural detail missing
- Dimensions conflict
- Schedule conflicts
- Multiple openings overlap
- Parent object unresolved
- Confidence below project threshold

---

# Accuracy Rules

- Openings are first-class objects.
- Never calculate framing directly from geometry alone.
- Never assume rough opening equals nominal size.
- Never assume header size.
- Never assume garage door framing.
- Never infer structural framing without supporting evidence.
- Cross-reference every opening.
- Missing information creates review items rather than guessed framing.

---

# Opening Wall Framing Calculation Authority

Deterministic opening-derived wall framing quantities are defined in `13-opening-wall-framing-calculations.md`.

That document governs:

- King, jack, cripple, and rough sill formulas
- Header ownership boundary (header material stays on Structural Member)
- Baseline regular stud interaction (additive default; optional net deductions)
- Multiple openings and `opening.quantity` multiplication
- Assumption policy and blocking conditions

Do not implement opening-framing calculators from component lists in this file alone.

---

# Extraction Output Expectations

For every opening produce:

- Opening ID
- Opening category
- Parent object
- Source sheets
- Schedule reference
- Structural detail reference
- Dimensions
- Rough opening information
- Header information
- Structural framing requirements
- Confidence score
- Review items