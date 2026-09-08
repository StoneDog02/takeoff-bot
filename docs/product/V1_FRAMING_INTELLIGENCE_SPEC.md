# V1 Residential Framing Intelligence Specification

**Status:** Canonical V1 Product / Architecture Specification\
**Scope:** Residential framing takeoff intelligence, deterministic
calculation, purchasing, review, accounting, and diagnostics\
**Companion authority:**
`Residential Framing Materials - Master Checklist` /
`RESIDENTIAL_FRAMING_MATERIALS_MASTER_TAXONOMY.pdf`

------------------------------------------------------------------------

## 0. Purpose and Authority

This specification defines **how V1 is allowed to know, resolve,
calculate, materialize, purchase, review, diagnose, and account for
residential framing construction**.

The Master Taxonomy and this specification serve different purposes:

-   **Master Taxonomy = WHAT V1 must account for.**
-   **V1 Framing Intelligence Specification = HOW V1 may know enough to
    produce it.**
-   **Project sources and authorized user inputs = WHAT THIS HOUSE IS.**

The project documents are authoritative for the project's intended
construction. The engine reconstructs and quantifies that design; it
does not silently redesign, optimize, substitute, or contradict it. If
project sources conflict, the engine preserves the evidence, applies
supported specificity and precedence, and surfaces the unresolved
conflict rather than inventing a resolution.

This specification is product and architecture authority. It is **not**
a mandate for exact folder names, class names, database technology,
model provider, microservice boundaries, or UI implementation.
Engineering may map these contracts onto the repository, but may not
reinterpret the locked product architecture.

### 0.1 Canonical truth chain

``` text
PROJECT SOURCES
  -> EVIDENCE
  -> PLAN-SUPPORTED HOUSE
  -> AUTHORIZED RESOLUTION
  -> EFFECTIVE CONSTRUCTION
  -> PHYSICAL REQUIREMENTS / OBJECTS
  -> INSTALLATION DEMAND
  -> INSTALLATION BOM
  -> PURCHASING TRANSFORMATION
  -> PURCHASE BOM
  -> CUSTOMER TAKEOFF + MASTER TAXONOMY ACCOUNTING
```

The HOUSE is progressively reconstructed during READ. The chain above
expresses **authority and responsibility**, not a requirement that every
software stage execute once in a rigid linear sequence.

### 0.2 Canonical resolution ladder

At the property/decision level:

1.  **Project Fact**
2.  **Project-Supported Convention**
3.  **Deterministic Derivation**
4.  **Applicable Construction / Manufacturer / Prescriptive Rule**
5.  **Governed Assumption**
6.  **Unresolved**, when no authorized completion path exists

A Review is not a lower authority source. A Review is a user-facing
state attached to an active value or condition that requires visibility.

Specific project information overrides broader project information.
Applicable rules are consequences of established conditions; assumptions
are authorized gap-filling only after higher-authority project paths are
exhausted.

### 0.3 Canonical vocabulary

-   **Evidence** --- atomic project-source support with source location.
-   **Plan Dictionary** --- project map/manual: sheets, schedules,
    legends, definitions, notes, cross-references, regions, and source
    pointers.
-   **Plan-Supported HOUSE** --- connected physical construction
    representation supported by project evidence before governed
    gap-filling.
-   **Construction Decision** --- property-level resolved construction
    value and its authorized origin.
-   **Effective Construction** --- resolved project construction with
    active user construction overrides applied non-destructively.
-   **Requirement** --- a stable construction need that may be satisfied
    by one or more physical realizations.
-   **Physical Object** --- canonical physical construction identity.
-   **Installation Demand** --- quantity/specification demand caused by
    a physical object, connection, joint, surface, interface, or
    requirement.
-   **Installation BOM** --- what construction physically requires.
-   **MaterialSpecKey** --- construction-equivalent material identity
    used before purchasing aggregation.
-   **PurchaseKey** --- commercially interchangeable purchasable
    identity.
-   **Purchase BOM** --- what must be bought after stock, packaging,
    reuse, inventory, and explicit procurement transforms.
-   **Review** --- active usable value or condition that must be
    surfaced for user review.
-   **Unresolved** --- required value or result that cannot safely be
    established.
-   **Diagnostic** --- developer-facing earliest causal reason for a
    failure or unresolved result.
-   **UserProjectInput** --- user-supplied project-specific information
    that may supplement missing information or clarify ambiguity when it
    does not contradict established project evidence. Retains
    input-provider/user identity, timestamp, target, scope, purpose,
    provenance, and lineage. It is not reusable construction knowledge
    and does not silently outrank plans.
-   **ConstructionOverride** --- explicit non-destructive user
    replacement of an effective construction value when user input
    conflicts with established project evidence. Preserves underlying
    evidence and resolved project value; records target, replacement
    value, user, reason, and scope; creates Review.
-   **ProcurementOverride** --- purchasing-only user replacement of a
    purchasing/procurement decision without rewriting HOUSE.
-   **Taxonomy Accounting** --- explicit closure of every Master
    Taxonomy item against canonical physical/install/purchase state.

------------------------------------------------------------------------

# Part I --- Governing Principles

## 1. Project-Truth Principle

The engine's job is to reconstruct and quantify the project design.
Project evidence remains distinct from the engine's reusable knowledge.
Claude or another reader may extract evidence, but model confidence does
not make a statement authoritative.

## 2. Physical-First Principle

When quantity depends on physical placement, calculate the physical
population/layout first and aggregate second. Do not replace member
layout, panel layout, fastener layout, anchor layout, or connection
topology with area/LF multipliers when the physical arrangement is
determinative.

## 3. Requirement-to-Physical Principle

A requirement is not automatically a material. Resolve:

``` text
requirement -> eligible method -> physical realization -> installation demand -> purchase
```

This is especially important for blocking, fireblocking, temporary
safety systems, connectors, sealants, and other conditions where
multiple compliant physical methods may exist.

## 4. Authorized-Resolution Principle

No construction-significant value may enter deterministic calculation
merely because it is convenient. It must originate from an authorized
project fact, UserProjectInput that does not contradict established
project evidence, project convention, derivation, applicable rule,
governed assumption, or active user override.

## 5. Design-Preservation Principle

Where construction is engineered or design-controlled, V1 preserves,
reconstructs, and quantifies the design. It does not size, redesign,
optimize, substitute, or complete missing structural design through
estimating assumptions.

This includes engineered beams, tall-wall structural design, structural
headers, structural ridge beams, truss design, shear-wall/hold-down
design, engineered stringers, and design-controlled connection
schedules.

## 6. Geometry-to-Physical Principle

Geometry establishes physical possibility and dimensions; construction
method determines what physical framing actually exists. A geometric
valley does not automatically create a valley rafter. A roof plane does
not determine whether framing is stick or truss. A wall outline does not
alone establish bearing, stud size, or structural design.

## 7. Canonical-Identity Principle

HOUSE owns physical identity. Taxonomy categories, roles, discovery
paths, and assembly views do not create duplicate physical objects.

One physical stud may perform multiple roles. One beam may be
encountered by floor, wall, and structural schedules. One sill gasket
may satisfy multiple functional requirements. Purchasing occurs once.

Identify foundation sills and wall bottom plates from actual physical
location and function. Separate plates in construction are separate
HOUSE objects. One plate serving as both concrete/foundation interface
and wall bottom plate is one physical plate with both roles; foundation
and wall taxonomy categories may reference that same object;
installation demand and purchasing occur once. Do not universally merge
sill plates and wall bottom plates.

## 8. Specification-Before-Aggregation Principle

Items may aggregate only when their construction-relevant specifications
are equivalent. Missing specification is not permission to merge unlike
or incompletely known items.

## 9. Installation-Then-Procurement Principle

Construction truth is resolved before purchasing optimization.
Purchasing may transform required cuts into stock, exact pieces into
packages, applied quantities into containers, and permanent remnants
into eligible temporary reuse. It may not redesign construction.

## 10. Localized-Uncertainty Principle

Uncertainty is localized to the property, requirement, calculation, or
purchase result that depends on it. Unknowns do not globally block
unrelated takeoff completion.

## 11. Deterministic-Lineage Principle

Every material result must be explainable through stable lineage from
project/effective construction through physical realization and
installation demand to purchasing transformation.

## 12. Explicit-Closure Principle

Every Master Taxonomy item must end in an explicit terminal state:

-   `complete`
-   `complete_with_review`
-   `partial_unresolved`
-   `not_applicable`

`unaccounted` and `applicability_unestablished` are processing states,
not acceptable final V1 closure.

`not_applicable` must be proven from established HOUSE/project
conditions. It cannot result from missing evidence, empty extraction
output, an unattempted source path, taxonomy membership, or unresolved
applicability.

Examples that clarify existing closure and do not create a new
applicability engine:

-   Confirmed slab-on-grade construction may make suspended floor joists
    inapplicable.
-   Confirmed absence of a deck makes deck framing inapplicable.
-   A confirmed stick-framed roof without manufactured trusses may make
    roof trusses inapplicable.
-   Failure to find truss evidence does not prove trusses are
    inapplicable.

------------------------------------------------------------------------

# Part II --- READ and Project Understanding

## 13. READ Contract

READ exists to reconstruct the **Plan-Supported HOUSE** and exhaust
relevant project-source paths needed by downstream construction
decisions and calculators.

READ does **not** use industry assumptions to make the plans appear
complete.

Canonical READ architecture:

``` text
PDF / PROJECT SOURCES
  -> Project Orientation
  -> ODL / vector / structured evidence extraction
  -> initial Plan Dictionary
  -> READ Planner / agenda
  -> targeted construction reading missions
  -> progressive shared HOUSE reconstruction
  -> relationship binding
  -> controlled Dictionary enrichment
  -> source-path exhaustion
  -> READ COMPLETE
```

### 13.1 Project Orientation

Before detailed extraction, identify the project, plan-set structure,
relevant disciplines, likely framing sheets, schedules, details,
structural calculations, truss/engineered packages, and cross-reference
structure.

### 13.2 Plan Dictionary

The Dictionary is the project's map/manual. It may contain:

-   sheet map and discipline
-   schedules, legends, keys, definitions
-   general and framing notes
-   mark/type definitions
-   detail and section references
-   construction regions
-   source pointers
-   cross-page references
-   top-level project description

It answers primarily **where and what**, not necessarily the final
construction interpretation.

### 13.3 Targeted Reader

Reader missions should be construction-purpose-driven and receive only
relevant context:

-   target question / missing calculator input
-   relevant plan region or whole sheet
-   ODL/vector text and geometry
-   Dictionary entries
-   relevant Construction Brain pack
-   current HOUSE context
-   prior evidence needed for cross-sheet binding

