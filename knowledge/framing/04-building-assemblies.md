# Building Assemblies

## Purpose

This document defines framing-relevant building assemblies the engine should recognize before decomposing them into material takeoff components.

A framing assembly is a repeated construction system that may appear on plans as a single wall, floor, roof, or structural condition but must be broken into individual framing materials.

The engine should identify the assembly first, then extract the materials, dimensions, spacing, schedules, details, and review items needed to calculate it accurately.

---

# Core Rule

Do not take off framing members in isolation when they belong to a larger assembly.

First classify the assembly.

Then decompose it into framing components.

---

# Residential Framing Assemblies

## Exterior Wood Stud Wall

Common components:

- Bottom plate
- Double top plate
- Studs
- King studs
- Jack studs
- Cripple studs
- Corners
- Intersections
- Headers
- Structural sheathing
- Blocking
- Holdowns, straps, or anchors when shown

Extract:

- Wall length
- Wall height
- Stud size
- Stud spacing
- Plate requirements
- Opening locations
- Header requirements
- Sheathing requirements
- Shear/bracing requirements

Create review items when:

- Stud size is missing
- Stud spacing is missing
- Wall height is unclear
- Openings are shown but not scheduled
- Header size is missing
- Shear/bracing requirements conflict

---

## Interior Wood Stud Wall

Common components:

- Bottom plate
- Top plate
- Studs
- Blocking
- Corners
- Intersections
- Headers at openings when required

Extract:

- Wall length
- Wall height
- Bearing condition
- Stud size
- Stud spacing
- Openings
- Fire/rated requirements if shown

Create review items when:

- Bearing condition is unclear
- Stud size is missing
- Stud spacing is missing
- Wall type cannot be resolved

---

## Bearing Wall

Common components:

- Studs
- Plates
- Headers
- Posts
- Built-up studs
- Blocking
- Holdowns or straps when shown

Extract:

- Bearing line
- Supported load path
- Stud size
- Stud spacing
- Header sizes
- Post locations
- Structural detail references

Create review items when:

- Bearing condition is unresolved
- Load path is unclear
- Header/post callout is missing
- Referenced detail cannot be found

---

## Shear Wall / Braced Wall Panel

Common components:

- Studs
- Plates
- Wood structural panel sheathing
- Edge blocking
- Anchor bolts
- Holdowns
- Straps
- Nailing pattern

Extract:

- Shear wall location
- Shear wall length
- Panel thickness
- Nailing schedule
- Edge blocking requirements
- Holdown type
- Anchor requirements

Create review items when:

- Shear wall schedule is missing
- Nailing pattern is missing
- Holdown type is missing
- Shear wall length is unclear
- Shear designation conflicts between sheets

---

## Floor Framing Assembly

Common components:

- Joists
- Rim board
- Rim joists
- Blocking
- Beams
- Girders
- Hangers
- Squash blocks
- Floor sheathing

Extract:

- Joist type
- Joist size/depth
- Joist spacing
- Span direction
- Beam locations
- Rim board requirements
- Blocking requirements
- Sheathing thickness
- Hanger requirements

Create review items when:

- Joist size is missing
- Joist spacing is missing
- Span direction is unclear
- Beam callout is unresolved
- Hanger requirement is missing
- Floor sheathing spec is missing

---

## Roof Framing Assembly

Common components:

- Rafters or trusses
- Ridge board or ridge beam
- Hip members
- Valley members
- Lookouts/outlookers
- Blocking
- Fascia/subfascia
- Roof sheathing
- Hangers or clips when shown

Extract:

- Roof framing type
- Rafter/truss size
- Rafter/truss spacing
- Span direction
- Pitch
- Ridge/hip/valley requirements
- Roof sheathing thickness
- Blocking requirements
- Connector requirements

Create review items when:

- Roof framing type is unclear
- Rafter/truss spacing is missing
- Ridge beam is unresolved
- Roof pitch conflicts
- Roof sheathing spec is missing

---

## Header Assembly

Common components:

- Header member
- King studs
- Jack studs
- Cripple studs
- Bearing posts where required
- Connectors where shown

Extract:

- Opening width
- Opening height
- Header size
- Header quantity/ply count
- Bearing requirement
- Header schedule reference

Create review items when:

- Opening size is missing
- Header schedule is missing
- Header size is unresolved
- Bearing/post requirement is unclear

---

## Stair Opening / Floor Opening Assembly

Common components:

- Trimmers
- Headers
- Double joists
- Blocking
- Hangers
- Rim framing

Extract:

- Opening dimensions
- Framing direction
- Doubled member requirements
- Header/trimmer sizes
- Hanger requirements

Create review items when:

- Opening dimensions are missing
- Framing direction is unclear
- Header/trimmer size is missing
- Hanger requirement is missing

---

# Multifamily Framing Assemblies

## Unit Demising Wall

Common components:

- Single, staggered, or double stud wall framing
- Plates
- Studs
- Blocking
- Rated layers if relevant to framing
- Fire/sound separation notes
- Structural sheathing if required

Extract:

- Wall type
- Stud configuration
- Stud size
- Stud spacing
- Wall height
- Rated assembly reference
- Structural sheathing requirements

