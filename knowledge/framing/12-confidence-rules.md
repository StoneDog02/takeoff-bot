# Confidence Rules

## Purpose

This document defines how the framing engine determines confidence, completion, review status, and blocking status.

Confidence is not a single AI feeling.

Confidence is the result of evidence, resolution method, validation results, and deterministic completion.

The engine should maximize deterministic completion while making every uncertain, assumed, or unresolved decision visible and reviewable.

---

# Core Rule

Do not treat missing explicit plan data as automatic low confidence.

A value can be high confidence when it was resolved through an allowed deterministic method.

Examples:

- Explicit project value
- Corroborated evidence
- Deterministic calculation
- Approved industry default
- User override
- Future user or organization default

Confidence should decrease because of uncertainty, conflict, weak evidence, or forbidden assumptions — not merely because an approved default was used.

---

# Separate Concepts

The engine must keep these concepts separate:

1. Confidence
2. Completion
3. Review Status
4. Blocking Status

Do not collapse them into one score.

---

# Confidence

Confidence answers:

> How trustworthy is this resolved value or object?

Confidence is based on:

- Supporting evidence
- Resolution method
- Validation results
- Conflict status
- Assumption status
- Source traceability

High confidence does not always mean no review is required.

---

# Completion

Completion answers:

> How much of the takeoff was successfully completed?

A takeoff may be highly complete even if some values used approved defaults.

Example:

```text
Framing Takeoff
Completion: 98%
Confidence: High
Review Items: 4
Blocking Issues: 0
```

Completion should measure resolved/calculated scope, not whether every value came directly from plans.

---

# Review Status

Review status answers:

> Does the user need to inspect or confirm this value?

Examples:

- No Review Required
- Review Recommended
- Review Required
- User Confirmation Required

A value can be:

```text
High Confidence + Review Required
```

Example:

- Stud spacing missing
- Approved industry default used: 16" O.C.
- Quantity calculated successfully
- User should confirm in review workspace

---

# Blocking Status

Blocking status answers:

> Can the engine safely calculate the affected quantity?

Blocking should apply to the affected quantity, object, or assembly when possible — not the entire project.

Examples:

- Missing beam size blocks beam quantity only
- Missing header schedule blocks affected header quantities
- Missing scale blocks measured quantities on affected sheets

---

# Confidence Dimensions

Confidence should be derived from three dimensions:

1. Evidence Confidence
2. Resolution Confidence
3. Validation Confidence

Completion is tracked separately.

---

# 1. Evidence Confidence

Evidence confidence measures how strongly the object or value is supported by project evidence.

Evidence sources include:

- Geometry
- Tags
- Schedules
- Details
- Sections
- Notes
- Dimensions
- Cross-sheet agreement
- Repetition patterns
- Source sheet quality

## High Evidence Confidence

Use when multiple independent sources agree.

Examples:

- Wall geometry found
- Wall tag resolves
- Wall schedule resolves
- Detail reference resolves
- Dimensions agree

## Medium Evidence Confidence

Use when evidence is partially supported.

Examples:

- Geometry and tag exist, but schedule is missing
- Schedule exists, but detail is missing
- Dimensions are readable, but source quality is low

## Low Evidence Confidence

Use when evidence is weak or isolated.

Examples:

- Geometry only
- Tag only
- Unclear OCR
- Unreadable linework
- Conflicting sources

---

# 2. Resolution Confidence

Resolution confidence measures how the final value was obtained.

## High Resolution Confidence

Use when value comes from:

- Explicit project value
- Deterministic calculation from resolved inputs
- Approved industry default
- User override
- Future user default
- Future organization default

Approved defaults can be high resolution confidence when the rule is allowed, traceable, and reviewable.

## Medium Resolution Confidence

Use when value comes from:

- Partially supported inference
- Low-risk assumption with incomplete evidence
- Contextual resolution without full corroboration

## Low Resolution Confidence

Use when value comes from:

- Weak inference
- Ambiguous source
- Conflicting evidence
- Unverified extraction

## Not Allowed

Do not resolve values using forbidden assumptions.

Examples:

- Beam size guessed
- Header size guessed
- Holdown type guessed
- Shear wall location guessed
- Steel member size guessed

These should create blocking or critical review items.

---

# 3. Validation Confidence

Validation confidence measures whether the resolved value passed validation.

## High Validation Confidence

Use when:

- Object validation passes
- Cross-sheet validation passes
- Material validation passes
- Assumption validation passes
- Calculation validation passes
- No unresolved conflicts exist

## Medium Validation Confidence

Use when:

- Minor review items exist
- Non-critical assumptions exist
- Some supporting references are missing
- Validation warnings exist but calculation remains safe

## Low Validation Confidence

Use when:

- Conflicts remain unresolved
- Critical review items exist
- Parent/child relationships are unresolved
- Calculation inputs are incomplete
- Evidence is contradictory

---

# Confidence + Review Matrix

## High Confidence + No Review

Use when:

- Explicit project evidence exists
- Sources agree
- Validation passes
- No assumptions requiring confirmation

Example:

- Beam size from structural schedule and matching plan callout.

## High Confidence + Review Recommended

Use when:

- Value is deterministic
- Low-risk assumption or default was used
- Quantity is safe to calculate
- User may want to confirm

Example:

- Waste factor applied from configured project default.

## High Confidence + Review Required