Cheap references are used immediately; expensive visual/model escalation
is batched and targeted.

### 13.4 Cross-sheet evidence

Any sheet, schedule, section, note, detail, architectural drawing,
structural drawing, calculation, truss package, or specification that
determines framing material is valid READ evidence.

Marks and definitions are distinct evidence. Example:

``` text
B4 plan location
+ B4 beam schedule
+ B4 structural detail
= one bound project structural design
```

### 13.5 ReadComplete

Each section's "READ must establish" list is the required input contract
for that section's applicable physical engines. Inputs activate
conditionally from established HOUSE conditions. Ledger-fastener inputs
are not required without a ledger connection. Truss-package inputs are
not required when no truss system exists. Connector/manufacturer inputs
are not required without an applicable connector or connection. Ledger
and applied-product inputs become required only when their parent
object, interface, joint, surface, or requirement exists.

`ReadComplete` means every conditionally required input has had all
relevant project-source paths attempted. It does not mean every input
resolved, or every taxonomy item is complete.

It also does not mean:

-   every quantity is known
-   every uncertainty is resolved
-   confidence is high

Do not create a rigid global checklist or require irrelevant searches.

READ can complete while later resolution legitimately uses governed
assumptions or produces Unresolved.

------------------------------------------------------------------------

# Part III --- Canonical HOUSE and Decision Architecture

## 14. HOUSE = Physical Construction Truth

HOUSE is not a material list and not fifteen taxonomy-shaped models. It
is a connected physical construction graph representing the building's
geometry, assemblies, members, surfaces, openings, supports, interfaces,
requirements, and connections.

Conceptually:

``` text
HOUSE
  Building / Levels / Regions
  Shared Geometry
  Assemblies
    Foundation Interfaces
    Floors
    Walls
    Roofs
    Stairs
    Decks / Porches
    Manufactured Systems
  Physical Elements
    Members
    Panels
    Openings
    Installed Components
    Temporary Elements
  Relationships
    contains
    bounds
    supports
    bears_on
    intersects
    penetrates
    connects_to
    interfaces_with
    satisfies
  Interfaces
  Connections
  Requirements
```

Normalized objects by stable ID and explicit references are preferred
over giant nested objects.

### 14.1 What belongs in HOUSE

If something describes physical construction reality independent of how
it is categorized or purchased, it belongs in HOUSE.

Examples: a wall exists; an opening cuts a wall; a joist bears on a
beam; a beam bears on a post; a roof plane intersects another plane; a
hanger connects two members; a sheathing panel occupies a surface.

### 14.2 What does not belong in HOUSE

Keep separate:

-   Evidence
-   Assumptions
-   UserProjectInput
-   Overrides
-   Reviews
-   Diagnostics
-   Installation BOM
-   Purchase BOM
-   supplier SKU/price
-   Master Taxonomy accounting
-   reusable manufacturer/rule knowledge

### 14.3 Geometry

HOUSE uses shared spatial geometry rather than unrelated wall/floor/roof
coordinate systems. Minimum useful primitives include 3D points, line
segments, polylines, polygons, planes, and bounded regions.

V1 does not require a full CAD kernel, but HOUSE must support 3D
relationships for rake studs, rafters, hips, valleys, jacks, stair
geometry, roof sheathing, braces, and interfaces.

### 14.4 Assemblies, objects, roles

An assembly groups a construction system. Physical objects are the
actual members/components. Roles do not create identity.

A single physical object may participate in multiple assemblies and
taxonomy roles.

### 14.5 Interfaces

Interfaces are first-class physical relationships where construction
systems meet: sill-to-foundation, ledger-to-building, beam-to-post,
panel edge-to-support, roof-to-wall, etc.

Many material requirements arise from interfaces and cannot be safely
derived from either object in isolation.

------------------------------------------------------------------------

## 15. Knowledge and Decision Architecture

V1 distinguishes:

-   **Evidence** --- what this project provides
-   **Knowledge** --- reusable governed rule
-   **Decision** --- value the engine will use

For construction-significant properties, the engine must know the active
value and why it is authorized.

### 15.1 Property-level decisions

Authority belongs to properties, not necessarily whole objects. A wall
may have:

-   geometry from project fact
-   height from derivation
-   stud size from project convention
-   spacing from governed assumption
-   header from project fact

### 15.2 Project-supported convention

A project convention is a project-specific rule legitimately generalized
from explicit project documentation over a defined scope, with
exclusions and evidence references.

A local specific fact overrides a broader convention.

Project convention is **not** an assumption and does not create an
assumption Review.

### 15.3 Derivations

Derivations are deterministic math/logic from resolved inputs: endpoints
to member length, roof run/pitch to slope geometry, wall geometry/grid
to positions, panel/support geometry to panel cuts.

Derivations retain dependency lineage.

### 15.4 Rules

Construction / Manufacturer / Prescriptive Rules remain legitimate
authority tiers. They apply only when prerequisites are established.
They are not assumptions.

V1 may apply an explicitly supported, registered prescriptive rule when
every prerequisite is established. Applying a fully eligible registered
rule is not inventing structural design. Future registered rules may
expand coverage without changing this architecture. Prescriptive paths
are not categorically banned.

Every executable rule needs a stable identity and governed registry
entry. A registry entry must define at least: prerequisites,
applicability boundaries, required inputs, output, exclusions,
precedence, provenance, and failure behavior.

Missing inputs may not be invented or defaulted to make a rule
eligible. If a rule is not registered, or complete eligibility cannot
be established, it does not execute; the dependent result is
Unresolved.

Manufacturer rules and construction rules are not forced into a
simplistic universal ranking; product-specific installation requirements
must be reconciled with governing project/design/code context.

Current registered-rule contract (unnamed tables and open-ended
prescriptive paths do not execute):

-   Jack count: project evidence or a fully eligible registered rule;
    otherwise Unresolved. Never from opening width alone.
-   Structural-header sizing: project design or a fully eligible
    registered rule; otherwise Unresolved.
-   Deck-ledger fastening: project/design requirements, exact applicable
    manufacturer requirements, or a fully eligible registered rule;
    otherwise Unresolved.

### 15.5 Assumptions

An `AssumptionRule` is a conditional permission to fill one approved gap, not a stored magic default. Each executable rule must define at least: stable rule ID/version, target property, deterministic applicability predicate, `exhaustionRequirements`, assumed value/consequence, exclusions/forbidden conditions, Review policy, and replacement/supersession policy.

Assumption eligibility states are: `eligible`, `not_eligible`, `insufficient_resolution`, and `forbidden`. Only `eligible` may create an Assumption record. `insufficient_resolution` sends work back to READ/resolution; `forbidden` produces Unresolved/diagnostic when the value is required.

Every applied Assumption records rule ID/version, target object/property, value, relevant context, dependencies, and Review reference where required. Later project facts or overrides supersede the active assumption and deterministically invalidate dependents.

A governed assumption may execute only when:

1.  relevant project-source paths have been exhausted;
2.  the target condition is sufficiently established;
3.  no higher-authority value applies;
4.  the assumption policy explicitly permits the condition;
5.  the condition is not a forbidden design decision.

Assumptions are typed, scoped, traceable, replaceable, deterministic,
and reviewable when required. No hidden `?? default` may become
construction truth.

### 15.6 UserProjectInput and Overrides

Three distinct paths:

1.  `UserProjectInput` may supplement missing project-specific
    information or clarify ambiguity when it does not contradict
    established project evidence. Retain input-provider/user identity,
    timestamp, target, scope, purpose, provenance, and lineage. It does
    not become reusable construction knowledge.

2.  User input that conflicts with established project evidence must
    become an explicit `ConstructionOverride`. Preserve underlying
    evidence and resolved project value. Record target, replacement
    value, user, reason, and scope; create Review; trigger
    dependency-scoped recalculation.

3.  Revised drawings, addenda, RFI responses, engineered letters, truss
    packages, and similar authoritative documents enter as Project
    Sources. Conflicts follow source specificity, revision, and
    precedence. Unresolved precedence preserves the conflict instead of
    silently choosing.

``` text
Resolved Project Value
  -> optional ConstructionOverride
  -> Effective Value
```

`ProcurementOverride` remains purchasing-only and does not rewrite
HOUSE.

Overrides should target the causal decision where possible and trigger
dependency-scoped recalculation.

------------------------------------------------------------------------

# Part IV --- Shared Deterministic Engine Architecture

## 16. Engine Responsibilities

Do not build fifteen taxonomy calculators. Use shared physical engines
with domain-specific construction policies.

Distinguish:

-   **Resolver** --- decides which supported construction
    condition/method applies.
-   **Materializer** --- creates/reconciles canonical physical objects.
-   **Calculator** --- calculates numeric installation/purchasing demand
    from resolved physical reality.

Core shared systems include:

-   Construction Method Resolver
-   Support / Load Path Graph
-   Shared Wall Framing Engine
-   Repetitive Member Layout Engine
-   Spatial Member Geometry Engine
-   Opening Framing Resolver
-   Floor Framing Engine
-   Roof Geometry + Framing Method Resolver
-   Stick Roof Engine
-   Truss Package / Design Binder
-   Physical Panel Layout Engine
-   Structural Member Binder
-   Connection Registry / Graph
-   Manufacturer BOM Resolver
-   Fastened Joint / Fastening Rule / Position Generator
-   Fastener Ledger
-   Applied Product Ledger
-   Purchasing / Cut Optimizer
-   Package / Yield Resolver
-   Temporary Requirement / Method / Reuse Engine
-   Review / Unresolved / Diagnostic projections
-   Taxonomy Accounting

Shared engines own mechanics. Domain engines own construction semantics.

### 16.1 Support graph

The SupportGraph is shared infrastructure:

``` text
supported object -> bearing/support condition -> supporting object
```

It is reused by floors, beams/posts, roofs, panels, stairs, decks, and
connections.

### 16.2 Repetitive member layout

A generic layout engine may generate physical centerlines/positions from
boundary, axis, origin, spacing, supports, openings, interruptions, and
end conditions. It must not contain domain folklore such as "walls
usually need kings."

### 16.3 Spatial members

Members whose endpoints vary spatially---rake studs, rafters, hips,
valleys, jacks, braces---use shared 3D geometry mechanics.

### 16.4 Requirement convergence

Some physical calculations create new requirements. Example: panel
layout discovers an unsupported edge; a rule requires blocking; blocking
is materialized; panel support becomes complete.

This is a bounded deterministic fixed-point process with:

-   stable requirement identity
-   deterministic ordering
-   idempotent realization
-   cycle detection
-   maximum iteration guard
-   diagnostic on non-convergence

It is not an AI agent loop.

------------------------------------------------------------------------

