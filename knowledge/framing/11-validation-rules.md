# Validation Rules

## Purpose

This document defines how the framing engine validates extracted information, normalized objects, assumptions, and final takeoff quantities.

Validation is not a single final step.

Validation should happen throughout the pipeline.

The goal is to catch missing, conflicting, low-confidence, or structurally unsafe information before it produces incorrect material quantities.

---

# Core Rule

Validate early.

Validate often.

Never allow unresolved or conflicting information to silently flow into final takeoff quantities.

Validation should create review items instead of guessing.

---

# Validation Levels

The framing engine should validate at multiple levels:

1. Page Validation
2. Sheet Catalog Validation
3. Extraction Validation
4. Object Validation
5. Assembly Validation
6. Cross-Sheet Validation
7. Material Validation
8. Assumption Validation
9. Calculation Validation
10. Output Validation

Each level should produce review items when issues are found.

---

# 1. Page Validation

Validate that each page can be used reliably.

Check:

- Page is readable
- Page scale is available or inferable
- Sheet title is detected
- Sheet number is detected
- Discipline is detected
- Revision information is captured
- Page is not duplicated unless intentionally revised
- Page is not blank
- Page is not corrupted
- Scan quality is sufficient for visual extraction

Create review items when:

- Page is unreadable
- Scale is missing
- Sheet title is missing
- Sheet number is missing
- Duplicate sheet conflict exists
- Revision order is unclear
- Scan quality prevents reliable extraction

---

# 2. Sheet Catalog Validation

Validate the sheet catalog before extraction depends on it.

Check:

- Sheet index matches detected sheets
- Referenced sheets exist
- Structural sheets are present when required
- Architectural sheets are present when required
- Detail sheets are present when referenced
- Schedule sheets are present when referenced
- Latest revisions are used

Create review items when:

- Sheet listed in index is missing
- Sheet exists but is not listed
- Referenced sheet cannot be found
- Structural sheets are missing
- Schedule sheets are missing
- Revision conflict exists

---

# 3. Extraction Validation

Validate raw extraction before normalization.

Check:

- Extracted objects have source references
- Extracted dimensions include units
- Extracted tags preserve original text
- Extracted callouts preserve sheet/detail references
- Extracted schedules preserve row/column context
- OCR/text extraction aligns with visual evidence
- Vision extraction aligns with text evidence

Create review items when:

- Extracted value has no source
- Dimension lacks units
- Tag is ambiguous
- Callout cannot be parsed
- Schedule row is incomplete
- Text and visual extraction disagree

---

# 4. Object Validation

Validate normalized objects before they are used by calculators.

Objects include:

- Walls
- Openings
- Structural Members
- Materials
- Assemblies
- Assumptions

Check every object for:

- Stable ID
- Object type
- Source sheets
- Supporting evidence
- Required properties
- Confidence score
- Review items
- Parent/child relationships when applicable

Create review items when:

- Object has no source sheet
- Object has no supporting evidence
- Object type is unresolved
- Required property is missing
- Parent object is missing
- Child object is orphaned
- Confidence is below threshold

---

# 5. Wall Validation

Validate every wall object.

Check:

- Wall geometry exists
- Wall tag resolves when present
- Wall type resolves
- Wall length is calculated
- Wall height is resolved or assumed
- Interior/exterior classification is supported
- Bearing classification is supported
- Shear/braced classification is supported
- Rated classification is supported when applicable
- Construction phase is clear

Create review items when:

- Wall geometry is missing
- Wall tag does not resolve
- Wall type is missing
- Wall length is unclear
- Wall height is unresolved
- Bearing condition is unclear
- Shear wall designation is unresolved
- Rated assembly reference is missing
- Wall conflicts between architectural and structural sheets

---

# 6. Opening Validation

Validate every opening object.

Check:

- Opening geometry exists
- Opening category is resolved
- Parent wall/floor/roof object exists
- Schedule entry resolves when applicable
- Nominal dimensions resolve
- Rough opening dimensions resolve or are flagged
- Header association resolves when required
- Structural detail resolves when referenced

Create review items when:

- Opening has no parent object
- Opening tag does not resolve
- Schedule entry is missing
- Dimensions conflict
- Header is missing
- Rough opening is unresolved
- Opening appears in schedule but not on plan
- Opening appears on plan but not in schedule

---

# 7. Structural Member Validation

Validate every structural member object.

Check:

- Member category is resolved
- Material is resolved
- Size is resolved
- Length/span is resolved
- Ply count is resolved when applicable
- Bearing/support conditions resolve
- Supported/supporting relationships resolve
- Schedule reference resolves when applicable
- Detail reference resolves when applicable
- Associated connectors are captured when shown

Create review items when:

- Member type is unknown
- Member material is missing
- Member size is missing
- Ply count is unclear
- Length/span is unclear
- Bearing condition is unresolved
- Schedule reference is missing
- Detail reference is missing
- Connector requirement is unresolved

---

# 8. Assembly Validation

Validate every assembly before material calculation.

Check:

- Assembly type is resolved
- Assembly source sheets exist
- Assembly required objects are present
- Wall/opening/member relationships are valid
- Assembly dimensions are resolved
- Assembly materials are resolved
- Assembly assumptions are attached
- Assembly review items are carried forward

Create review items when:

- Assembly type is unknown
- Assembly has missing child objects
- Assembly dimensions are incomplete
- Assembly material is unresolved
- Assembly relies on high-risk assumptions
- Assembly conflicts with referenced detail

---

# 9. Cross-Sheet Validation

Validate coordinated information across sheets.

Compare:

- Architectural plans vs structural plans
- Plans vs schedules
- Plans vs sections
- Plans vs details
- Schedules vs details
- Structural notes vs general notes
- Elevations vs plans
- Enlarged plans vs overall plans
- Repeated units vs typical unit plans

Create review items when:

- Wall shown on one sheet but missing on another
- Opening schedule conflicts with plan
- Header schedule conflicts with opening
- Beam schedule conflicts with framing plan
- Detail reference cannot be found
- Section reference cannot be found
- Enlarged plan overrides are unclear
- Repeated unit differs from typical layout
- Notes conflict with schedules

---

# 10. Material Validation

Validate material classifications.

Check:

- Material category is resolved
- Material type is resolved
- Species is resolved when required
- Grade is resolved when required
- Engineered wood type is resolved
- Panel type is resolved
- Panel thickness is resolved
- Treatment is resolved when specified
- Material aliases are normalized

Create review items when:

- Material category is unknown
- Species is missing when required
- Grade is missing when required
- Engineered wood type is ambiguous
- Panel thickness is missing
- Treatment conflicts
- Manufacturer alias cannot be normalized

---

# 11. Assumption Validation

Validate every assumption before calculation.

Check:

- Assumption has structured record
- Assumption source type is identified
- Assumption reason is documented
- Assumption risk level is assigned
- Assumption material impact is assigned
- Assumption is allowed by assumption rules
- User-editable status is known
- Review requirement is assigned

Create review items when:

- Assumption lacks source
- Assumption lacks reason
- Assumption risk is unknown
- Assumption is forbidden
- Assumption affects safety-critical quantities
- Assumption is used where explicit project information exists

---

# 12. Calculation Validation

Validate deterministic calculations.

Check:

- Inputs are complete enough to calculate
- Units are normalized
- Formulas use resolved object properties
- Assumptions are included explicitly
- Waste is applied separately
- Rounding is deterministic
- Calculated quantity is non-negative
- Quantity unit matches material type
- Duplicate counting is avoided

Create review items when:

- Required input is missing
- Unit conversion fails
- Quantity is negative
- Quantity is unexpectedly zero
- Material is counted twice
- Waste is hidden inside formula
- Rounding rule is missing
- Formula uses unresolved property

---

# 13. Output Validation

Validate final takeoff output before presenting it.

Check:

- Every line item traces back to source objects
- Every source object traces back to sheets
- Every assumption is surfaced
- Every review item is included
- Quantities are grouped correctly
- Units are correct
- Waste is shown separately
- Confidence is shown
- Exclusions are shown
- Unresolved items are not hidden

Create review items when:

- Line item lacks source object
- Quantity lacks traceability
- Assumption is hidden
- Review item is dropped
- Unit mismatch exists
- Scope exclusion is unclear

---

# Validation Severity

Every validation issue should have a severity.

## Info

Non-blocking note.

Examples:

- Low-impact assumption used
- Minor rounding occurred

## Warning

Takeoff can continue, but review is recommended.

Examples:

- Wall height assumed
- Stud spacing assumed
- Opening rough size unresolved
- Material grade missing

## Critical

Takeoff can continue only with unresolved review item.

Quantity may be incomplete or excluded.

Examples:

- Beam size missing
- Header size missing
- Shear wall schedule missing
- Structural member unresolved

## Blocking

Pipeline cannot safely calculate affected quantity.

Examples:

- No readable plans
- No scale for measured takeoff
- Missing entire structural sheet set
- Calculator input impossible to resolve

Blocking should affect only the relevant calculation area when possible, not the entire project.

---

# Validation Output

Every validation issue should produce:

- Validation ID
- Severity
- Object type
- Object ID
- Source sheet
- Rule violated
- Explanation
- Recommended user action
- Affected quantities
- Can calculate affected quantity
- Review item created

---

# Review Item Creation

Validation should create review items when:

- Information is missing
- Evidence conflicts
- Confidence is low
- Assumption requires confirmation
- Calculation cannot safely proceed
- Output needs user confirmation

Review items should be actionable.

Bad review item:

`Wall issue found.`

Good review item:

`Wall W-17 appears on A2.1 but has no resolved wall type. Confirm whether this is 2x4 interior partition, 2x6 exterior wall, or another assembly.`

---

# Accuracy Rules

- Validate before calculating.
- Validate after calculating.
- Validation should be object-based, not text-only.
- Validation should preserve source references.
- Validation should not silently fix conflicts.
- Validation should not delete unresolved objects.
- Validation should create review items instead of guessing.
- Validation should only block affected quantities when possible.
- Final output must expose unresolved validation issues.

This file defines layered validation behavior for the framing engine. Do not create a JSON companion yet.