Create review items when:

- Rated assembly reference is missing
- Stud configuration is unclear
- Wall type conflicts with details
- Fire/sound assembly affects framing but is unresolved

---

## Corridor Wall

Common components:

- Studs
- Plates
- Blocking
- Headers
- Rated assembly framing
- Structural sheathing where required

Extract:

- Wall type
- Bearing condition
- Stud size
- Stud spacing
- Wall height
- Rated assembly reference
- Opening/header requirements

Create review items when:

- Corridor wall type is unresolved
- Bearing condition is unclear
- Rated assembly reference is missing
- Header requirements are missing

---

## Shaft Wall / Chase Wall

Common components:

- Stud framing
- Plates
- Blocking
- Rated shaft assembly framing
- Headers at access openings
- Structural support framing where shown

Extract:

- Shaft/chase wall type
- Stud size
- Stud spacing
- Wall height
- Rated assembly reference
- Opening requirements

Create review items when:

- Shaft wall assembly is unclear
- Rated assembly reference is missing
- Framing requirements differ between plan and detail

---

## Podium / Bearing Transfer Interface

Common components:

- Bearing walls
- Posts
- Beams
- Holdowns
- Anchors
- Transfer framing
- Blocking

Extract:

- Bearing lines
- Transfer locations
- Post/beam sizes
- Holdown and anchor requirements
- Detail references

Create review items when:

- Load path is unclear
- Post/beam callout is unresolved
- Holdown requirement is missing
- Transfer detail is missing

---

## Repetitive Unit Wall Assembly

Common components:

- Repeated interior walls
- Repeated exterior walls
- Repeated unit demising walls
- Repeated openings
- Repeated headers

Extract:

- Unit type
- Repetition count
- Wall types per unit
- Opening types per unit
- Typical details

Create review items when:

- Unit repetition count is unclear
- Unit plan conflicts with enlarged plans
- Typical unit detail does not match plan condition

---

# Commercial / Civil Framing Assemblies

## Light-Gauge Metal Stud Wall

Common components:

- Metal studs
- Tracks
- Bridging/blocking
- Headers
- Jamb studs
- Deflection track where shown
- Clips/connectors where shown

Extract:

- Stud gauge
- Stud depth
- Stud spacing
- Track requirements
- Wall height
- Deflection requirements
- Opening framing requirements

Create review items when:

- Stud gauge is missing
- Stud depth is missing
- Deflection track requirement is unclear
- Opening framing is unresolved

---

## Curtain Wall Backup / Exterior Metal Stud Framing

Common components:

- Exterior metal studs
- Tracks
- Clips
- Bridging
- Headers
- Jamb framing
- Sheathing substrate where shown

Extract:

- Stud depth
- Stud gauge
- Spacing
- Deflection requirements
- Structural backing requirements
- Sheathing/substrate requirements

Create review items when:

- Exterior stud specification is missing
- Clip/connection requirement is unresolved
- Deflection condition is unclear

---

## Parapet Framing Assembly

Common components:

- Stud extensions
- Plates/tracks
- Blocking
- Sheathing
- Bracing
- Connectors

Extract:

- Parapet height
- Stud/track size
- Bracing requirements
- Sheathing requirements
- Connection details

Create review items when:

- Parapet height is unclear
- Bracing detail is missing
- Sheathing requirement is missing
- Connection detail is unresolved

---

## Structural Opening Assembly

Common components:

- Headers
- Jamb studs
- Posts
- Beams
- Connectors
- Blocking

Extract:

- Opening size
- Header/beam size
- Jamb/post requirements
- Connection requirements
- Schedule references

Create review items when:

- Header/beam callout is missing
- Jamb/post requirement is unclear
- Schedule reference cannot be resolved

---

# Assembly Recognition Rules

The engine should classify an assembly using:

- Sheet title
- Plan location
- Wall tags
- Section/detail callouts
- Structural notes
- Schedules
- Legends
- Material specifications
- Repetition patterns

Do not rely on one source alone.

---

# Decomposition Rules

After an assembly is identified, decompose it into:

- Primary framing members
- Secondary framing members
- Sheathing
- Blocking
- Connectors
- Hardware
- Schedule-driven members
- Detail-driven exceptions

---

# Priority Rules

When information conflicts, prefer in this order:

1. Structural schedules
2. Structural details
3. Structural plans
4. General structural notes
5. Architectural wall types
6. Architectural plans
7. Typical notes

Create review items for unresolved conflicts.

---

# Takeoff Accuracy Rules

- Assembly recognition comes before material calculation.
- Repeated assemblies should be counted once and multiplied only when repetition is confirmed.
- Typical details apply only when the plan condition matches.
- Do not assume header sizes from opening width unless the project rules explicitly allow it.
- Do not assume stud spacing unless the wall type, notes, or details support it.
- Do not assume sheathing thickness unless specified.
- Do not assume connector or holdown types.
- Missing assembly data should create review items, not guessed quantities.

---

# Output Expectations

For each recognized assembly, the extraction process should produce:

- Assembly type
- Project type category
- Source sheets
- Referenced details
- Referenced schedules
- Dimensions
- Framing member assumptions
- Required materials
- Confidence score
- Review items