# Part V --- Material Intelligence and Calculation Contracts

## 17. Section 01 — Foundation-to-Framing Connection

### Scope

Account for: PT sill plates; sill sealer/gasket; anchor bolts/nuts/washers or approved foundation anchors; hold-downs; straps; concrete/masonry anchors; anchoring/construction adhesive where actually required by the resolved system; and framing-scope termite/capillary-break materials where specified/applicable.

### Required construction model / READ contract

Core assembly: **Foundation Bearing + Anchorage Assembly**:

```text
framed element
-> bearing/support condition
-> foundation/slab/pier
-> wood sill/sole plate
-> moisture/decay condition
-> air/capillary interface
-> ordinary anchorage
-> special anchorage/load-path condition
-> associated hardware
```

For each applicable run READ must establish or exhaust: start/end/length/returns/breaks and foundation transitions; support type; sill/sole existence, size and treatment; wall above and conditioned-space relationship; anchor system/type/diameter/spacing/embedment/washer/end conditions; straps as replacement vs supplemental anchorage; post-installed/special anchors; braced/shear/hold-down context; sill gasket/capillary/termite system and alternates.

### Calculation contract

**PT sill:** `required LF = sum(resolved applicable sill segments)` by material/spec. Preserve individual segments before stock optimization; never replace known bearing geometry with generic building perimeter. Treatment may be rule/assumption-resolved from an established decay-protection condition, but plate size is not taken from a minimum-code size when the actual assembly is unresolved.

Identify the foundation sill and wall bottom plate from actual physical location and function. Separate plates in construction are separate HOUSE objects. One plate serving as both concrete/foundation interface and wall bottom plate is one physical plate with both roles; foundation and wall taxonomy categories may reference that same object; installation demand and purchasing occur once. Do not universally merge sill plates and wall bottom plates.

**Sill gasket:** follows the actual applicable sill interface. Calculate application LF first. Width follows resolved sill width. Convert to rolls only when product/package coverage is known.

**Anchorage:** calculate a physical anchor layout from actual sill sections/end conditions and the resolved anchorage system. `LF / 6` is never the authoritative algorithm. Exact prescriptive count requires enough plate-section geometry to enforce the applicable placement rules. Nuts/washers and product-specific components expand from the resolved anchor system.

**Hold-downs / straps / special anchors:** exact project/design-controlled conditions only. Resolve physical connection location and exact system before BOM expansion.

**Anchoring adhesive:** only when the selected post-installed anchor/connection method requires it; product/yield conversion belongs to the Applied Product/Purchasing systems.

**Termite/capillary:** calculate only a physical framing-scope material whose requirement/method is actually established. Geography alone never selects a termite system. If one sill-gasket product satisfies both sealing and capillary functions, one physical product satisfies both taxonomy roles.

### Assumption registry — Foundation

- **FOUND-ASSUME-001 — PT Treatment.** Ordinary wood sill/sole plate in a resolved concrete/masonry decay-protection condition may be classified as treated/durable when project information does not contradict. **Does not assume plate size.**
- **FOUND-ASSUME-002 — Sill Gasket.** Ordinary residential sill/foundation interface adjacent to conditioned space, after relevant source exhaustion and absent conflicting alternate assembly: conventional closed-cell sill gasket/sealer; width follows resolved sill width. **Review.** No brand/SKU/roll length is assumed.
- **FOUND-ASSUME-003 — Prescriptive Foundation Anchorage.** Ordinary prescriptive residential condition, after project anchorage paths are exhausted and no engineered/special condition exists: `1/2 in anchor bolt + nut + appropriate washer, <= 6 ft OC` with the applicable prescriptive placement rules. Exact compliant count requires sufficient plate-section geometry; if geometry is insufficient, only an estimating quantity with Review may be emitted rather than false exact-compliance language.
- **FOUND-ASSUME-004 — Capillary Function Through Sill Gasket.** When the selected sill gasket is suitable for the established capillary-break function, one physical product satisfies both roles; do not duplicate material.

### Never assume

Hold-down existence/model/capacity; specialty/load-path strap; engineered foundation anchorage; post-installed structural anchor product; anchor/structural adhesive product; termite-control system; engineered washer/anchor schedule; proprietary substitution; structural load/capacity; sill width solely from minimum prescriptive size.

### Shared engines / purchasing / diagnostics

Foundation Interface Resolver -> Sill Layout -> Interface Material -> Anchorage Layout -> Specialty Connection -> Product Coverage -> Purchasing. Preserve theoretical requirement separately from purchase quantity. Discrete engineered hardware gets no blanket waste. Alternatives are mutually exclusive, not additive. Coverage products require actual product/package data before package conversion. Missing engineered/special anchorage is localized Unresolved with earliest-cause diagnostic.

---

## 18. Section 02 — Floor System

### Scope and required construction model

The Floor engine reconstructs a framed system rather than nineteen independent materials:

```text
floor boundary
-> joist system/direction/layout origin/spacing
-> bearings/spans/cantilevers
-> openings/interruptions
-> beams/posts/walls above-below/point loads
-> rim/end conditions
-> connection topology
-> subfloor assembly
```

READ must establish or exhaust floor polygons/openings/offsets/support lines/elevations; joist type/product/depth/species-grade where applicable, spacing/direction/origin, bearing/lap/butt/doubles/cantilevers; beams/posts/bearing walls/foundation; vertical load-path relationships; endpoint connection topology; subfloor product/thickness/T&G/orientation/support/edge support/fastening/adhesive.

Confirmed slab-on-grade construction may make suspended floor joists `not_applicable`.

### Calculation contract

**Joists:** individual-member layout only. Generate theoretical centerlines from actual region, direction, origin and spacing; intersect with geometry; terminate/continue by support; apply laps/butts/cantilevers/openings/doubles/manufacturer details; calculate each physical length. Never area-factor joist count. Required length remains separate from ordered stock length.

**Beams/posts:** exact design objects; bind to canonical Section 09 identity. No autonomous sizing.

**Rim:** generate actual floor-boundary/end-condition segments, not generic perimeter LF.

**Squash blocks / blocking panels / web stiffeners / bridging:** requirement first. Vertical load-path and exact I-joist family/condition can activate manufacturer rules. Squash blocks are not synonymous with web stiffeners. Bridging/lateral restraint applies only to an eligible dimensional-lumber condition; do not generically apply to I-joists.

**Connections:** canonical `member -> connection -> support` topology. Exact connector plus installation variant expands manufacturer/project fastener BOM.

**Subfloor:** use shared Physical Panel Layout Engine over completed floor support geometry. Area/32 is sanity only. Preserve orientation, openings, cuts, edge support, reusable remnants. Adhesive lines and fastener positions come from physical panel/support geometry.

### Assumptions / rules — Floor

- **FLOOR-ASSUME-001 — Structural Subfloor Specification.** Structural wood subfloor existence established, exact specification genuinely absent after READ, ordinary residential eligibility: **23/32 in T&G structural OSB**. Review. Does not establish subfloor existence.
- **FLOOR-ASSUME-002 — Subfloor Adhesive.** Ordinary structural-panel residential floor: glued-floor installation for package completeness unless plans/system prohibit or replace. Review.
- **FLOOR-RULE-001 — Manufacturer I-Joist Accessories.** Exact I-joist family + triggering physical condition + applicable manufacturer rule -> required squash blocks/blocking/web stiffeners/etc.
- **FLOOR-RULE-002 — Dimensional Joist Bridging/Lateral Restraint.** Known dimensional-lumber condition + applicable prescriptive requirement -> physical bridging/restraint.
- **FLOOR-RULE-003 — Connector Fastener Expansion.** Exact connector + installation schedule -> deterministic connector fastener BOM.
- **FLOOR-RULE-004 — Engineered Product Installation Rules.** Exact engineered product + known condition -> governed manufacturer consequence; manufacturer rule never redesigns a plan-specified member.

### Never assume

Joist type/depth/I-joist series/spacing/species-grade/span capacity; engineered beam dimensions/plies; glulam/PSL/LSL product; post/column size; hanger/cap/base model; structural screw schedule without known assembly; generic hanger nail count; web stiffeners merely because I-joists exist; squash blocks without trigger; structural beam connection; engineered diaphragm fastening.

### Shared engines / purchasing / diagnostics

Floor System Resolver -> Joist Layout -> Opening Framing -> canonical Structural Member binding -> Load-Transfer Accessory Resolver -> Connection Registry -> Rim Layout -> Physical Panel Layout -> Fastener/Applied Product ledgers -> Installation BOM -> purchasing. Layout origin ambiguity is a real localized gap when it materially changes physical placement; do not hide it with a simplistic count formula.

---

## 19. Section 03 — Exterior Walls

### Scope and required construction model

Twenty families are generated from one physical wall assembly:

```text
wall run
-> framing grid
-> openings
-> corners/intersections
-> bearing/support + vertical relationships
-> header/support assemblies
-> sheathing/bracing
-> blocking/backing
-> connections/fasteners
```

READ must establish geometry/height/elevations/jogs/opening positions; stud size/spacing/origin/species-grade where specified; plate system; bearing/braced/shear/portal/tall/special role; opening rough geometry/header/support; sheathing system/extents/orientation/edge blocking/fastening; intersection framing method when project-supported; relationships above/below.

### Physical calculation

**Stud population:** generate wall-local stud positions first, then assign roles. Never calculate standard + king + full-height + shear-boundary studs as independent additive populations. One physical stud may have multiple roles and is purchased once.

**Plates:** ordinary eligible platform walls may use resolved plate configuration. Preserve individual runs/pieces. Door openings generally do not reduce purchased sole-plate lumber where normal construction uses continuous plate before cutout. Foundation-sill vs wall-bottom-plate identity follows §7: identify from actual physical location and function; do not universally merge; one plate with both roles is one HOUSE object purchased once.

**Openings:** opening-framing resolver creates physical full-height/king/jack/cripple/sill/header-related members while reconciling them with the base grid. Cripples continue the established grid in eligible zones and exclude conflicting king/jack/header positions. Cut-list reuse is preserved.

**Corners/intersections:** no universal `+3`. Resolve an actual project framing method or leave method reviewable/unresolved. A project convention such as two-stud corners or ladder backing may propagate only to equivalent conditions.

**Headers:** structural bearing header is distinct from nonbearing opening framing. Exact plan design wins. Structural-header sizing comes from project design or a fully eligible registered rule; otherwise Unresolved. Missing structural design inputs are never invented to make a rule eligible. Canonical header identity binds to Section 09 and purchase occurs once.