Use when:

- Approved industry default was used
- Quantity can be calculated accurately enough for takeoff completion
- User confirmation is still important

Example:

- Residential interior wall stud spacing defaulted to 16" O.C. because wall schedule was missing.

## Medium Confidence + Review Required

Use when:

- Evidence is incomplete
- Inference was used
- Sources are partially corroborated
- Quantity can still be calculated but should be reviewed

Example:

- Wall height inferred from building section but not explicitly tagged on the wall.

## Low Confidence + Review Required

Use when:

- Evidence is weak
- Sources conflict
- Object identity is uncertain
- Quantity may be incomplete or unreliable

Example:

- Possible wall detected from linework only with no tag, no schedule, and no dimension.

## Blocked

Use when:

- Forbidden assumption would be required
- Critical input is missing
- Safe calculation is not possible

Example:

- Header quantity exists, but header size cannot be resolved from schedule, plan, or detail.

---

# Completion Rules

Completion should increase when:

- Object is identified
- Object is normalized
- Required properties are resolved
- Allowed assumptions fill missing values
- Deterministic calculations complete
- Review item does not block calculation

Completion should decrease when:

- Object cannot be identified
- Required properties are missing
- Calculation is blocked
- Quantity is excluded
- Critical review item remains unresolved

Completion should not decrease simply because a reviewable approved default was used.

---

# Object-Level Confidence

Each normalized object should have confidence.

Objects include:

- Wall
- Opening
- Structural Member
- Assembly
- Material
- Assumption
- Calculation Result

Object confidence should include:

- Evidence confidence
- Resolution confidence
- Validation confidence
- Review status
- Blocking status
- Source references

---

# Takeoff-Level Confidence

Overall takeoff confidence should summarize object-level confidence.

It should consider:

- Number of high-confidence objects
- Number of medium-confidence objects
- Number of low-confidence objects
- Number of blocked quantities
- Number of critical review items
- Quantity impact of unresolved items
- Validation results

Do not average confidence blindly.

A single missing beam size may matter more than many low-risk stud spacing defaults.

---

# Quantity Impact Weighting

Confidence should account for material impact.

High-impact objects:

- Beams
- Headers
- Structural members
- Shear walls
- Roof framing
- Floor framing
- Large wall assemblies

Low-impact objects:

- Minor blocking
- Small assumptions
- Rounding
- Low-cost accessories

A low-confidence high-impact object should affect takeoff confidence more than many low-impact review items.

---

# Assumptions and Confidence

Allowed assumptions should not automatically reduce confidence to low.

Instead:

- Allowed low-risk assumption → usually high confidence, review recommended
- Allowed medium-risk assumption → medium or high confidence, review required
- Forbidden assumption → not used, blocked or critical review item

Every assumption must remain visible.

---

# Confidence Propagation

Parent objects inherit risk from child objects.

Examples:

- Wall confidence is affected by unresolved openings.
- Opening confidence is affected by unresolved header.
- Assembly confidence is affected by unresolved material.
- Final takeoff confidence is affected by blocked high-impact quantities.

Do not let one unresolved child automatically destroy the entire project confidence unless it materially affects the takeoff.

---

# Source Traceability

Every confidence score should be explainable.

The engine should be able to answer:

- What evidence supports this?
- What value was resolved?
- How was it resolved?
- What validation passed?
- What review items remain?
- What quantity is affected?

Do not output confidence without source traceability.

---

# Confidence Labels

Use labels for user-facing output.

Recommended labels:

- High
- Medium
- Low
- Blocked

Optional internal numeric scores may exist, but user-facing confidence should remain understandable.

Do not expose meaningless precision like:

```text
Confidence: 83.42%
```

Prefer:

```text
Confidence: High
Completion: 98%
Review Items: 4
Blocking Issues: 0
```

---

# Review Workspace Behavior

The review workspace should show:

- Confidence label
- Completion impact
- Review reason
- Source evidence
- Assumption used
- User action
- Quantity impact
- Recalculation status

Example:

```text
Wall W-17

Confidence: High
Review Status: Required
Reason: Approved industry default used.
Default: 2x4 interior partition
Quantity Impact: Studs, plates, blocking
Action: Confirm or override
```

---

# Confidence Output Expectations

For each object, produce:

- Object ID
- Object type
- Evidence confidence
- Resolution confidence
- Validation confidence
- Overall confidence label
- Completion contribution
- Review status
- Blocking status
- Supporting evidence
- Conflicting evidence
- Assumptions used
- Review items
- Quantity impact

For the full takeoff, produce:

- Overall confidence label
- Completion percentage
- Review item count
- Critical review item count
- Blocking issue count
- High-impact unresolved items
- Assumptions used
- Quantities excluded
- Quantities calculated

---

# Accuracy Rules

- Maximize deterministic completion.
- Do not equate assumptions with low confidence.
- Do not equate review required with low confidence.
- Do not equate missing explicit plan data with failure.
- Do not hide uncertainty.
- Do not output unexplained confidence.
- Do not average confidence blindly.
- Do not let low-impact review items dominate takeoff confidence.
- Block only affected quantities when possible.
- Approved defaults may produce high-confidence calculated quantities.
- Forbidden assumptions must not be used to inflate completion.

This file defines confidence, completion, review status, and blocking behavior for the framing engine. Do not create a JSON companion yet.
