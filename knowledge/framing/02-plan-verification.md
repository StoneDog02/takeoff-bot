# Plan Verification

## Purpose

Plan Verification happens before framing extraction.

Its job is to determine whether the uploaded plan set is usable, complete enough, and correctly classified before the framing pipeline begins.

The framing pipeline should not immediately extract walls, openings, or materials after upload. It should first verify the plan set.

---

## Core Principle

Do not measure before verifying the drawings.

The system should first answer:

- What type of project is this?
- What plan sheets are included?
- Are key framing-related sheets present?
- Are there revisions or addenda?
- Is the plan quality good enough to extract from?
- What sheets or schedules appear to be missing?
- Can framing proceed, or should review items be created first?

---

## Project Type Classification

The system should classify the project as one of:

- Residential
- Multifamily
- Commercial
- Civil
- Unknown

The selected or detected project type controls which knowledge files and scope assumptions are loaded later.

If the user manually selects a project type, that selection should override AI classification unless the plans clearly conflict.

---

## Plan Quality Classification

The system should classify plan quality as one of:

- Digital vector PDF
- Searchable PDF
- OCR scanned PDF
- Low-quality scan
- Rotated/skewed scan
- Mixed quality
- Unknown

Plan quality affects extraction confidence.

Low-quality or scanned plans should not stop the pipeline automatically, but they should create review warnings and may require vision/OCR support.

---

## Required Verification Checks

Before framing extraction, verify:

### Plan Set Identity

Check for:

- Project name
- Project address if available
- Architect/designer/engineer if available
- Issue date
- Drawing set name
- Permit/bid/construction status if available

### Sheet Index

Check for:

- Sheet index exists
- Sheet numbers are readable
- Sheet titles are readable
- All listed sheets appear to be included
- Extra sheets exist that are not listed
- Duplicate sheet numbers exist

### Revisions and Addenda

Check for:

- Revision dates
- Addendum labels
- Revision clouds
- Delta symbols
- Sheet revision tables
- Multiple versions of the same sheet

If multiple versions of a sheet exist, prefer the latest version but create a review item.

### Discipline Coverage

Identify which disciplines are present:

- Architectural
- Structural
- Civil
- Mechanical
- Electrical
- Plumbing
- Fire protection
- Landscape
- Specifications

For framing, architectural and structural sheets are usually the most important.

### Framing-Critical Sheets

Look for:

- Architectural floor plans
- Structural framing plans
- Foundation plans
- Roof framing plans
- Wall sections
- Building sections
- General notes
- Structural notes
- Framing details
- Door schedule
- Window schedule
- Beam schedule
- Wall schedule if present

### Scale and Dimensions

Check for:

- Sheet scale
- Graphic scale
- Dimension strings
- Notes saying “do not scale drawings”
- Missing scale
- Conflicting scale information

The engine should prefer written dimensions over scaled measurements.

### Sheet References

Check for callouts and references to:

- Sections
- Details
- Elevations
- Structural sheets
- Schedules
- Notes

These references will later feed the Page Bundle Builder.

---

## Framing Readiness

The verification stage should classify framing readiness as:

### Ready

Enough architectural and structural information exists to begin framing extraction.

### Ready With Review Items

The pipeline can proceed, but some missing or unclear information must be surfaced.

### Blocked

Critical plan information is missing.

Examples of blocked conditions:

- No floor plans
- No structural sheets when structural framing is required
- Unreadable pages
- Missing sheet index and unclear page titles
- Plan set appears incomplete

---

## Review Items

Create review items for:

- Missing sheet index
- Missing structural sheets
- Missing schedules
- Duplicate sheet numbers
- Multiple revisions of same sheet
- Unreadable title blocks
- Missing scale
- Low-quality scan
- Unknown project type
- Conflicting project type
- Missing framing-critical pages

Review items should include:

- issue
- severity
- affected sheets
- why it matters
- suggested next action

---

## Output Expectations

Plan Verification should output structured information that later stages can consume.

Expected output includes:

- projectType
- planQuality
- planSetStatus
- sheetIndexStatus
- revisionStatus
- availableDisciplines
- availableSchedules
- missingSheets
- duplicateSheets
- framingCriticalPages
- framingReadiness
- reviewItems

---

## Rule

Plan Verification does not calculate quantities.

Plan Verification does not extract framing materials.

Plan Verification decides whether the uploaded plan set is ready for framing extraction and what context must be preserved.