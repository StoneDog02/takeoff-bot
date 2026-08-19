# Structural Members

## Purpose

This document defines how the framing engine identifies, resolves, validates, and normalizes structural framing members.

A structural member is a load-carrying framing element.

Structural members should be identified as first-class objects before material calculations begin.

---

# Core Rule

Do not treat a structural callout as a quantity.

A structural callout is a reference that must be resolved into a normalized member object.

The engine should identify:

- What the member is
- Where it is located
- What it supports
- What supports it
- What material it is
- What size it is
- What length it is
- What details or schedules define it
- What connectors or hardware are associated with it

---

# Structural Member vs Connector

Structural members carry load.

Connectors transfer load between members.

## Structural Members

Examples:

- Beam
- Header
- Girder
- Joist
- Rafter
- Ridge beam
- Ridge board
- Hip rafter
- Valley rafter
- Post
- Column
- Stud pack
- Rim board
- Blocking panel
- Truss
- Built-up member
- LVL
- PSL
- LSL
- Glulam
- Steel beam
- Steel column

## Connectors / Associated Hardware

Examples:

- Joist hanger
- Beam hanger
- Holdown
- Strap
- Clip
- Anchor
- Base
- Cap
- Bolt
- Screw
- Nail
- Web stiffener
- Bearing plate

Connectors should be attached to structural member objects as associated hardware.

Do not classify connectors as structural members.

---

# Structural Member Categories

The engine should recognize:

- Header
- Beam
- Girder
- Joist
- Floor joist
- Ceiling joist
- Rim board
- Rim joist
- Blocking
- Blocking panel
- Rafter
- Truss
- Ridge beam
- Ridge board
- Hip member
- Valley member
- Post
- Column
- Stud pack
- Built-up stud
- Cripple member
- Trimmer
- Stair opening member
- Floor opening member
- Roof opening member
- Engineered wood member
- Steel member
- Unknown structural member

Use `unknown structural member` when the member appears structural but cannot be confidently classified.

---

# Identification Inputs

Use all available evidence.

Geometry:

- Thickened lines
- Beam lines
- Joist layouts
- Truss layouts
- Post symbols
- Grid alignment
- Bearing locations
- Repeated spacing
- Member direction
- Span direction

Annotations:

- Member tags
- Beam callouts
- Header callouts
- Joist callouts
- Post labels
- Column labels
- Keynotes
- Detail references
- Section references

Schedules:

- Beam schedule
- Header schedule
- Column schedule
- Joist schedule
- Truss schedule
- Hardware schedule

Structural context:

- Load path
- Bearing walls
- Foundation support
- Floor framing direction
- Roof framing direction
- Shear wall locations
- Openings
- Sections
- Details

Do not rely on any one source alone.

---

# Resolution Workflow

For every potential structural member:

1. Detect member candidate.
2. Classify member category.
3. Locate schedule reference.
4. Locate detail or section reference.
5. Resolve material.
6. Resolve size.
7. Resolve ply count if built-up.
8. Resolve length or span.
9. Resolve bearing/support conditions.
10. Resolve associated connectors.
11. Validate against plans, schedules, and details.
12. Create normalized Structural Member object.
13. Generate review items for unresolved information.

---

# Material Types

The engine should identify material type when available:

- Solid-sawn lumber
- Engineered wood
- LVL
- PSL
- LSL
- Glulam
- I-joist
- Rim board
- Steel
- Unknown material

Do not infer engineered member type from size alone.

---

# Headers

Headers span over openings.

Common sources:

- Door schedule
- Window schedule
- Header schedule
- Wall sections
- Structural details
- Framing plans

Extract:

- Opening association
- Header size
- Header material
- Header length
- Ply count
- Bearing requirement
- King/jack stud requirements
- Detail reference

Review items:

- Header size missing
- Header schedule missing
- Opening association missing
- Ply count unclear
- Bearing requirement unresolved
- Detail reference missing

---

# Beams and Girders

Beams and girders carry floor, roof, wall, or concentrated loads.

Common sources:

- Structural framing plans
- Beam schedule
- Sections
- Details
- Grid lines
- Bearing wall plans
- Column/post schedules

Extract:

- Beam ID
- Material
- Size
- Length/span
- Ply count
- Bearing points
- Supported members
- Supporting members
- Elevation if shown
- Connector requirements
- Schedule reference
- Detail reference

Review items:

- Beam size missing
- Beam material missing
- Beam length unclear
- Bearing point unresolved
- Beam schedule missing
- Beam conflicts between plan and schedule
- Connector requirement unresolved

---

# Joists

Joists are repeated horizontal framing members.

