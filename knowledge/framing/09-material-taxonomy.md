# Material Taxonomy

## Purpose

This document defines the canonical material taxonomy used by the framing engine.

The taxonomy provides a normalized material language for all framing objects.

It is **not** a purchasing catalog.

It is **not** a supplier catalog.

It is **not** a pricing database.

It exists to consistently classify framing materials regardless of how they are represented in construction documents.

---

# Core Rule

Classify materials by what they are.

Do not classify them by:

- Manufacturer
- SKU
- Supplier
- Board length
- Pricing
- Packaging

Those belong to downstream purchasing systems.

---

# Material Hierarchy

Every framing material should belong to a single canonical category.

```
Material
│
├── Lumber
├── Engineered Wood
├── Structural Panels
├── Trusses
├── Structural Steel
├── Blocking
├── Connectors
├── Fasteners
├── Hardware
├── Miscellaneous Structural Materials
└── Unknown Material
```

---

# Lumber

Solid-sawn dimensional lumber.

Examples:

- SPF
- Douglas Fir-Larch
- Hem-Fir
- Southern Pine
- Cedar
- Redwood

Extract when available:

- Species
- Grade
- Treatment
- Appearance designation
- Structural notes

Do not infer species unless supported by project documents.

---

# Engineered Wood

Factory-manufactured structural wood products.

Categories:

- LVL
- LSL
- PSL
- Glulam
- I-Joist
- Rim Board
- Structural Composite Lumber
- Engineered Rim Product

Extract:

- Product category
- Manufacturer when specified
- Depth
- Width
- Length
- Ply count
- Structural notes

Normalize all manufacturer names into their canonical product category.

Example:

Microllam

↓

LVL

---

# Structural Panels

Structural sheet goods.

Categories:

- OSB
- Plywood
- Structural Composite Panel

Extract:

- Panel type
- Thickness
- Grade
- Span rating
- Exposure rating
- Edge treatment

Review items:

- Panel thickness missing
- Panel type unclear

---

# Trusses

Factory-built framing systems.

Categories:

- Roof Truss
- Floor Truss
- Scissor Truss
- Girder Truss
- Mono Truss
- Valley Truss
- Specialty Truss

Extract:

- Truss type
- Layout
- Spacing
- Span
- Deferred status

Do not decompose trusses unless project rules require it.

---

# Structural Steel

Steel framing members that appear within framing scope.

Categories:

- Wide Flange
- HSS
- Channel
- Angle
- Plate
- Tube
- Pipe

Extract:

- Shape
- Size
- Length
- Material designation
- Coating when specified

---

# Blocking

Blocking used within framing systems.

Categories:

- Solid Blocking
- Panel Blocking
- Fire Blocking
- Rim Blocking
- Lateral Blocking
- Web Blocking
- Squash Blocks

Extract:

- Blocking type
- Material
- Size
- Location
- Purpose

---

# Connectors

Structural load transfer devices.

Categories:

- Joist Hanger
- Beam Hanger
- Holdown
- Strap
- Clip
- Anchor
- Base
- Cap
- Tie
- Plate Connector

Connectors are associated with structural members.

They are not structural members.

---

# Fasteners

Mechanical fastening systems.

Categories:

- Nail
- Screw
- Bolt
- Lag Screw
- Threaded Rod
- Structural Screw
- Anchor Bolt

Extract:

- Fastener type
- Diameter
- Length
- Coating
- Quantity when specified

Do not infer fastener schedules.

---

# Hardware

Miscellaneous framing hardware.

Categories:

- Bearing Plate
- Shim
- Spacer
- Washer
- Nut
- Bracket
- Miscellaneous Hardware

Extract only when relevant to framing scope.

---

# Miscellaneous Structural Materials

Items that do not fit another category.

Examples:

- Bearing pads
- Isolation materials
- Structural foam
- Specialty products

Generate review items when classification is unclear.

---

# Unknown Material

Use when:

- Material exists
- Classification cannot be confidently determined

Never guess material category.

Generate review items.

---

# Material Resolution

Material information may come from:

- Structural notes
- General notes
- Material schedules
- Beam schedules
- Wall schedules
- Details
- Sections
- Callouts
- Specifications
- Manufacturer references

Combine evidence before finalizing classification.

---

# Material Aliases

Normalize common aliases.

Examples:

Microllam

↓

LVL

Versa-Lam

↓

LVL

Parallam

↓

PSL

TimberStrand

↓

LSL

Do not treat manufacturer branding as separate material categories.

---

# Material Inheritance

Material information may inherit from:

Project Notes

↓

Structural Notes

↓

Assembly

↓

Member

↓

Detail

Later information may override earlier information.

---

# Cross Validation

Validate materials against:

- Structural schedules
- Structural notes
- Details
- Sections
- Specifications
- Manufacturer references

Generate review items for unresolved conflicts.

---

# Conflict Resolution

Prefer:

1. Structural schedules
2. Structural details
3. Structural sections
4. Structural notes
5. Specifications
6. Architectural notes
7. General notes

Do not silently overwrite conflicting material definitions.

---

# Confidence Guidance

Confidence increases when:

- Material is explicitly specified
- Schedule resolves
- Details agree
- Specifications agree
- Multiple sources match

Confidence decreases when:

- Material inferred from abbreviation
- Conflicting notes
- Missing schedules
- Missing specifications
- Manufacturer unclear

---

# Review Item Triggers

Create review items when:

- Material type missing
- Material category unresolved
- Species missing when required
- Grade missing when required
- Panel thickness missing
- Engineered product unresolved
- Manufacturer conflicts
- Schedule conflicts
- Detail conflicts
- Material outside framing scope
- Confidence below project threshold

---

# Normalized Material Object

Every resolved material should produce:

- Material category
- Material type
- Canonical classification
- Manufacturer (when specified)
- Species (when applicable)
- Grade (when applicable)
- Dimensions (when explicitly specified)
- Treatment
- Structural properties
- Source sheets
- Source references
- Confidence score
- Review items

---

# Accuracy Rules

- Classify materials, not products.
- Normalize manufacturer aliases.
- Never infer species.
- Never infer grade.
- Never infer engineered product type.
- Never infer panel thickness.
- Never infer treatment.
- Missing material information produces review items rather than guessed classifications.