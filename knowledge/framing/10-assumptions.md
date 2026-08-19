# Assumptions

## Purpose

This document defines how the framing engine uses assumptions when project information is missing, unclear, or conflicting.

Assumptions are allowed when they help complete the takeoff without hiding uncertainty.

Every assumption must be:

- Deterministic
- Traceable
- Reviewable
- Replaceable

The engine should complete as much of the takeoff as possible, surface every assumption, and allow the user to confirm or override assumed values.

---

# Core Rule

Never hide an assumption.

If the engine uses an assumed value, it must create an assumption record and, when appropriate, a review item.

The user should always be able to see:

- What was assumed
- Why it was assumed
- Where the assumption came from
- What quantity or material it affects
- Whether it can be overridden

---

# Assumption Categories

## Explicit Project Values

These are not assumptions.

They come directly from the project documents.

Examples:

- Wall schedule says `2x6 @ 16" O.C.`
- Header schedule says `2-1/2" x 11-7/8" LVL`
- Structural notes specify `7/16" OSB wall sheathing`
- Roof framing plan specifies trusses at `24" O.C.`

Explicit project values always override assumptions.

---

## Industry Defaults

Industry defaults are common framing values used when project-specific information cannot be resolved.

They may be used only when:

- The missing value is common and low-to-medium risk
- The default is clearly labeled
- The assumption is surfaced for review
- The user can override it

Examples:

- Typical residential stud spacing
- Typical plate configuration
- Typical wall sheathing default
- Typical waste factor
- Typical blocking inclusion

Industry defaults should never silently replace project-specific information.

---

## User Defaults

User defaults are future user-level preferences.

Examples:

- Preferred waste factor
- Preferred exterior wall default
- Preferred stud spacing when unspecified
- Preferred rounding behavior

User defaults may override industry defaults.

Do not build customer-specific logic into the core engine.

---

## Organization Defaults

Organization defaults are future company-level or enterprise-level preferences.

Examples:

- Preferred material substitutions
- Preferred supplier catalog mappings
- Company waste factors
- Company framing standards
- Company pricing rules

Organization defaults may override industry defaults.

They should exist outside the core engine as future extension/configuration packages.

The core engine must remain customer-agnostic.

---

## Forbidden Assumptions

Forbidden assumptions are values the engine must not invent.

These should create review items instead.

Examples:

- Engineered beam size
- LVL/PSL/LSL/glulam size
- Steel beam size
- Column size
- Truss design
- Shear wall location
- Holdown type
- Structural connector type
- Nailing schedule
- Anchor bolt schedule
- Fire-rated assembly framing changes
- Load path design

Forbidden assumptions affect safety, engineering, or material accuracy too heavily to guess.

---

# Assumption Precedence

When multiple possible sources exist, use this order:

1. Explicit project values
2. User override
3. Organization default
4. User default
5. Industry default
6. Review item with no assumed value

Never let a lower-priority default override a higher-priority source.

---

# Allowed Framing Assumptions

## Stud Spacing

Allowed only when wall type or notes are missing but wall category is reasonably clear.

Common default:

- Residential wood stud walls: `16" O.C.`

Review item required.

Do not assume stud spacing when:

- Wall is engineered
- Wall is shear/braced
- Wall is tall
- Wall is commercial metal stud
- Wall schedule conflicts
- Rated assembly depends on stud spacing

---

## Stud Size

Allowed only for low-risk preliminary takeoff completion when wall depth cannot be resolved.

Common defaults:

- Residential interior partition: `2x4`
- Residential exterior wall: `2x6` where energy-code practice or plan context supports it
- Unknown residential wall: `2x4`

Review item required.

Do not assume stud size when:

- Wall is bearing
- Wall is shear/braced
- Wall is tall
- Wall is rated and framing affects assembly
- Wall is commercial metal stud
- Structural notes are missing or conflicting

---

## Wall Height

Allowed when floor-to-floor or ceiling height can be inferred from project metadata, sections, or room notes.

Common defaults:

- Single-story residential wall: use resolved ceiling height when available
- If unresolved, use project default only when explicitly configured

Review item required.

Do not assume wall height when:

- Tall walls are possible
- Sloped ceilings affect height
- Multi-story conditions exist
- Sections conflict
- Exterior elevations conflict

---

## Plate Configuration

Allowed when project documents do not specify otherwise and wall is conventional wood framing.

Common defaults:

- Bottom plate: single
- Top plate: double for conventional wood walls

Review item required if plate configuration materially affects quantity.

Do not assume plate configuration when:

- Wall is non-standard
- Wall is engineered
- Wall has balloon framing
- Wall is commercial metal stud
- Detail conflicts exist

---

## Wall Sheathing

Allowed only when wall assembly indicates structural sheathing but thickness is unreadable or missing.

Common default:

- Residential wood structural wall sheathing: `7/16" OSB`

Review item required.

Do not assume sheathing when:

- Shear wall schedule is missing
- Panel nailing schedule is missing
- Fire/rated assembly is affected
- Sheathing type conflicts
- Wall may be non-sheathed
- Wind/seismic conditions require engineered review

---

## Roof Sheathing

Allowed only for preliminary material completion when roof sheathing is clearly present but thickness is unresolved.

Common defaults:

- `7/16"` or `15/32"` wood structural panel where supported by project context

Review item required.

Do not assume roof sheathing thickness when:

- Roof loading is unusual
- Truss/rafter spacing is unresolved
- High snow/wind/seismic region is indicated
- Structural notes conflict

---

## Floor Sheathing

Allowed only when floor sheathing is clearly required but thickness is unresolved.

Use project notes when possible.

Review item required.

Do not assume floor sheathing thickness when:

- Joist spacing is unresolved
- Floor loading is unusual
- Manufacturer system requirements apply
- Structural notes conflict

---

## Waste Factor

Allowed as a calculator-level assumption.

Typical preliminary defaults:

- Dimensional lumber: configurable project default
- Sheathing panels: configurable project default
- Engineered members: do not apply generic waste unless configured
- Connectors/hardware: do not apply generic waste unless configured

Waste must always be surfaced.

Do not hide waste inside material formulas.

---

## Rounding

Allowed as deterministic calculator behavior.

Examples:

- Stud counts round up to whole pieces
- Sheets round up to whole panels
- Linear materials round up to purchasing unit only in purchasing/export phase

Rounding rules should be documented separately from construction assumptions.

---

## Opening Wall Framing

Opening-derived framing assumptions are governed by `13-opening-wall-framing-calculations.md`.

### Allowed (with assumption record + review)

- King stud count = `2` when no explicit count evidence exists (low structural risk relative to jacks)
- Cripple stud count from rough opening width ÷ wall stud spacing (layout continuation formula)
- Rough sill size = wall stud size when detail is silent
- Conventional wood stud wall when `assembly.material` is null but context supports wood framing

### Forbidden

- Jack stud count from opening width, header span, bearing status, or IRC/code tables
- Jack stud length from linked header horizontal span
- King stud count from IRC Table R602.7.5 or wind/seismic tables
- Header size, ply count, or bearing from opening width
- Rough opening dimensions from nominal size alone
- Net baseline stud deductions without opening position or explicit deduction count
- Garage-door portal framing without structural detail
- Seismic/high-wind/load-bearing doubled jack assumptions

When forbidden facts are missing, block the affected quantity and create review items.

---

# Forbidden Framing Assumptions

Never assume:

- Beam size
- Header size
- Engineered lumber size
- Steel member size
- Post or column size
- Truss layout
- Truss spacing when not shown
- Shear wall location
- Shear wall length
- Holdown type
- Strap type
- Connector model
- Nailing pattern
- Anchor bolt schedule
- Bearing length
- Load path
- Fire-rated assembly substitutions
- Manufacturer-specific engineered product equivalence

These must create review items.

---

# Assumption Record

Every assumption should produce a structured record.

Fields:

- Assumption ID
- Category
- Object type
- Object ID
- Assumed property
- Assumed value
- Source type
- Source explanation
- Reason used
- Material impact
- Risk level
- User editable
- Review required
- Confidence impact
- Replacement value if user overrides

Example:

```text
Assumption ID: A-014
Object Type: Wall
Object ID: W-17
Property: Stud Size
Assumed Value: 2x4
Source Type: Industry Default
Reason: Wall depth could not be resolved from plan linework or schedule.
Material Impact: High
Risk Level: Medium
User Editable: Yes
Review Required: Yes
```

---

# Risk Levels

## Low Risk

Usually acceptable with review.

Examples:

- Minor rounding
- Typical blocking inclusion
- Generic waste factor
- Interior partition default where non-bearing is clear

## Medium Risk

Allowed only with clear review item.

Examples:

- Stud size default
- Stud spacing default
- Wall height default
- Sheathing thickness default

## High Risk

Usually forbidden unless explicitly configured.

Examples:

- Bearing wall assumptions
- Header assumptions
- Shear wall assumptions
- Engineered member assumptions
- Connector assumptions

---

# Review Workspace Behavior

The review workspace should allow users to:

- See every assumption
- Filter assumptions by risk
- Filter assumptions by material impact
- Confirm an assumption
- Override an assumption
- Recalculate affected quantities
- Save confirmed assumptions as future defaults when appropriate

Do not treat review confirmation as hidden logic.

Confirmed assumptions should remain traceable.

---

# Confidence Interaction

Assumptions reduce confidence.

Low-risk assumptions reduce confidence slightly.

Medium-risk assumptions reduce confidence materially.

Forbidden assumptions should not be used; they should create unresolved review items.

Confidence should increase only after user confirmation or explicit project evidence is found.

---

# Assumption Output Expectations

For every takeoff run, produce:

- Assumptions used
- Assumptions rejected
- Forbidden assumptions encountered
- Review items created from assumptions
- Objects affected by assumptions
- Quantity impact when calculable

---

# Accuracy Rules

- Complete the takeoff when reasonable assumptions can be used.
- Never hide assumed values.
- Never use an assumption where explicit project information exists.
- Never assume engineered structural design.
- Never assume safety-critical values.
- Every assumption must be traceable.
- Every user-editable assumption must be replaceable.
- Assumptions create trust only when they are visible.

This file is construction knowledge and behavior guidance for the framing engine. Do not create a JSON companion yet. The core engine must remain customer-agnostic; future user or organization defaults should be treated as external configuration, not hardcoded core logic.