**Jack/full-height support:** jack count comes from project evidence or a fully eligible registered rule; otherwise Unresolved. Jack count is never derived from opening width alone. WALL-ASSUME-005 remains the king/full-height fallback where that assumption is eligible; it is not a jack-count rule. Jack length comes from resolved bearing/header geometry, not merely opening height.

**Sheathing:** existence must be established first. Then shared panel layout handles actual surfaces/openings/supports/panel seams/edge support/cuts/remnants. Net wall SF/32 is only a sanity estimate when physical layout is available.

### Assumption / rule registry — Exterior walls

- **WALL-ASSUME-001 — Stud Spacing.** Ordinary conventional residential exterior wall, after project/convention exhaustion and no special condition: **16 in OC**. Review.
- **WALL-ASSUME-002 — Exterior Stud Size.** Ordinary conventional exterior wall, no contrary/special condition after exhaustion: **2x6** estimating default. Review. Not a code claim.
- **WALL-ASSUME-003 — Wall Height.** Precedence: explicit -> section/elevation -> floor-to-floor derivation -> ceiling/assembly derivation -> project-supported repeated condition -> governed fallback. Eligible ordinary fallback: **9 ft 0 in**. Review.
- **WALL-ASSUME-004 — Plate Configuration.** Ordinary platform framing: **1 bottom + 2 top plates** unless project information establishes another system.
- **WALL-ASSUME-005 — Conventional King Stud Fallback.** Ordinary eligible opening with no stronger project/prescriptive full-height support requirement: **minimum one king/full-height stud per side**. Must yield to any applicable header/full-height rule.
- **WALL-ASSUME-006 — Window Sill Material.** Ordinary conventional window framing: sill dimensional size follows resolved wall stud size.
- **WALL-RULE-001 — Cripple Continuation.** Continue established stud grid through eligible cripple zones; deterministic framing rule, not a customer-facing assumption.
- **WALL-ASSUME-007 — Structural Sheathing Specification.** Structural wood sheathing existence already established, exact spec absent after exhaustion, ordinary eligible wall: **7/16 OSB**. Review. Never establishes sheathing existence.

### Never assume

Engineered/tall-wall stud design; structural header size/plies where no fully eligible registered rule applies; LVL header size/ply; structural jack count from width alone; shear-wall location/nailing; hold-down/strap/portal hardware; engineered load-path design; universal corner/intersection method; structural sheathing existence; special blocking from intuition.

### Shared ownership / purchasing

Exterior and interior walls use the same Wall Engine. Structural members bind to Section 09; connections to the Connection Registry; fasteners to the Fastener Ledger; applied products to the Applied Product Ledger. Stock optimization occurs after exact stud/plate/header/blocking/panel requirements exist.

---

## 20. Section 04 — Interior Walls

### Scope and classification

Interior location is not a framing type. Every wall resolves structural/construction role separately: bearing, nonbearing, braced, plumbing/furred, tall/special, stair/support wall, or unknown.

READ must establish geometry/height/intersections/openings; stud and plate system; bearing/bracing/special role; opening position/rough geometry/header/support; fixture/backing relationships; and whole-house concealed-space conditions relevant to fireblocking/draftstopping. Framing READ must inspect any architectural information that determines framing material, including interior elevations, cabinet/millwork plans, bathroom elevations/details, stair details, soffit/reflected-ceiling information, and architectural notes.

### Shared wall mechanics

Use the same physical Wall Framing Layout engine as Section 03. Domain policy changes by wall classification; physical identity does not.

**Bottom plate:** ordinary platform partition may use one bottom plate. PT only where actual substrate/exposure condition requires it. Preserve construction run even where door sole plate is later cut out. Foundation-sill vs wall-bottom-plate identity follows §7: identify from actual physical location and function; do not universally merge; one plate with both roles is one HOUSE object purchased once.

**Studs:** for definitively ordinary nonbearing partition, eligible assumption below may fill size/spacing. Bearing walls do not inherit partition defaults blindly. Use shared position generator and role assignment.

**Top plates:** qualifying nonbearing walls may be permitted by applicable rules to use a single top plate, but V1 package-completeness assumption below intentionally uses double top plates for eligible ordinary partitions; it is an estimating policy, not a universal minimum-code statement.

**Door headers:** bearing classification is mandatory. For a definitively ordinary **nonbearing** interior door, the supported nonbearing rule may be used only where its prerequisites are established, including opening width and the vertical condition above the opening. The locked rule permits the eligible flat single-2x4-style condition for openings up to 8 ft where the vertical distance to the nailing surface above is no more than 24 in; in that eligible configuration cripples/blocking above are not automatically generated. Bearing openings use exact project design or a fully eligible registered rule under the §15.4 structural-header contract; otherwise Unresolved. Never infer structural size from opening width alone.

**Backing/intersections:** represent a `BackingRequirement` / `BackingZone` with parent wall, spatial extent/elevation, material/method when established, and reason/role. Cabinet, handrail, TV, shower/tub, vanity, closet/shelving and miscellaneous categories are taxonomy reasons for the shared physical concept. Multiple overlapping compatible requirements are spatially unioned so one physical member can satisfy multiple roles. TV/vanity/shower/closet/cabinet existence alone does not automatically create backing.

**Wall intersections:** one physical intersection object regardless of Exterior/Interior taxonomy ownership. Resolved project method may produce stud pack, ladder blocking, clips/other backing. No universal method.

**Fireblocking / draftstopping:** distinct rule-driven requirements. Fireblocking and draftstopping are not generic lumber allowances and a requirement does not automatically select foam or another particular material. Draftstopping is derived from qualifying whole-house concealed-space conditions rather than from “interior wall exists.”

### Assumption / rule registry — Interior walls

- **WALL-ASSUME-008 — Ordinary Interior Partition.** Definitively ordinary nonbearing residential partition, after project/convention exhaustion: **2x4 @ 16 in OC**. Review. Not a code-minimum claim.
- **WALL-ASSUME-009 — Interior Partition Top Plates.** Ordinary conventional platform-framed interior partition after project-convention exhaustion: **double top plate** for package completeness. Review.
- **WALL-ASSUME-003 — Wall Height.** Reuse the shared height hierarchy and eligible 9 ft fallback; no separate interior version.
- **WALL-RULE-002 — Nonbearing Opening Framing.** Definitively nonbearing opening + fully established eligible conditions -> applicable nonbearing opening assembly; do not invent a structural header.
- **WALL-RULE-003 — Backing From Explicit Requirement.** Known backing requirement + resolved wall/zone -> deterministic physical backing layout.
- **WALL-RULE-004 — Fireblocking.** Known geometry/condition + applicable construction rule -> physical fireblocking requirement; material/method remains separately resolved.
- **WALL-RULE-005 — Draftstopping.** Known qualifying floor-ceiling/concealed-space condition + applicable rule -> required division/material extent.

### Never assume

Interior = nonbearing; structural header size; bearing-wall size/spacing without sufficient authority; cabinet/TV/vanity/shower/closet backing from fixture presence alone; handrail backing structural assembly from load alone; universal intersection count/method; generic fireblocking LF; generic draftstop allowance; generic miscellaneous blocking percentage.

### Shared engine / purchasing / diagnostics

Shared Wall Assembly/Stud Grid/Plate/Openings; Interior Wall Classifier; Intersection Resolver; Backing Requirement + Backing Layout; Fire/Draft Resolver; canonical purchasing. Miscellaneous blocking is never a junk drawer: every block has reason, parent/location, geometry, material/spec and source/authority.

---

## 21. Section 05 — Tall Walls / Great Rooms / Special Walls

### Contract

A tall/special wall is physically a Wall with a design profile/binding, not a separate duplicate engine. Classification is not a simple height threshold. READ must bind geometry, unsupported height, supports/restraint, bearing/braced/shear role, openings, stud system, engineered products, lateral/sheathing system, beams/posts, hold-downs/straps/connections, and structural schedules/details.

The engine reconstructs and quantifies the **specified design**. It does not design the tall wall.

### Physical calculation

Reuse shared Wall Framing Engine, Opening Framing, variable-height/spatial member geometry, Physical Panel Layout, SupportGraph, Section 09 structural members, Connection Registry and Fastener Ledger. Rake/sloped stud lengths may be deterministically derived from resolved geometry. Blocking is purpose-classified; do not add generic mid-height blocking merely because a wall is tall.

### Assumptions

**No new structural material assumptions.** Once a wall is identified as engineered/tall/special, the following ordinary assumptions are disallowed as structural gap-fillers: WALL-ASSUME-001, 002, 003, 005 where structural jamb design is implicated, 007, 008 and 009 where structural plate design is implicated. Ordinary details outside the structural design may still use ordinary wall logic only when independently eligible.

### Never assume

Tall-wall stud size/spacing/species/grade/product; engineered substitution; structural header/plies; beam/post design; built-up jamb/post assembly; hold-down/strap; shear classification; structural sheathing/fastening; design-dependent edge blocking; connection/fastener schedule; load/wind/seismic/design capacity.

### Diagnostics

Examples map to the canonical diagnostic families: `tall_wall_design_reference_missing`, `tall_wall_stud_spec_missing`, `tall_wall_header_spec_missing`, `tall_wall_sheathing_schedule_missing`, `tall_wall_connection_spec_missing`, `tall_wall_holdown_spec_missing`, `structural_design_conflict`, `structural_design_binding_failed`. Distinguish true project omission from Reader/binding failure.

---

## 22. Section 06 — Stick Roof

### Required construction model

A stick roof is a 3D framing-layout problem. Resolve **roof geometry first, framing method second**:

```text
roof planes/intersections
-> bearings/support lines
-> ridge system
-> rafter families/grid
-> ceiling-joist / rafter-tie system
-> hip/valley system
-> overbuilds
-> overhang/lookouts/fly rafters/ladder/gable-overhang framing/subfascia
-> blocking/bird blocks/framing-side eave blocking
-> support posts
-> connections
```

READ must distinguish ordinary ridge-board+tied-rafter, structural ridge beam, cathedral/vaulted, hip, valley/intersecting, overframed/blind valley, mixed stick/truss, and engineered conditions. A geometric valley does not establish a valley rafter; method controls physical framing.

### Calculation contract

**Rafters:** individual 3D centerline generation from resolved plane/support/grid. True sloped length and tail/overhang are derived from actual endpoints. Stock optimization follows physical cut list.

**Ridge:** resolve ridge board vs structural ridge support before materialization. A rule may establish that structural support is required without authorizing the engine to size the beam; structural ridge beam identity belongs to Section 09.

**Ceiling joists/rafter ties:** one physical member may serve both roles and is counted once.

**Hips/valleys/jacks:** only after framing method is resolved. Jack rafters = rafter grid × hip/valley geometry; individual lengths preserved.

