# Wall Identification

## Purpose

This document defines how the framing engine should identify walls from construction plans.

Wall identification is a recognition step, not a calculation step.

The goal is to determine which plan elements are walls, what kind of walls they are, and how much confidence the engine has before wall type assignment, opening extraction, structural member extraction, and framing calculations.

---

# Core Rule

Never identify a wall from a single signal.

A wall should be identified using corroborating evidence from multiple sources.

If evidence is weak, missing, or conflicting, create review items instead of guessing.

---

# Wall Identification Inputs

Use all available evidence, including:

- Visible plan linework
- Wall thickness
- Wall tags
- Wall type callouts
- Dimensions
- Room boundaries
- Door and window placement
- Exterior envelope geometry
- Structural notes
- Architectural notes
- Sections
- Details
- Enlarged plans
- Schedules
- Legends
- Grid lines
- Bearing lines
- Shear wall plans
- Holdown symbols
- Repetition patterns

Do not rely on any one input alone.

---

# Primary Wall Categories

The engine should identify these wall categories when evidence supports them:

- Exterior wall
- Interior wall
- Bearing wall
- Non-bearing wall
- Shear wall
- Braced wall panel
- Demising wall
- Corridor wall
- Shaft wall
- Chase wall
- Parapet wall
- Existing wall
- New wall
- Demolition wall
- Rated wall
- Unknown wall

Use `unknown wall` when the object appears to be a wall but cannot be confidently classified.

---

# Evidence Signals

## Geometry Signals

Use geometry to detect likely wall objects.

Signals:

- Parallel line pairs
- Consistent wall thickness
- Closed room boundaries
- Exterior envelope perimeter
- Wall intersections
- Corners
- Openings interrupting linework
- Repeated partition spacing
- Alignment across floors

Geometry alone is not enough to finalize classification.

---

## Annotation Signals

Use annotations to increase confidence.

Signals:

- Wall tags
- Wall type labels
- Section callouts
- Detail callouts
- Keynotes
- Construction notes
- Rated wall labels
- Shear wall labels
- Bearing wall labels
- Existing/new/demo labels

Annotation may be missing, outdated, or inconsistent. Validate against geometry and other sheets.

---

## Context Signals

Use surrounding plan context.

Signals:

- Room names
- Exterior/interior location
- Door/window placement
- Gridline alignment
- Floor framing support
- Roof framing support
- Foundation support
- Repetition across units
- Relationship to stairs, shafts, corridors, and mechanical chases

Context improves classification but should not override direct structural evidence.

---

## Structural Signals

Use structural information to identify bearing, shear, and load-resisting walls.

Signals:

- Bearing wall notes
- Beam reactions
- Joist/truss bearing direction
- Foundation bearing lines
- Shear wall schedules
- Holdown symbols
- Anchor bolt notes
- Strap callouts
- Nailing schedules
- Structural sheathing notes
- Collector/chord references
- Detail references

Structural signals are high-value evidence.

---

# Classification Rules

## Exterior Wall

Classify as exterior wall when multiple signals support:

- Wall is on building perimeter
- Wall encloses conditioned/interior space
- Exterior dimensions reference it
- Windows/doors occur along it
- Exterior elevations align with it
- Wall section/detail references exterior assembly

Create review items when:

- Perimeter wall conflicts with interior wall tag
- Exterior wall type is missing
- Exterior sheathing requirement is unclear
- Wall appears exterior but envelope is incomplete

---

## Interior Wall

Classify as interior wall when multiple signals support:

- Wall is inside exterior envelope
- Wall separates rooms or spaces
- Interior dimensions reference it
- Interior door openings occur in it
- Wall type tag references interior partition

Create review items when:

- Wall is visible but untagged
- Wall type cannot be resolved
- Bearing condition is unclear
- Rated condition is unclear

---

## Bearing Wall

Classify as bearing wall when multiple signals support:

- Structural plans identify it as bearing
- Floor joists, roof trusses, rafters, or beams bear on it
- Foundation or framing below aligns with it
- Posts, beams, or load path notes reference it
- Structural details indicate bearing

Create review items when:

- Bearing condition is unclear
- Load path cannot be traced
- Architectural and structural plans conflict
- Bearing wall lacks required wall type or framing info

---

## Non-Bearing Wall

Classify as non-bearing wall when multiple signals support:

- Structural notes identify it as non-bearing
- It does not align with framing support
- It is shown only as partition framing
- It has no structural callouts
- It has deflection/slip track notes in commercial framing

Create review items when:

- Non-bearing label conflicts with apparent load path
- Wall supports framing but is tagged non-bearing
- Structural evidence is missing

---

## Shear Wall

Classify as shear wall when multiple signals support:

- Shear wall schedule references it
- Shear wall line/tag appears on plan
- Holdowns occur at wall ends
- Anchor/strap/nailing notes reference it
- Structural sheathing is specified
- Edge blocking or panel nailing is called out
- Detail references indicate lateral force-resisting wall

Create review items when:

- Shear wall tag cannot be resolved
- Holdown is shown but shear wall designation is missing
- Nailing schedule is missing
- Shear wall length is unclear
- Shear information conflicts across sheets

---

## Braced Wall Panel

Classify as braced wall panel when multiple signals support:

- Braced wall line is shown
- Braced wall method is referenced
- Structural panel bracing notes apply
- Wall bracing schedule references the wall
- Required panel lengths or locations are shown

Create review items when:

- Braced wall method is missing
- Panel length is unclear
- Bracing notes conflict with plans
- Braced wall line cannot be followed

---

## Demising Wall

Classify as demising wall when multiple signals support:

- Wall separates dwelling units or tenant spaces
- Rated assembly reference is shown
- Acoustic/fire separation notes apply
- Repeated unit layout uses same wall condition
- Wall is labeled party wall, demising wall, or separation wall

Create review items when:

- Rated assembly reference is missing
- Stud configuration is unclear
- Wall type conflicts with unit plans or details

---

## Corridor Wall

Classify as corridor wall when multiple signals support:

- Wall borders common corridor
- Rated corridor assembly is referenced
- Door openings from units enter corridor
- Corridor wall tags are repeated
- Enlarged life-safety or architectural plans support condition

Create review items when:

- Corridor wall rating is unclear
- Wall type is unresolved
- Door/opening data conflicts with wall classification

---

## Shaft or Chase Wall

Classify as shaft/chase wall when multiple signals support:

- Wall surrounds shaft, chase, stair, elevator, duct, or riser space
- Rated shaft assembly is referenced
- Shaft details or enlarged plans exist
- Wall continuity extends vertically across floors

Create review items when:

- Shaft wall type is unclear
- Rated assembly is missing
- Shaft/chase wall conflicts between floor plans

---

## Parapet Wall

Classify as parapet wall when multiple signals support:

- Wall extends above roof plane
- Roof plan or wall section shows parapet
- Detail references parapet framing
- Exterior elevation confirms parapet height
- Structural bracing or sheathing notes apply

Create review items when:

- Parapet height is missing
- Bracing detail is missing
- Wall continuation above roof is unclear

---

## Existing, New, and Demolition Walls

Classify construction phase only when notes, legends, or line styles support it.

Signals:

- Existing wall legend
- New wall legend
- Demolition line type
- Phasing notes
- Remodel plans
- Demo sheets
- Keynotes

Create review items when:

- Line style is unclear
- Demo and new work sheets conflict
- Existing wall is reused structurally but framing condition is unknown

---

# Project Type Considerations

## Residential

Common wall identification signals:

- Exterior perimeter walls
- Interior partitions
- Bearing lines
- Shear/braced wall panels
- Garage openings
- Foundation alignment
- Roof/floor framing bearing direction

High-risk misses:

- Short shear wall segments
- Garage return walls
- Tall walls
- Stair opening walls
- Interior bearing walls
- Walls hidden by architectural simplification

---

## Multifamily

Common wall identification signals:

- Unit demising walls
- Corridor walls
- Shaft walls
- Repeated unit walls
- Bearing walls stacked across floors
- Shear walls and holdown lines
- Rated wall assemblies

High-risk misses:

- Repeated unit variations
- Corridor rating changes
- Shaft wall conditions
- Podium transfer conditions
- Wall changes between levels
- Enlarged plan overrides

---

## Commercial / Civil

Common wall identification signals:

- Metal stud partitions
- Exterior backup framing
- Shaft walls
- Rated corridors
- Deflection track notes
- Structural stud gauge/depth notes
- Curtain wall backup conditions

High-risk misses:

- Non-bearing metal stud walls
- Tall partition framing
- Exterior backup framing
- Shaft/chase walls
- Deflection head conditions
- Walls shown primarily in architectural sheets

---

# Confidence Guidance

Confidence should increase when independent evidence agrees.

High confidence requires multiple supporting signals from different evidence types.

Example high-confidence wall:

- Visible wall geometry
- Wall tag exists
- Wall type resolves
- Dimensions align
- Openings align
- Detail or schedule reference supports it

Example low-confidence wall:

- Visible linework only
- No tag
- No dimensions
- No supporting detail
- Ambiguous line style

---

# Conflict Rules

When evidence conflicts, prefer in this order:

1. Structural schedules
2. Structural details
3. Structural plans
4. General structural notes
5. Architectural wall types
6. Architectural plans
7. Typical notes
8. Visual geometry only

Create review items for unresolved conflicts.

Do not silently override conflicting evidence.

---

# Extraction Output Expectations

For each identified wall, produce:

- Wall identifier
- Wall category
- Source sheets
- Supporting evidence
- Conflicting evidence
- Approximate geometry
- Length
- Height if available
- Exterior/interior classification
- Bearing classification
- Shear/braced classification
- Rated classification
- Construction phase
- Confidence score
- Review items

---

# Review Item Triggers

Create review items when:

- Wall appears in geometry but has no tag
- Wall tag exists but no geometry is found
- Wall type cannot be resolved
- Bearing condition is unclear
- Shear wall designation is unresolved
- Rated assembly reference is missing
- Construction phase is unclear
- Wall linework is unreadable
- Wall conflicts between architectural and structural sheets
- Wall appears on one level but not coordinated on adjacent levels
- Openings imply a wall but wall geometry is incomplete
- Detail reference cannot be found
- Schedule reference cannot be found

---

# Accuracy Rules

- Do not infer wall type from appearance alone.
- Do not infer bearing condition from thickness alone.
- Do not assume exterior walls are shear walls.
- Do not assume interior walls are non-bearing.
- Do not assume all repeated walls are identical unless repetition is confirmed.
- Do not use architectural plans alone to finalize structural wall classification.
- Do not calculate materials until wall identity and classification are sufficiently supported.
- Missing evidence creates review items, not guessed classifications.

This file is construction knowledge for Claude extraction context. Do not create a JSON companion.
