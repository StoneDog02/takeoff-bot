# Framing Scope Definition

## Purpose

The Framing scope is responsible for identifying, extracting, validating, calculating, and reporting all structural framing components required to construct the building's framing package.

The framing scope is responsible for determining material quantities from the construction drawings while preserving traceability back to the source plans and documenting any assumptions or review items required to complete the takeoff.

---

## Scope Responsibilities

The framing scope is responsible for:

- Reading framing-related drawing information.
- Identifying framing assemblies.
- Extracting structured framing data.
- Validating extracted information.
- Calculating framing material quantities.
- Producing a framing material takeoff.
- Producing purchasing-ready framing outputs.
- Identifying missing information requiring user review.

---

## Included Assemblies

The framing scope includes, but is not limited to:

### Exterior Walls

- Studs
- Bottom plates
- Top plates
- Headers
- King studs
- Jack studs
- Cripple studs
- Corners
- Wall intersections
- Wall sheathing
- Wall blocking

### Interior Walls

- Bearing walls
- Non-bearing walls
- Headers
- Blocking

### Floor Framing

- Floor joists
- I-joists
- Rim board
- Beams
- Blocking
- Subfloor

### Roof Framing

- Trusses
- Rafters
- Ridge members
- Valley members
- Hip members
- Roof sheathing
- Blocking

### Structural Members

- LVLs
- PSLs
- LSLs
- Glulam
- Steel beams
- Posts
- Columns

### Miscellaneous

- Fire blocking
- Draft stopping
- Temporary framing where shown
- Framing hardware (future)
- Connectors (future)
- Fasteners (future)

---

## Excluded Assemblies

The framing scope does not calculate:

- Concrete
- Masonry
- Roofing materials
- Siding
- Insulation
- Drywall
- Flooring finishes
- Doors
- Windows
- Electrical
- Plumbing
- HVAC

These belong to their own scopes.

---

## Required Drawing Types

The framing scope may consume information from:

- Architectural floor plans
- Structural framing plans
- Foundation plans
- Roof framing plans
- Wall sections
- Building sections
- Elevations
- Framing details
- Structural details
- General notes
- Structural notes

---

## Required Schedules

The framing scope may reference:

- Door schedules
- Window schedules
- Wall schedules
- Beam schedules
- Framing schedules
- Structural notes

---

## Expected Output

The framing pipeline ultimately produces:

- Material quantities
- Purchasing-ready material lists
- Supporting assumptions
- Validation warnings
- Review items
- Source references
- Confidence information
- Calculation traceability

---

## Guiding Principle

The framing scope models the building as a collection of framing assemblies.

Material quantities are derived from those assemblies.

The framing scope should always preserve the relationship between:

Drawing → Assembly → Material → Quantity