**Overbuilds/overhang/blocking:** project/method-driven. No generic lookouts/fly/subfascia. Stick-roof framing owns subfascia, lookouts, fly rafters, ladder/gable-overhang framing, bird blocks, and framing-side eave blocking when established by project evidence or an eligible registered rule. Finish fascia is outside framing scope unless project evidence explicitly establishes it as a framing member. Structural subfascia remains in scope. Purlin/brace systems are complete support assemblies, not a way to rescue an unresolved rafter design.

### Assumption / rule registry — Stick roof

- **ROOF-ASSUME-001 — Ordinary Stick-Roof Rafter Spacing.** Definitively ordinary residential stick roof, project/convention exhausted, no engineered/special condition: **16 in OC**. Review. Spacing only; never size/species/grade.
- **ROOF-RULE-001 — Ridge Board vs Structural Ridge.** Resolve thrust/load-path system first. Eligible tied-rafter configuration may use ridge-board system; absent adequate thrust-resisting system means structural ridge support is required, but beam sizing remains design-controlled.
- **ROOF-RULE-002 — Rafter Geometry.** Known plane + support geometry + framing grid -> deterministic rafter positions/lengths.
- **ROOF-RULE-003 — Hip/Valley Geometry.** Intersecting planes + resolved conventional framing method -> axes/lengths.
- **ROOF-RULE-004 — Jack Rafter Generation.** Rafter grid + hip/valley geometry -> physical jack positions/lengths.
- **ROOF-RULE-005 — Tie-System Role Deduplication.** Ceiling joist serving as rafter tie = one member/two roles.
- **ROOF-RULE-006 — Collar Tie / Ridge Strap Alternatives.** Where uplift restraint is required, resolve selected/specified system; do not emit both unless both are actually required.
- **ROOF-RULE-007 — Purlin Assembly.** Eligible project/prescriptive condition -> purlin + brace arrangement from actual rule/detail; never use to complete missing engineered design.

### Never assume

Stick framing from geometry alone; rafter size/species/grade; structural ridge beam/plies/posts; structural hip/valley size when design-controlled; conventional vs California valley; ceiling joist/tie/collar system; lookout/fly/subfascia; ladder/gable-overhang framing; bird blocks; framing-side eave blocking; finish fascia; purlin system; structural/uplift connector or fastener schedule. Never run a prescriptive table with invented load/species/grade/spacing/system inputs.

### Purchasing / connection ownership

Preserve exact physical cut list and remnants before stock optimization. Roof-to-wall fastening/connector requirement is connection-first; never attach a favorite hurricane tie to every rafter. Exact connector + condition expands manufacturer BOM once through Sections 12/13. H-clips and discrete support connectors flow through the Connection Registry and Hardware purchasing path. Roof sheathing does not purchase a second population of framing. Every physical member, connector, and fastener is purchased once.

---

## 23. Section 07 — Truss Roof

### Contract and READ source

Trusses are engineered manufactured components. V1 reconstructs designed components/layout and field-installed requirements; it does not design trusses or explode factory internal lumber/plates.

The **Truss Package / Truss Design Set** is a first-class project document type. READ binds:

```text
building roof region
-> truss placement/layout
-> truss mark/type
-> individual design drawing/package definition
-> physical truss instances
-> bearings/girder relationships
-> permanent bracing/field framing
-> connections/field fasteners
```

Building geometry, truss design, and installation/building-system requirements remain separate information classes.

### Calculation contract

Common/girder/gable/hip-jack/valley/attic trusses are counted from explicit instances or a defined repetitive layout with region + origin + spacing + mark. Generated counts reconcile against package summaries/design sheets. No generic truss spacing assumption.

Girder and other multi-ply manufactured assemblies preserve package identity and field-installed ply/connection requirements. Factory connector plates/internal truss lumber remain inside manufactured-component boundary.

Permanent truss bracing belongs here. Temporary installation bracing belongs to Section 15. Strongbacks/gable-end blocking and similar field lumber require package/project/rule support.

### Assumptions

**No new assumptions about engineered trusses themselves.** No default 24 in OC, profile, girder configuration, hip/valley/gable/attic type, ply count, hanger, or layout. Safe downstream consequences may come from governed manufacturer/construction rules only after the exact designed system/condition is known.

### Never assume

Truss spacing/mark/profile/span/heel/type; girder ply count; member lumber/plates/reactions/bearing width; field splice or alteration; valley/hip set; permanent restraint/strongback; girder hanger; roof-to-wall tie; structural screw/bolt schedule. Never modify/cut/notch/drill/reinterpret a truss to fit geometry.

### Unresolved / diagnostics

If plans establish “trusses by others” but package is unavailable, truss design is a legitimate unresolved dependency; continue calculating unrelated roof/sheathing information that remains supportable. A confirmed stick-framed roof without manufactured trusses may make roof trusses `not_applicable`. Failure to find truss evidence does not prove trusses are inapplicable. Diagnostic examples: `truss_package_missing`, `truss_layout_missing`, `truss_mark_unbound`, `truss_instance_count_conflict`, `truss_bearing_unresolved`, `truss_girder_relationship_unresolved`, `truss_permanent_bracing_missing`, `truss_connection_spec_missing`, `truss_fastener_schedule_missing`, `truss_architecture_design_conflict`.

---

## 24. Section 08 — Roof Sheathing

### Required construction model

Roof sheathing is not a roof-area calculation. It is a physical panel layout on the resolved 3D roof framing system:

```text
roof-plane surfaces
-> supporting framing from 06/07
-> panel specification/orientation
-> physical panel layout
-> cuts/openings/intersections
-> panel-edge support
-> clips/blocking requirements
-> fastening positions
-> remnant reuse
-> purchased sheets
```

READ must establish exact sloped plane polygons/boundaries/intersections/openings; actual rafter/truss/support positions/spacing; panel product/thickness/performance/span rating/dimensions/strength axis/T&G if specified; edge-support and fastening/special diaphragm conditions.

### Calculation contract

Build each surface in its sloped coordinate system; plan projection is not roof surface area. Project actual supporting framing onto the surface. Establish strength-axis relationship and physical panel courses. Clip panels to eaves/rakes/hips/valleys/ridges/walls/dormers/openings. Classify every panel edge as framing-supported, perimeter/opening, or unsupported. Roof sheathing owns physical panel layout and resulting H-clip / panel-edge-support requirements. Unsupported edges may emit a canonical support requirement; framing required by sheathing layout is satisfied through the applicable roof-framing materializer and Section 08 does not purchase a second population of framing. H-clips and discrete support connectors flow through the Connection Registry and Hardware purchasing path. Reuse practical compatible offcuts before sheet purchase.

Area/32 remains a sanity check only. Physical cuts/remnants determine geometric/optimization loss; no generic 10% panel waste is added on top.

### Assumption / rule registry — Roof sheathing

- **ROOF-SHEATH-ASSUME-001 — Ordinary Roof Panel Specification.** Structural WSP roof decking existence established + ordinary residential condition + support spacing known + no special design + project/convention exhausted: **7/16 in APA Rated OSB with a rating suitable for actual support spacing**. Review. Does not establish sheathing existence.
- **ROOF-SHEATH-RULE-001 — Strength Axis.** Ordinary rated WSP strength axis perpendicular to supports unless project/product/design says otherwise.
- **ROOF-SHEATH-RULE-002 — Panel Layout.** Known surface + framing + panel dimensions -> deterministic physical panel pieces.
- **ROOF-SHEATH-RULE-003 — Panel Spacing.** Manufacturer requirement first; otherwise the locked eligible installation convention may supply approximately 1/8 in panel-joint spacing. Installation detail, not blanket purchase padding.
- **ROOF-SHEATH-RULE-004 — Edge Support.** Panel/span rating + support spacing + physical edge condition -> whether edge support is required under applicable rule; then resolve blocking/clips/other approved support method.
- **ROOF-SHEATH-RULE-005 — Fastener Expansion.** Physical panel layout + SupportGraph + fastening schedule -> deterministic installed fastener positions/count.
- **ROOF-SHEATH-RULE-006 — Physical Cut Waste.** Geometric cuts and offcut reuse determine panel waste; do not stack generic waste on top.

### Never assume

Sheathing existence from roof existence; OSB vs plywood in design-controlled system; Structural I; engineered diaphragm/special high-wind fastening; incompatible thickness/span rating; T&G; H-clips or blocking at every seam; ridge vent/skylight/opening from appearance; fascia/subfascia/lookouts merely because the deck reaches an edge; framing members merely because panels need support. Finish fascia is outside framing scope unless project evidence explicitly establishes it as a framing member. Structural subfascia remains in stick-roof scope.

### Diagnostics / cross-section identity

Examples: `roof_sheathing_spec_missing`, `roof_sheathing_support_mismatch` (Review; never auto-redesign), `roof_sheathing_support_geometry_missing`, `roof_sheathing_edge_support_unresolved`, `roof_sheathing_fastening_schedule_missing`, `roof_sheathing_special_design_missing`, `roof_sheathing_geometry_conflict`, `roof_sheathing_layout_failure` (calculator bug when inputs exist). Any blocks generated to satisfy panel support become canonical Section 06/07 roof-framing objects and are purchased once. H-clips and discrete support connectors are purchased once through the Connection Registry and Hardware path. Roof sheathing does not purchase lookouts, subfascia, or eave framing.

---

## 25. Section 09 --- Beams and Posts

Section 09 does **not** discover a second population of beams and posts.
It is the canonical house-wide structural-member binding, assembly, and
purchasing layer for beams, posts, columns, and their direct
connections.

### Canonical structural identity

A structural mark is a project-defined identity/type reference, not a
material description. Bind marks to schedules/details/design
definitions, then instantiate the design at each physical location.

One beam encountered by floor, tall-wall, roof, or structural schedules
remains one physical beam.

### Load path

Preserve:

``` text
supported framing
-> beam
-> bearing / hanger
-> post / wall / column
-> post base / bearing plate
-> support below
```

Connections depend on actual topology and load/connection detail.

### Engineered beams

LVL, glulam, PSL, LSL, steel beams, engineered posts, and steel columns
require exact project design. Never infer size, ply count, grade,
species/product family, section, camber/orientation, bearing, or
structural substitution.

For a known multi-ply beam:

``` text
beam assembly x explicit plies -> physical required pieces
```

Preserve exact required piece length; do not reduce a 3-ply engineered
beam to generic total LF.

### Built-up dimensional beams

Explicit designed multi-ply dimensional assemblies may be expanded into
their physical lumber pieces. Ply fastening requires the actual
design/rule applicable to the load/assembly.

### Posts

Post length derives from resolved top and bottom bearing/support
geometry. Do not assume a generic 6x6 structural post.

### Connections and hardware