Common sources:

- Floor framing plans
- Roof framing plans
- Joist callouts
- Structural notes
- Manufacturer notes
- Details

Extract:

- Joist type
- Joist size/depth
- Joist spacing
- Span direction
- Start/end bearing
- Layout area
- Rim board requirement
- Blocking requirement
- Web stiffener requirement when shown
- Hanger requirement when shown

Review items:

- Joist size missing
- Joist spacing missing
- Span direction unclear
- Bearing support unresolved
- Rim board requirement unclear
- Blocking requirement missing
- Web stiffener requirement unresolved

---

# Rim Board and Rim Joists

Rim members close the floor framing system and transfer loads at the floor perimeter.

Common sources:

- Floor framing plans
- Engineered wood notes
- Details
- Manufacturer specifications

Extract:

- Rim type
- Rim depth
- Rim material
- Length
- Location
- Joist system association
- Load transfer requirements

Review items:

- Rim material missing
- Rim depth unresolved
- Rim board vs rim joist unclear
- Detail reference missing

---

# Rafters and Roof Members

Roof members support roof loads and define roof framing.

Common sources:

- Roof framing plans
- Roof plans
- Sections
- Details
- Structural notes

Extract:

- Member type
- Size
- Spacing
- Span direction
- Pitch association
- Ridge/hip/valley association
- Bearing points
- Connector requirements
- Blocking requirements

Review items:

- Rafter size missing
- Spacing missing
- Roof pitch conflict
- Bearing point unresolved
- Ridge/hip/valley member unresolved

---

# Trusses

Trusses are engineered roof or floor framing systems.

Common sources:

- Truss layout
- Truss schedule
- Roof framing plan
- Deferred submittal notes
- Manufacturer notes

Extract:

- Truss ID
- Truss type
- Layout area
- Spacing
- Bearing points
- Span
- Special truss conditions
- Deferred submittal status

Review items:

- Truss layout missing
- Truss spacing missing
- Truss schedule missing
- Bearing condition unresolved
- Truss design deferred without enough takeoff information

---

# Posts and Columns

Posts and columns carry concentrated loads.

Common sources:

- Foundation plans
- Framing plans
- Column schedules
- Beam schedules
- Details
- Sections
- Grid lines

Extract:

- Post/column ID
- Material
- Size
- Height
- Location
- Supported member
- Supporting condition
- Base/cap connector requirements
- Schedule reference

Review items:

- Post size missing
- Post material missing
- Height unresolved
- Supported beam unresolved
- Base/cap connector unresolved
- Schedule conflict

---

# Built-Up Members

Built-up members are multiple plies acting together.

Examples:

- Double LVL
- Triple LVL
- Built-up post
- Stud pack
- Multi-ply header
- Built-up girder

Extract:

- Individual ply size
- Ply count
- Overall member size
- Fastening requirements when shown
- Member length
- Location
- Associated load path

Review items:

- Ply count unclear
- Fastening requirement missing
- Built-up member conflicts with schedule

---

# Blocking and Load Transfer Members

Blocking may be structural when it transfers load, supports sheathing edges, braces members, or supports hardware.

Common sources:

- Shear wall details
- Floor framing details
- Roof framing details
- I-joist details
- Fire blocking notes
- Manufacturer details

Extract:

- Blocking type
- Location
- Size
- Spacing
- Purpose
- Associated assembly
- Detail reference

Review items:

- Blocking requirement unclear
- Blocking size missing
- Blocking location missing
- Structural vs non-structural blocking unclear

---

# Steel Members in Framing Scope

Some framing packages include steel beams or columns.

Extract when shown:

- Steel member ID
- Shape designation
- Size
- Length
- Location
- Bearing/support condition
- Connection references
- Fireproofing/rating notes only when relevant to framing scope

Review items:

- Steel size missing
- Connection detail missing
- Bearing condition unresolved
- Steel member outside framing scope but structurally relevant

---

# Relationship Mapping

Every structural member should attempt to resolve:

- Supports
- Supported by
- Bears on
- Spans between
- Associated opening
- Associated wall
- Associated floor system
- Associated roof system
- Associated connector hardware

These relationships are critical for validation and material calculation.

---

# Schedule Resolution

Schedules may define:

- Member ID
- Member type
- Material
- Size
- Ply count
- Length
- Quantity
- Bearing notes
- Connection notes
- Detail references

The engine should resolve all available schedule properties.

Never assume schedule values apply unless the member ID or condition matches.

---

# Cross Validation

Validate structural members against:

1. Structural schedules
2. Structural details
3. Structural sections
4. Structural plans
5. Architectural openings
6. Wall layout
7. Floor framing layout
8. Roof framing layout
9. General structural notes

Create review items for unresolved conflicts.

---

# Conflict Resolution

Prefer:

1. Structural schedules
2. Structural details
3. Structural sections
4. Structural plans
5. Manufacturer-specific notes
6. General structural notes
7. Architectural plans
8. Visual geometry only

Do not silently override conflicting structural information.

---

# Confidence Guidance

Confidence increases when:

- Member geometry exists
- Member tag resolves
- Schedule entry resolves
- Size resolves
- Material resolves
- Detail reference resolves
- Bearing points resolve
- Supported/supporting relationships resolve
- Connector requirements resolve

Confidence decreases when:

- Geometry only
- Tag only
- Schedule missing
- Detail missing
- Size missing
- Material missing
- Bearing unresolved
- Conflicting callouts

---

# Normalized Structural Member Object

Every structural member should produce:

- Member ID
- Member category
- Material type
- Size
- Ply count
- Length
- Quantity
- Location
- Source sheets
- Schedule reference
- Detail reference
- Associated wall
- Associated opening
- Associated floor system
- Associated roof system
- Supports
- Supported by
- Bearing conditions
- Associated connectors/hardware
- Confidence score
- Review items

---

# Review Item Triggers

Create review items when:

- Structural member appears without tag
- Member tag exists without geometry
- Member schedule is missing
- Member size is missing
- Member material is missing
- Ply count is unclear
- Length/span is unclear
- Bearing condition is unresolved
- Supported/supporting relationship is unresolved
- Connector requirement is unresolved
- Detail reference cannot be found
- Schedule conflicts with plan
- Structural note conflicts with schedule
- Member appears outside expected scope
- Confidence is below project threshold

---

# Accuracy Rules

- Do not calculate a structural member directly from a callout.
- Do not assume material from abbreviation unless supported by notes or schedules.
- Do not assume LVL, PSL, LSL, or glulam interchangeability.
- Do not assume ply count.
- Do not assume bearing length.
- Do not assume connector type.
- Do not treat connectors as structural members.
- Do not treat every line as a beam.
- Do not infer member size from line weight alone.
- Missing structural information creates review items, not guessed quantities.

---

# Net Structural Member Material Quantity

This rule defines net physical material linear footage for **one resolved Structural Member object**.

The calculator consumes already-resolved properties. It does not determine quantity, ply count, size, material type, or length.

This is net construction quantity. It is not waste, purchasing optimization, or a complete framing package around the member.

## Quantity

`quantity` is the number of identical resolved member assemblies or occurrences represented by that Structural Member object.

Do not infer `quantity` from the number of callouts or repeated symbols unless resolution has already established that count.

## Ply count

`plyCount` is the number of physical material plies composing **one** explicitly built-up member assembly.

A member is explicitly built-up when its `category` is `built-up-member`.

For an explicitly built-up member, resolved `plyCount` is required to calculate material linear footage.

For a non-built-up / single-piece member, `plyCount` is not required. Null means not applicable, not an assumed value of `1`.

Never substitute `plyCount ?? 1`.

## Length

This quantity uses the member's resolved `lengthFeet` as the linear dimension of one assembly, in feet.

That stored length is the span or height already resolved onto the object. This rule does not convert or invent height separately from `lengthFeet`.

## Net material linear footage

Units: feet of physical material.

Single-piece / non-built-up member:

`netMaterialLinearFeet = lengthFeet × quantity`

Explicitly built-up member:

`netMaterialLinearFeet = lengthFeet × quantity × plyCount`

This value is unrounded net material linear footage, before waste or purchasing-length rounding.

## Output

Emit **linear-foot** material output only.

Do not emit a second `each` line item for assembly occurrence count. `quantity` remains an input to the linear-footage calculation.

## Material identity

Classify the material only from resolved properties:

- `category`
- `materialType`
- `size`

Do not infer engineered material type from dimensions.

## Skip behavior

Net material linear footage cannot be calculated when any required input is unresolved:

- `lengthFeet`
- `quantity`
- required material identity (`category` other than unknown, `materialType`, and `size`)
- `plyCount` when the member is explicitly built-up

A non-built-up member does not fail merely because `plyCount` is null or not applicable.

## Exclusions

This rule does not calculate or infer:

- Connectors
- Hardware
- Fasteners
- Bearing requirements
- Opening-derived framing extras
- Engineered member sizing
- Missing ply count
- Waste
- Stock lengths
- Purchasing optimization
- Pack quantities

---

This file is construction knowledge for Claude extraction context. Do not create a JSON companion.
