# Wall Types

## Purpose

This document defines how the framing engine interprets wall type designations into framing properties used for material takeoffs.

Wall identification answers:

> "This is a wall."

Wall type interpretation answers:

> "How is this wall built?"

The engine should resolve every wall type into framing characteristics before any material calculations begin.

---

# Core Rule

A wall tag is **not** the wall assembly.

A wall tag is only a reference.

The actual framing requirements come from:

- Wall Type Schedule
- Wall Sections
- Structural Details
- Structural Notes
- General Notes
- Specifications

The engine should always resolve the complete assembly before calculating materials.

---

# Interpretation Workflow

For every identified wall:

1. Resolve wall tag.
2. Locate wall schedule.
3. Locate referenced sections/details.
4. Apply structural notes.
5. Apply project-specific notes.
6. Build complete framing definition.
7. Produce review items for missing information.

Never calculate framing directly from the wall tag alone.

---

# Residential Wall Types

## Exterior Stud Wall

Typical framing properties:

- Stud material
- Stud size
- Stud spacing
- Wall height
- Bottom plate
- Double top plate
- Structural sheathing
- Blocking
- Header requirements
- Bracing/shear requirements
- Holdowns when required

Typical references:

- Exterior wall schedule
- Building sections
- Wall sections
- Structural details

Review items:

- Missing stud size
- Missing spacing
- Missing sheathing
- Missing wall height
- Missing header reference

---

## Interior Partition

Typical framing properties:

- Stud size
- Stud spacing
- Wall height
- Plate requirements
- Blocking
- Opening framing

Review items:

- Missing stud size
- Missing spacing
- Bearing condition unresolved
- Wall type missing

---

## Bearing Wall

Typical framing properties:

- Stud size
- Stud spacing
- Built-up posts
- Headers
- Load path
- Structural connections
- Blocking

Review items:

- Bearing status unclear
- Header schedule missing
- Structural detail unresolved

---

## Shear Wall

Typical framing properties:

- Stud framing
- Structural sheathing
- Nailing schedule
- Edge blocking
- Holdowns
- Anchor bolts
- Collector/chord members
- Boundary members

Review items:

- Sheathing schedule missing
- Holdown missing
- Nailing schedule missing
- Shear designation unresolved

---

## Garage Wall

Typical framing properties:

- Exterior framing
- Large opening framing
- Engineered headers
- Cripple walls
- Sheathing
- Portal framing when required

Review items:

- Garage header missing
- Portal frame unclear
- Opening schedule conflicts

---

# Multifamily Wall Types

## Unit Demising Wall

Typical framing properties:

- Stud configuration
- Double/staggered framing
- Rated assembly
- Stud spacing
- Blocking
- Structural sheathing where required

Review items:

- Stud configuration missing
- Rated assembly unresolved
- Fire/sound detail missing

---

## Corridor Wall

Typical framing properties:

- Stud framing
- Rated assembly
- Blocking
- Openings
- Structural support where required

Review items:

- Corridor wall rating missing
- Wall type unresolved
- Opening conflicts

---

## Shaft Wall

Typical framing properties:

- Stud framing
- Shaft assembly
- Blocking
- Opening framing
- Structural supports

Review items:

- Shaft assembly missing
- Rated assembly unresolved
- Wall detail conflicts

---

## Podium Interface Wall

Typical framing properties:

- Bearing framing
- Transfer framing
- Posts
- Holdowns
- Anchors

Review items:

- Transfer detail missing
- Holdown unresolved
- Beam/post schedule conflict

---

# Commercial / Civil Wall Types

## Interior Metal Stud Wall

Typical framing properties:

- Stud gauge
- Stud depth
- Stud spacing
- Track type
- Deflection requirements
- Blocking
- Opening framing

Review items:

- Stud gauge missing
- Stud depth missing
- Deflection track unresolved

---

## Exterior Metal Stud Wall

Typical framing properties:

- Stud gauge
- Stud depth
- Exterior sheathing
- Clip systems
- Bridging
- Deflection requirements

Review items:

- Exterior framing schedule missing
- Clip system unresolved
- Bridging requirements missing

---

## Shaft Wall

Typical framing properties:

- Shaft framing
- Track type
- Stud gauge
- Blocking
- Fire-rated framing

Review items:

- Shaft assembly unresolved
- Track type missing
- Rated assembly missing

---

## Curtain Wall Backup Framing

Typical framing properties:

- Backup stud framing
- Bridging
- Clips
- Sheathing
- Structural backing

Review items:

- Backup framing unresolved
- Clip schedule missing
- Bridging requirements missing

---

## Deflection Wall

Typical framing properties:

- Slip track
- Stud framing
- Deflection gap
- Connections

Review items:

- Deflection detail missing
- Slip track unresolved
- Head condition conflicts

---

# Wall Schedule Interpretation

Wall schedules commonly define:

- Wall type
- Stud material
- Stud size
- Stud spacing
- Wall height
- Fire rating
- Sound rating
- Sheathing
- Blocking
- Structural notes
- Detail references

The engine should resolve every available property.

Missing properties should become review items.

---

# Cross-Sheet Resolution

Resolve wall information using:

1. Wall schedule
2. Structural details
3. Structural sections
4. Architectural wall schedule
5. Building sections
6. Structural notes
7. General notes

Later references may refine earlier information.

---

# Property Resolution

The engine should build a normalized wall definition.

Example properties:

- Wall ID
- Wall type
- Project type
- Material
- Stud size
- Stud gauge
- Stud spacing
- Wall height
- Bearing status
- Exterior/interior
- Fire rating
- Sound rating
- Structural sheathing
- Blocking requirements
- Header requirements
- Holdown requirements
- Connection requirements
- Referenced details
- Referenced schedules

---

# Inheritance Rules

Wall properties may come from multiple locations.

Example:

Wall Schedule

↓

Structural Notes

↓

Referenced Detail

↓

General Notes

↓

Project Defaults (only when explicitly allowed)

Never overwrite higher-priority information with lower-priority information.

---

# Conflict Resolution

When conflicts exist, prefer:

1. Structural schedules
2. Structural details
3. Structural sections
4. Structural plans
5. Structural notes
6. Architectural schedules
7. Architectural plans
8. General notes

Create review items whenever conflicts remain unresolved.

---

# Confidence Guidance

Confidence increases when:

- Wall tag resolves
- Schedule exists
- Schedule properties resolve
- Details agree
- Structural notes agree
- Geometry matches
- Openings align
- Sections agree

Confidence decreases when:

- Wall tag missing
- Schedule missing
- Properties conflict
- Details missing
- Sections disagree
- Geometry conflicts

---

# Review Item Triggers

Create review items when:

- Wall tag missing
- Wall schedule missing
- Wall type unresolved
- Stud size missing
- Stud spacing missing
- Wall height missing
- Sheathing missing
- Header requirements missing
- Holdown requirements missing
- Structural detail missing
- Schedule conflicts
- Wall properties conflict
- Multiple schedules disagree

---

# Extraction Output Expectations

For every wall type, produce:

- Wall ID
- Wall type
- Project category
- Source sheets
- Source schedule
- Source details
- Framing properties
- Structural properties
- Material properties
- Referenced notes
- Confidence score
- Review items

---

# Accuracy Rules

- Never calculate framing directly from a wall tag.
- Never assume stud size.
- Never assume stud spacing.
- Never assume wall height.
- Never assume sheathing.
- Never assume fire-rated walls require identical framing.
- Never assume architectural wall schedules contain complete structural information.
- Resolve the wall assembly before calculating materials.
- Missing wall properties create review items instead of guessed framing.