Post bases, caps, beam hangers, bearing plates, bolts, washers,
structural screws, and through-bolts arise from exact
project/design/manufacturer requirements. They enter the canonical
connection/fastener systems and are purchased once.

### Structural design assumptions

V1 has **zero structural-member sizing assumptions** for these members.

------------------------------------------------------------------------

## 26. Section 10 --- Stairs

The engine reconstructs a plan-designed stair and calculates its framing
materials. It does not silently become a stair designer.

### Stair Framing Assembly

Reconstruct:

``` text
stair opening
-> flight
-> top/bottom supports
-> stringer system
-> intermediate landings
-> landing framing
-> surrounding floor framing
-> attachment details
-> backing
-> temporary construction requirements
```

READ crosses architectural and structural sheets.

### Stair geometry boundary

-   If the stair is plan-designed: reconstruct and calculate.
-   If missing geometry is mathematically forced by established design
    facts: derive it.
-   If multiple compliant stair configurations remain possible: do not
    choose one silently; create `stair_geometry_design_missing`
    Unresolved/Review as appropriate.

### Stringers

Never assume stringer size, count, spacing, structural capacity, cut vs
solid construction, or rise/run design.

Once resolved, calculate physical stringer positions and required blank
lengths from actual flight geometry. Preserve required blank length
separately from purchased stock length.

Engineered stringers require exact product/design and may
deterministically expand manufacturer accessories/connections.

### Temporary treads

Section 15 supersedes any simplistic "always add temporary treads"
interpretation. Temporary tread demand is construction-state and method
dependent.

If permanent rough treads already provide construction access, separate
temporary treads may be unnecessary.

### Landings/openings

Landing joists, beams, posts, rim, sheathing, opening headers/trimmers,
hangers, and blocking reuse the floor, structural-member, support,
opening, panel, and connection engines.

A stair opening header that is also the floor-system opening header
receives one canonical HOUSE identity and one purchasing demand.

### Backing

Guardrail and handrail backing are physical requirements realized from
actual locations/details; safety requirement does not authorize an
invented structural assembly.

------------------------------------------------------------------------

## 27. Section 11 --- Decks, Porches & Exterior Framed Areas

Section 11 is a specialized exterior-framing assembly built largely from
shared engines.

Core physical model:

``` text
platform polygon
-> attachment / freestanding condition
-> joist system
-> beam system
-> posts/supports
-> foundation/footings (support reference only)
-> rim
-> lateral/load-path relationships
-> surface
-> exposure/water management
```

Concrete footings, reinforcing steel, excavation, and footing-form
quantities are outside V1 residential framing-material takeoff. HOUSE
may preserve a footing/foundation support reference when required to
understand post support, bearing, or connection topology. That reference
must not create concrete-material installation or purchasing demand.
Post bases, anchors, bearing plates, and framing-side connectors remain
in scope through the Connection Registry, Hardware, and Fastener
systems.

Confirmed absence of a deck makes deck framing `not_applicable`.

Exterior-specific intelligence includes preservative treatment,
corrosion compatibility, ledger/water-management, and exterior load-path
connections.

### Treatment

Do not blindly label every exterior framing member PT.
Treatment/durability derives from actual exposure/use condition and
project/rule requirements.

Treatment is part of material specification, not an accessory.

### Corrosion compatibility

Connector/fastener coating/material must be compatible with treated
material and service environment. A structurally correct connector is
not automatically a valid purchase result if material/coating is
incompatible.

### Ledger

Resolve attachment type before calculation.

For an attached platform, establish ledger location/segments, size/spec,
treatment, building structural substrate, rim/band condition, veneer
condition, fastening system, flashing, lateral connection, and
interruptions.

Never assume a ledger is permitted merely because the deck touches the
house. Never invent ledger fastener type/spacing or structural substrate
behind cladding.

### Ledger fasteners

Use project/design requirements, exact applicable manufacturer
requirements, or a fully eligible registered rule; otherwise Unresolved.
Generate physical fastener positions first, then count.

### Joists

Reuse the Floor Joist Layout mechanics with exterior-specific
material/exposure policy. Do not autonomously size deck joists in V1.

### Beams/posts

Canonical structural identity belongs to Section 09. Do not autonomously
size deck beams/posts.

### Connections

Hangers, hurricane ties, post bases/caps, structural screws, lateral
ties, and similar hardware are explicit connection graph nodes and are
purchased through Section 12.

### Flashing

Flashing is an interface material tied to actual water-management/ledger
conditions, not a generic "deck exists" quantity.

### Exterior sheathing

Deck sheathing is included only where it is actually part of a
covered/waterproof framed assembly.

------------------------------------------------------------------------

## 28. Section 12 --- Hardware / Connectors

Section 12 is the canonical house-wide **connection BOM and purchasing
aggregation layer**, not another assembly calculator.

Sections 01--11 own why a connection is required and its physical
participants. The canonical connection system owns identity. Section 12
owns aggregation/purchasing projection.

### PhysicalConnection

A connection records:

-   identity/location
-   parent assembly/requirement
-   connected physical objects
-   structural role
-   connector model/variant/finish/material
-   installed quantity
-   fastening BOM
-   environment
-   governing authority

### Exact manufacturer BOM

Exact connector model + variant + connected material/environment may
deterministically expand the manufacturer-required fastener BOM.

Manufacturer-required connector fasteners enter the Fastener Ledger once
through the connection/manufacturer BOM path.

Included kit components are deduplicated.

### No generic connector assumptions

Do not assume favorite hanger, strap, hold-down, post base, hurricane
tie, or equivalent connector.

"Or equal" preserves the specified basis of design; it does not
authorize arbitrary substitution.

### Environment

Finish/coating/material is part of purchase identity.

The only broad fallback is the locked corrosion-compatible requirement
where connector existence is established but finish is absent and the
condition is eligible; this remains reviewable rather than selecting an
unsupported exact product.

------------------------------------------------------------------------

## 29. Section 13 --- Framing Fasteners

Section 13 owns the canonical house-wide **Fastener Ledger**.

Fastener demand comes from:

1.  connection-generated fasteners from Section 12; and
2.  direct assembly joints/zones not represented by a discrete
    connector.

The Fastener section does not regenerate hanger nails, connector screws,
or other connection fasteners from taxonomy categories.

### Fastener specificity

Penny size alone is insufficient. Preserve, where relevant:

-   type
-   diameter
-   length
-   shank
-   head
-   coating/material
-   application
-   governing authority

### Fastened Joint

Model:

``` text
member A
-> member B
-> joint type / zone
-> applicable fastening requirement
-> physical pattern
-> installed fasteners
```

Use structured construction fastening rules with project schedule
precedence and zone-specific behavior.

### Counting and purchasing

Count installed pieces first. Convert to boxes/packages only later using
actual product/package data.

Do not convert weight to piece count without verified product data.

No unsupported fastener substitutions, generic powder-actuated
fastening, or blanket loss percentage.

Aggregate only exact construction-equivalent specifications.

------------------------------------------------------------------------

## 30. Section 14 --- Adhesives / Sealants

Section 14 owns the canonical **Applied Product Ledger**.

Demand derives from physical application geometry and verified product
yield.

Supported physical models include:

-   linear interface material
-   bead-applied product
-   joint/penetration volume
-   cavity foam

### Subfloor adhesive

Section 02 establishes whether adhesive is required. Section 14
calculates application lines/geometry, consumption, product/package
conversion, and deduplicates shared application lines.

### Construction adhesive

Only where an actual project/rule/eligible governed requirement exists.
Do not treat construction adhesive as a generic framing consumable.

### Sill gasket

Inherited from Section 01. Do not purchase twice merely because it
satisfies sealing and capillary functions.

### Exterior sealant

Only framing-scope interfaces/penetrations supported by the
project/rule.

### Fireblocking foam

A fireblocking requirement does not automatically mean foam. Resolve
requirement -\> method -\> material first.

### Product yield

Product coverage/yield must be structured and versioned. Missing exact
product/yield can leave procurement incomplete while the physical
material requirement remains known.

No universal consumable waste factor.

------------------------------------------------------------------------

## 31. Section 15 --- Temporary Framing Materials

Temporary material is generated from a resolved **Temporary Construction
Requirement** and an eligible temporary method, not merely from final
HOUSE geometry.

### TemporaryConstructionRequirement

Capture:

-   trigger / construction stage / hazard
-   project/manufacturer/organization requirement
-   required outcome
-   selected eligible method
-   material realization
-   reuse class
-   peak simultaneous demand

### Quantity dimensions

Distinguish:

-   cumulative installed/used quantity
-   peak simultaneous quantity
-   new purchase quantity

Temporary materials can be reused. These quantities are not
interchangeable.

### Safety requirement vs material method

A requirement for fall protection, bracing, access, or stabilization
does not automatically authorize a wood-material solution.

### Specific families

-   Temporary bracing: only from resolved method.
-   Stakes: only where the chosen method requires them.
-   Guardrails: require a selected approved/project/organization
    assembly; do not invent a structural design.
-   Temporary stair treads: construction-state dependent.
-   Temporary handrails: requirement may exist while material method
    remains unresolved.
-   Truss temporary bracing: strong deterministic case when
    package/BCSI/project conditions establish the applicable rule;
    project instructions override general guidance.
-   Wall erection bracing: sequence/method dependent.
-   Scrap allowance: separate calculated reusable offcuts from any
    explicit configurable miscellaneous allowance.

### Reuse flow

Permanent purchasing is optimized first.

``` text
permanent purchase
-> permanent remnants
-> eligible temporary placements
-> existing contractor inventory
-> new temporary purchase
```

Compatibility is strict. A remnant is a resource, not automatically
waste.

------------------------------------------------------------------------

# Part VI --- Physical Identity, Installation Demand, and Calculation

## 32. Canonical Physical Identity

**HOUSE owns physical identity. Calculators materialize/reference
canonical physical objects. Ledgers aggregate them. Taxonomy never owns
them.**

Distinguish:

1.  physical identity
2.  installation/requirement identity
3.  purchasing identity

Canonical chain:

``` text
CONSTRUCTION REQUIREMENT
-> PHYSICAL REALIZATION
-> INSTALLATION DEMAND
-> PURCHASING TRANSFORMATION
-> PURCHASE ITEM
-> TAXONOMY VIEW
```

### 32.1 When to persist individual objects

Persist individual physical identity when geometry, specification,
relationships, role, or lifecycle can affect downstream behavior.

Repetitive consumables may be represented as installation-demand records
when individual physical object identity adds no construction value.

### 32.2 physicalId

Use stable opaque internal identity plus semantic locator/context
sufficient for deterministic reconciliation. Do not dedupe physical
objects by fuzzy material description.

### 32.3 Existing-realization-first

Before creating a new object to satisfy a requirement, determine whether
an existing canonical object already satisfies it.

This includes a foundation sill that is also the wall bottom plate, and
a stair opening header that is also the floor-system opening header: one
canonical HOUSE identity and one purchasing demand.

### 32.4 Manufactured component boundary

Do not explode manufactured systems beyond the field-purchased/installed
boundary unless project scope requires it.

### 32.5 Idempotent materialization

Running a materializer repeatedly on unchanged effective construction
must reconcile to the same physical population, not append duplicates.

### 32.6 Exactly-once installation accounting

Every purchase-relevant physical requirement must resolve to exactly one
canonical installation demand except for explicit governed purchasing
transformations.

Installation BOM lineage must be exactly-once.

------------------------------------------------------------------------

# Part VII --- Review, Unresolved, Overrides, and Diagnostics

## 33. Review

A Review has a usable active value or condition. It is not synonymous
with "unknown."

Every active governed assumption that requires user visibility produces
or participates in a Review.

Reviews should have stable reason codes, target the causal
decision/result, support grouping in UI, and support lifecycle states
such as open/resolved/superseded.

## 34. Unresolved

Unresolved means a required property/result cannot safely be
established.

Unresolved is property-level. Preserve known attributes and continue
unrelated calculation.

There is no global `pipelineBlocked` state for ordinary incompleteness.

`not_applicable` is success. `zero` is a known quantity. `unknown` is
never converted to zero.

`not_applicable` must be proven from established HOUSE/project
conditions. It cannot result from missing evidence, empty extraction
output, an unattempted source path, taxonomy membership, or unresolved
applicability.

A partially specified material requirement may be shown as
partial/unresolved but must not become a falsely purchasable generic
line.

## 35. Diagnostics

Developer diagnostics identify the **earliest responsible causal
layer**.

Canonical families:

-   `READ_GAP`
-   `PROJECT_SOURCE_CONFLICT`
-   `PROJECT_CONVENTION_GAP`
-   `RESOLVER_RELATIONSHIP_GAP`
-   `GEOMETRY_GAP`
-   `DERIVATION_GAP`
-   `CONSTRUCTION_RULE_GAP`
-   `MANUFACTURER_RULE_GAP`
-   `ASSUMPTION_RULE_GAP`
-   `FORBIDDEN_ASSUMPTION`
-   `CALCULATOR_GAP`
-   `PHYSICAL_IDENTITY_GAP`
-   `VALIDATION_FAILURE`
-   `OUTPUT_ACCOUNTING_GAP`
-   `PURCHASING_DATA_GAP`

Diagnostics may be grouped by root cause. Customer-facing messaging
remains separate from developer diagnostics.

## 36. Overrides and Recalculation

Prefer overrides at the causal decision rather than final quantity.

A ConstructionOverride changes Effective Construction and invalidates
only downstream dependents through explicit dependency relationships.

A ProcurementOverride changes purchase behavior without changing
physical construction truth.

Lightweight history/versioning is appropriate so recalculation remains
explainable.

------------------------------------------------------------------------

# Part VIII --- Purchasing and Optimization

## 37. Purchasing Contract

Purchasing is a deterministic transformation of installation
requirements, not another place to estimate construction.

``` text
RESOLVED HOUSE
-> PHYSICAL MATERIALIZATION
-> INSTALLATION DEMAND
-> INSTALLATION BOM
-> PURCHASING TRANSFORMATION
-> PURCHASE BOM
-> CUSTOMER TAKEOFF
-> MASTER TAXONOMY ACCOUNTING
```

### 37.1 Installation BOM vs Purchase BOM

Installation BOM = what the construction requires.

Purchase BOM = what must be bought after stock, package, yield, reuse,
inventory, and explicit procurement allowance.

Never collapse these layers.

## 38. MaterialSpecKey

Before optimization/aggregation, determine construction
interchangeability.

A MaterialSpecKey preserves all construction-relevant specification
needed to decide whether two demands may share stock or aggregate.

Missing specification does not mean interchangeable.

## 39. Linear Stock Optimizer

Inputs include:

-   MaterialSpecKey
-   required cuts
-   eligible stock lengths
-   stock restrictions
-   kerf where material
-   reuse policy

Outputs include:

-   stock allocations
-   cut assignments
-   remnants
-   optimization waste

Eligible stock lengths come from project/product constraints, supplier
catalog, or governed stock profile. If no authorized stock-length source
exists, procurement can remain unresolved while required cuts remain
complete.

Engineered exact-length design is preserved unless legitimate supplier
constraints require a separate purchasing decision.

A deterministic sensible best-fit / first-fit-decreasing class optimizer
is sufficient for V1; the product contract matters more than a
theoretically perfect optimizer.

## 40. Panel Packing

Panel purchasing uses actual required pieces, sheet dimensions,
rotation/orientation constraints, structural direction constraints, and
reusable offcuts.

Structural panel orientation must survive purchasing optimization.

## 41. Discrete items

Trusses, connectors, hardware, and other exact discrete components
aggregate by exact compatible identity. No blanket waste.

Multi-piece installation assemblies expand to complete installation BOM
before package conversion.

## 42. Fastener packaging

Installed fastener pieces -\> exact product/package -\> packages.

Package excess is recorded separately. Do not hide it as "waste."

## 43. Applied products

Application geometry -\> required consumption -\> selected product -\>
verified yield -\> packages.

Product resolution states may include:

-   `exact_product`
-   `basis_of_design_or_approved_equal`
-   `performance_specification`
-   `unresolved_product`

Material requirement can be complete while procurement remains
incomplete.

## 44. Supplier data

Supplier data is downstream. It may provide stock/package availability,
SKU, price, or lead time. It does not redesign construction.

## 45. Waste and allowance decomposition

Do not use a generic `wastePercent` as a catch-all.

Track separately:

-   `geometricWaste`
-   `optimizationWaste`
-   `packageExcess`
-   `procurementAllowance`

Remnants are not waste while they remain eligible resources.

A percentage procurement allowance is permitted only as an explicit
policy with a defined basis.

## 46. Inventory and temporary reuse

Inventory offset occurs after compatible purchase demand exists.

Permanent material optimization precedes temporary reuse. Temporary
demand then considers eligible permanent remnants and existing inventory
before new purchase.

## 47. PurchaseKey and ProcurementPool

`PurchaseKey` represents commercially interchangeable purchasable
identity and may remain unresolved.

Useful procurement pools include:

-   permanent
-   temporary
-   special-order
-   design-controlled

## 48. Customer takeoff line

A customer-facing purchase line should communicate:

-   Material
-   Specification
-   Purchase Quantity
-   Unit / Stock / Package
-   Required Quantity
-   Notes / Review

Internal physical IDs, resolution provenance/authority chains, and developer
diagnostics remain developer-facing unless intentionally exposed.

Engineered members and trusses retain useful mark/design attribution.

------------------------------------------------------------------------

# Part IX --- Taxonomy Accounting and Completeness

## 49. Taxonomy Is a View

The Master Taxonomy is the definitive V1 product completeness checklist.
It is not the HOUSE model and does not own physical objects.

Taxonomy accounting occurs after physical/install/purchase truth exists.

A `TaxonomyAccountingEntry` should reference relevant physical,
installation, purchase, Review, and Unresolved state.

## 50. Terminal states

Every taxonomy item closes as:

-   `complete`
-   `complete_with_review`
-   `partial_unresolved`
-   `not_applicable`

Processing states such as `unaccounted` or `applicability_unestablished`
must not survive as final V1 results.

`not_applicable` follows §12: it must be proven from established
HOUSE/project conditions and cannot result from missing evidence, empty
extraction output, an unattempted source path, taxonomy membership, or
unresolved applicability.

## 51. FramingTakeoff and ProductAccounting

`FramingTakeoff` is the canonical takeoff artifact.

`ProductAccounting` proves explicit taxonomy coverage and closure. It
does not calculate physical quantities.

## 52. Procurement completeness

A Procurement Completeness Validator checks, where applicable:

-   every required cut has stock or an explicit unresolved procurement
    reason
-   every required panel piece is assigned/purchased
-   every packaged item has verified package conversion or unresolved
    purchasing data
-   inventory offsets are compatible and bounded
-   purchase lineage returns to installation demand
-   taxonomy closure is explicit

------------------------------------------------------------------------

# Part X --- Canonical Pipeline and Implementation Dependency Map

## 53. Canonical execution phases

Do not implement V1 as a long taxonomy calculator sequence. Implement a
converging construction model with clear phase boundaries.

### Phase A --- Understand

``` text
PROJECT SOURCES
-> Project Orientation
-> ODL/vector/evidence
-> Plan Dictionary
-> READ Planner
<-> Targeted Reader
<-> HOUSE Reconstruction
-> Relationship Resolution
-> READ COMPLETE
```

### Phase B --- Resolve

``` text
Project Convention Resolver
-> Decision Resolver
   -> Derivation
   -> Applicable Rules
   -> Governed Assumptions
-> deterministic Resolution Convergence
-> Effective Construction
```

Calculators consume canonical effective values, not mystery primitives.

### Phase C --- Materialize

Dependency-oriented physical order:

-   Support Graph
-   Foundation
-   Walls
-   Floors
-   Beams/Posts
-   Roof Geometry
-   Stick Roof
-   Truss Systems
-   Stairs
-   Decks/Porches
-   Panel Layout
-   Requirement Convergence
-   Connection Registry
-   Fastener Ledger
-   Applied Product Ledger
-   Temporary Physical Demand
-   Installation BOM

This is not taxonomy order.

### Phase D --- Procure

``` text
Compatibility
-> Linear Stock / Panel Packing / Discrete Aggregation
-> Package / Yield Conversion
-> Permanent Purchase Requirement
-> Remnant Registry
-> Temporary Reuse / Inventory
-> Explicit Procurement Allowances
-> Purchase BOM
-> Procurement Validation
```

### Phase E --- Project

``` text
Reviews / Unresolved / Diagnostics
-> Taxonomy Accounting
-> FramingTakeoff
```

Reviews, unresolved states, and diagnostics are projections from
canonical current state rather than parallel truth systems.

------------------------------------------------------------------------

## 54. Implementation dependency waves

Implementation order is not identical to runtime execution order.

### Wave 0 --- Freeze canonical product authority

This specification and the Master Taxonomy become the product
architecture baseline.

### Wave 1 --- Core state contracts

Canonical identities, decisions, requirements, effective values,
dependency references, installation/purchase lineage.

### Wave 2 --- HOUSE reconciliation

Map surviving domain schemas into the connected canonical HOUSE and
relationship model.

### Wave 3 --- Decision / Assumption architecture

Project convention, derivation, rule, manufacturer rule, assumption
policy, effective-value resolution.

### Wave 4 --- Review / Unresolved / Diagnostic

Localized uncertainty and earliest-cause developer diagnostics.

### Wave 5 --- Physical registries

SupportGraph, physical identity registry, ConnectionRegistry,
requirement identity/convergence foundations.

### Wave 6 --- One complete wall vertical slice

Prove:

``` text
READ-supported/effective wall
-> physical members
-> openings/roles
-> panel/connection/fastener demand where applicable
-> Installation BOM
-> Purchase BOM
-> Reviews/Unresolved
-> taxonomy closure
```

before broad category expansion.

### Wave 7 --- Panel vertical slice

Shared physical panel layout, edge-support feedback, fastening, panel
purchasing.

### Wave 8 --- Floor

Physical joists/rim/openings/accessories/subfloor/supports.

### Wave 9 --- Foundation

Interface, sill, anchorage, specialty connection integration.

### Wave 10 --- Roof geometry + stick roof

3D roof geometry, method resolution, physical stick framing.

### Wave 11 --- Truss

Package/design binding and manufactured-component boundary.

### Wave 12 --- Specialized assemblies

Tall/special walls, stairs, decks/porches and other specialized
profiles.

### Wave 13 --- House-wide ledgers

Hardware/Connection, Fastener, and Applied Product ledgers complete
across assemblies.

### Wave 14 --- Temporary construction

Requirement/method/reuse/peak-demand logic.

### Wave 15 --- Full purchasing optimization

Stock, panel, package, yield, remnants, inventory, procurement
allowance.

### Wave 16 --- Full taxonomy closure

Every Master Taxonomy item receives explicit terminal accounting.

### Wave 17 --- Reader reconciliation

Map current Reader/ODL/Dictionary/evidence machinery onto canonical READ
contracts without redesigning the product architecture.

### Wave 18 --- READ evaluation / model comparison

Provider-neutral evaluation of plan-reading quality against
calculator-required facts.

### Wave 19 --- Full Beckstead benchmark

Use the real plan benchmark to validate completeness, accuracy, lineage,
review burden, and purchasing behavior. Burton or other supplier
takeoffs are references, not authoritative ground truth and must not be
tuned-to.

------------------------------------------------------------------------

# Part XI --- Architecture Guardrails

## 55. Do not resurrect the old permission machine

Do not rebuild architecture around:

-   claims
-   candidates
-   pending claims
-   candidacy
-   authority scores
-   confidence as calculation permission
-   blockingStatus
-   stage permission
-   giant PipelineRunner orchestration

The canonical pattern is:

``` text
known HOUSE / effective state
-> deterministic resolver/materializer/calculator
-> new physical facts / requirements / demands
-> reconcile by identity
-> repeat bounded deterministic convergence
```

If a requirement cannot resolve:

``` text
Review or Unresolved
+ earliest-cause Diagnostic
```

## 56. No silent fallthrough

Forbidden patterns include:

-   missing construction value -\> `0`
-   missing array -\> silently means not applicable
-   `?? default` that changes construction
-   missing product -\> generic purchasable line
-   missing structural design -\> estimating guess
-   taxonomy category -\> duplicate physical object
-   downstream LLM -\> autonomous material decision outside governed
    resolution

## 57. Construction Brain role

The Construction Brain remains human-readable construction knowledge and
Reader guidance.

Executable behavior progressively belongs in structured/versioned:

-   Construction Rule Registry
-   Manufacturer Rule Registry
-   Assumption Policy Registry
-   deterministic derivation/calculator code

Research is evidence used to author these authorities. Research itself
is not runtime authority.

## 58. Model boundary

Claude/LLM extracts and interprets project evidence in READ.
TypeScript/deterministic engines resolve governed consequences,
materialize physical construction, calculate quantities, purchase,
validate, and account.

No one-shot LLM takeoff is canonical V1 behavior.

------------------------------------------------------------------------

# Part XII --- Global Invariants

The following invariants are mandatory V1 acceptance criteria.

1.  **Project truth is preserved.** UserProjectInput may not silently
    outrank established project evidence. Conflicting user input must
    become an explicit ConstructionOverride. Overrides never falsify
    what plans contained.
2.  **One physical thing has one canonical physical identity.**
3.  **Roles and taxonomy categories do not duplicate purchasing.**
4.  **Design-controlled construction is never silently designed by
    estimating assumptions.**
5.  **Assumptions execute only through governed policies after
    project-source exhaustion.**
6.  **Unknown is never silently converted to zero or not-applicable.**
7.  **Uncertainty is localized to dependent results.**
8.  **Every active assumption requiring visibility is reviewable.**
9.  **Every unresolved result has an earliest responsible diagnostic
    when diagnostically actionable.**
10. **Every installation demand has causal lineage to physical
    construction/requirement.**
11. **Every purchase difference from installation requirement is
    attributable to an explicit purchasing transformation.**
12. **Material compatibility is established before
    aggregation/optimization.**
13. **Permanent purchasing is resolved before temporary remnant reuse.**
14. **Waste categories remain decomposed; remnants remain resources
    until disposition.**
15. **Every Master Taxonomy item reaches explicit terminal closure.**
16. **Post-READ deterministic execution is reproducible for the same
    project/effective inputs and versioned rules.**
17. **Materializers are idempotent and requirement convergence is
    bounded/deterministic.**
18. **Taxonomy never becomes the physical source of truth.**

------------------------------------------------------------------------

# Appendix A --- Canonical Specialized Principles

The following earlier named principles remain useful as specialized
consequences of the governing architecture:

-   **Role-Aware Framing:** assign roles after physical member identity
    so roles do not duplicate members.
-   **Framing-Relevance:** material is included because it belongs to
    framing scope/requirement, not merely because it appears near
    framing.
-   **Design Preservation:** specialized/engineered design is
    reconstructed, not invented.
-   **Geometry-to-Framing:** resolve construction method before
    translating geometry into members.
-   **Spatial Member:** variable-length members derive from resolved 3D
    endpoints/intersections.
-   **Manufactured-System:** preserve engineered manufactured component
    boundaries.
-   **Component Boundary:** do not explode factory internals into field
    material.
-   **Surface-to-Panel:** resolve physical panel pieces from
    surfaces/supports before sheet purchase.
-   **Environment-Aware Material:** treatment/exposure/coating can be
    part of material identity.
-   **Interface Assembly:** interfaces may own requirements that neither
    adjacent assembly owns alone.
-   **Connection Ownership:** assembly establishes need; canonical
    connection graph owns connection identity; Section 12
    aggregates/purchases. H-clips and discrete support connectors follow
    this path; roof sheathing does not purchase a second population of
    framing.
-   **BOM-to-Package:** installation pieces precede package conversion.
-   **Taxonomy-as-View:** taxonomy is downstream accounting.
-   **Fastener Specificity:** exact construction specification precedes
    aggregation.
-   **Zone-Specific Fastening:** local fastening zones override broader
    schedules.
-   **Joint-to-Fastener:** direct fastener demand comes from physical
    joints and applicable patterns.
-   **Application-Yield:** applied products are calculated from
    application geometry and verified yield.
-   **Requirement-Before-Product:** establish requirement/method before
    choosing product.
-   **Requirement-Method Separation:** safety/construction requirement
    is distinct from selected physical method.
-   **Temporary-Reuse:** temporary purchasing is based on peak/reuse,
    not cumulative installation alone.
-   **Scrap-as-Resource:** compatible remnants remain reusable
    resources.
-   **Permanent-Before-Temporary:** permanent optimization precedes
    temporary reuse.
-   **Physical-Granularity:** persist individual identity when it
    affects geometry/spec/relationships/lifecycle.
-   **Existing-Realization-First:** satisfy requirements with existing
    canonical objects before creating new ones.
-   **Topology-Before-Geometry:** for connections/support-driven
    materials, establish relationship participants before quantity.
-   **Idempotent-Materialization:** repeated deterministic
    materialization reconciles, not duplicates.
-   **Order-Independent-Truth:** equivalent effective construction
    should converge to the same canonical physical truth regardless of
    discovery order.
-   **Waste-Decomposition:** geometric, optimization, package excess,
    and procurement allowance remain distinct.
-   **No-Reverse-Quantity-Inference:** do not infer construction design
    backward from a desired material quantity.
-   **Exactly-Once-Installation-Accounting:** installation requirements
    enter the BOM once.
-   **Review-Has-a-Value:** Review is not a synonym for missing.
-   **Localized-Unresolved:** unresolved state is scoped to the
    dependency that cannot complete.
-   **Dependency-Scoped-Failure:** unrelated quantities continue.
-   **Earliest-Failure-Diagnostic:** diagnose the first responsible
    layer.
-   **Audience-Separation:** customer uncertainty and developer
    diagnostics are distinct.
-   **Unknown-Is-Not-Zero**
-   **Partial-Preservation**
-   **Cause-Level-Override**
-   **No-Silent-Fallthrough**
-   **Post-READ-Determinism**
-   **Compatibility-Before-Aggregation**
-   **Supplier-Does-Not-Redesign**
-   **Purchase-Lineage**
-   **Explicit-Taxonomy-Closure**
-   **Construction-and-Procurement-Separation**
-   **READ-Exhaustion**
-   **Resolution-Convergence**
-   **Single-Effective-Value**
-   **Canonical-Requirement-Convergence**
-   **Dependency-First-Implementation**
-   **Vertical-Slice-Before-Breadth**
-   **Shared-Physics-Before-Category-Specialization**

------------------------------------------------------------------------

# Appendix B --- V1 Product Boundary

This specification is intentionally limited to **residential framing
takeoff V1**.

It does not authorize speculative architecture for unrelated future
scopes.

Engineering details that remain implementation-defined include exact
repository paths, interface names, database/storage layout,
queue/orchestration technology, UI component structure, optimizer
implementation details, and model/provider choice.

Those implementation choices must preserve the product contracts and
invariants in this specification.

------------------------------------------------------------------------

# Appendix C --- Governing Summary

The shortest canonical statement of V1 is:

> **Read the plans until relevant project-source paths are exhausted.
> Reconstruct one connected physical HOUSE. Resolve each
> construction-significant property through authorized project facts,
> project conventions, deterministic derivations, applicable rules, or
> explicitly governed assumptions. Preserve engineered design.
> Materialize physical objects and requirements by identity. Calculate
> installation demand from physical reality. Transform installation
> demand into purchases only through explicit stock, package, yield,
> reuse, inventory, and allowance rules. Localize uncertainty. Preserve
> deterministic lineage. Account explicitly for every Master Taxonomy
> item.**

That is the V1 residential framing intelligence contract.
