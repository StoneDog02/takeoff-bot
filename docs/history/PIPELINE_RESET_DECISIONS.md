# Pipeline Reset Decisions

**Status:** Explicit decision log only.  
**Authority:** Decisions recorded here are locked for the pipeline reset. Where they conflict with planning docs or the architecture audit, these entries win.  
**Authors:** User + ChatGPT (entries recorded only when explicitly supplied).  
**Related (secondary):** [`RESET_MIGRATION_PLAN.md`](RESET_MIGRATION_PLAN.md), [`MINIMUM_PRODUCTION_FLOW.md`](MINIMUM_PRODUCTION_FLOW.md), [`CURRENT_PIPELINE_INVENTORY.md`](CURRENT_PIPELINE_INVENTORY.md).

---

## Update rules

Agents and contributors must follow these rules when touching this file:

1. **Append or edit only** when the user (or ChatGPT text the user forwards) **explicitly** supplies a decision to record.
2. **Do not** invent, infer, summarize from other docs, or pre-populate future-stage decisions.
3. **Do not** reinterpret or “clarify” a decision’s meaning beyond the wording given.
4. Prefer **verbatim or lightly formatted** capture of the given decision text. Record date and source only when provided.
5. Use sequential IDs: **D1**, **D2**, …

### Entry shape

```markdown
### D<n>

- **Date:** <if given>
- **Source:** <if given>
- **Decision:** <exact substance as given>
```

---

# Pipeline Reset North Star

The framing takeoff engine's production flow is:

**UPLOAD PDF → READ THE PLANS → CALCULATE / DERIVE / ASSUME → MATERIAL TAXONOMY OUTPUT**

This is the controlling architectural model for the factory reset.

## 1. UPLOAD PDF

The input is the residential construction plan set.

Do not create additional architectural ceremony around this step unless a concrete product requirement requires it.

## 2. READ THE PLANS

Use the reader capabilities necessary to understand what the plans actually say and show.

This may internally include Claude, OpenDataLoader, Drawing Compiler, Project Learning, OCR, project-specific interpretation, schedules, legends, notes, geometry, dimensions, cross-page references, and other reader capabilities that materially improve plan understanding.

The purpose is simple:

**Determine what is actually being built from the plans.**

Once READ THE PLANS has responsibly established construction information, downstream production code should be able to use that information directly. Do not require already-known information to be translated into a special Evidence, identity, authority, existence, relationship, or eligibility language merely so another subsystem will accept it.

## 3. CALCULATE / DERIVE / ASSUME

Turn the understood construction information into the materials required to frame the house.

This is one broad takeoff responsibility, not a requirement to create three new universal pipeline stages.

Construction domains may internally own their relevant logic.

Use:

1. Plan facts directly when known.
2. Deterministic derivation when required information follows from known plan facts, geometry, dimensions, construction relationships, or mathematics.
3. Governed assumptions when genuinely required information is missing and an authorized construction default applies.
4. NOT DETERMINABLE only when required information cannot responsibly be read, derived, or assumed.

Then calculate the required material quantities.

Relationships should exist only when they are necessary to understand construction, derive/calculate the correct material quantity, prevent double-counting, or satisfy another concrete takeoff requirement.

The goal is not to build a perfect internal representation of the building.

The goal is to understand enough of the building to calculate the framing takeoff correctly.

## 4. MATERIAL TAXONOMY OUTPUT

Calculated materials are expressed through the Material Taxonomy in normal contractor/lumberyard-readable language.

The Material Taxonomy is the final material vocabulary and completeness answer key.

It does NOT decide what exists.
It does NOT authorize calculations.
It does NOT determine which materials are allowed to apply to the house.

**The house determines what exists and what materials it requires.**

The taxonomy verifies that the resulting takeoff has accounted for the material universe we expect a complete framing takeoff to cover.

---

# Factory Reset Standard

Treat the current engine as a source of learning, construction knowledge, useful reader/calculation capabilities, tests, and implementation discoveries — not as architecture that must be preserved.

The reset may intentionally break the current engine.

Existing code does not stay merely because removing it would break a downstream subsystem that was designed to depend on it.

For every existing subsystem or abstraction, ask:

**How does this materially help READ THE PLANS, CALCULATE / DERIVE / ASSUME, or MATERIAL TAXONOMY OUTPUT produce a more accurate and complete framing takeoff?**

If its primary purpose is to translate information we already know into another internal representation so another subsystem will accept it, it is a removal candidate.

When removed machinery contains genuinely useful functionality, preserve or later recover the smallest useful capability in its natural owner rather than preserving the surrounding architecture preemptively.

Developer/debug capabilities such as provenance, artifacts, replay, diagnostics, traces, audits, and source references may remain where useful, but they must not become production authority, existence, eligibility, or calculation gates.

Git history, factual audits, tests, the pipeline inventory, and this decision log preserve our ability to recover useful logic if post-reset testing demonstrates that a removed capability materially improves plan reading or takeoff accuracy.

---

## Decisions

### D1

- **Decision:** Stage 1 (`verifiedPlanSet`) will be removed as a production pipeline stage. Preserve the plan index as an input to the pipeline. Preserve the concept of a plan-set artifact for developer/debug/replay purposes, but its current implementation is not locked and may be reworked or improved as part of the reset. Developer artifact persistence does not need to remain a production stage.

### D2

- **Decision:** The page-classification capability currently in Stage 2 is legitimate plan-reader functionality and should be preserved. It should be treated as an internal responsibility of the broader `READ THE PLANS` portion of the pipeline rather than automatically preserved as its own production stage. Final organization of the reader will be decided after reviewing the current Stage 5 and Stage 6 responsibilities.

### D3

- **Decision:** Stage 3 (`planReadingOrder`) does not need to remain an independent production stage. Preserve any useful reading/processing-order capability, but absorb it into the broader `READ THE PLANS` responsibility alongside page classification and the rest of the reader stack. Its current standalone artifact/stage structure is not required.

### D4

- **Decision:** Stage 4 (`buildingAssemblies`) will be removed from the production pipeline. The current stage is a hardcoded stub rather than plan-derived building understanding, and Stage 6's dependency on this artifact should therefore also be removed. Do not preserve the current stub merely because downstream code currently expects it.

### D5

- **Decision:** The legitimate capabilities currently spread across Stages 2, 3, and 5 belong to one broader production responsibility: `READ THE PLANS`. They do not need to remain separate top-level production pipeline stages merely because the reader contains multiple sophisticated internal systems. Page classification, useful reading/processing order, Project Learning, Project Orientation/project-specific interpretation, Drawing Compiler processing, and the associated reader context should operate as internal parts of the broader plan-reading responsibility.

### D6

- **Decision:** Preserve Project Learning as a reader capability. Its job is to learn project-specific definitions and meaning from schedules, legends, notes, OCR/ODL, and related plan content so the rest of the reader can interpret this particular plan set accurately. It belongs inside `READ THE PLANS`; it is not an independent production pipeline stage.

### D7

- **Decision:** Preserve Project Orientation/project-dictionary capability as reader functionality. Its useful job is understanding how this particular drawing set communicates through project-specific definitions, keyed notes, schedules, graphic conventions, and similar plan conventions. Preserve useful project-specific interpretation, but its current exact implementation, object structure, and separation from other reader components are not locked.

### D8

- **Decision:** Preserve the useful reader-integrity behavior currently performed by `DictionaryGovernor.govern`: project-specific interpretations should be checked against actual project evidence before the reader relies on them. This is validation of our reading/interpretation, not validation of the architect's design and not permission for materials to exist or calculate. The current `DictionaryGovernor` abstraction, GREEN/governance terminology, report structure, statuses, and exact implementation are not themselves locked and may be simplified or reworked while preserving useful reader-integrity checks.

### D9

- **Decision:** Preserve Drawing Compiler page compilation and useful compiled-page artifacts. Drawing Compiler belongs inside the broader `READ THE PLANS` responsibility. Preserve/rework useful compiler audit and compiled-page artifacts for developer debugging, inspection, and replay, but those developer artifacts are not separate production responsibilities and their current exact implementations are not locked.

### D10 — Evidence and Stage 6 Translation Machinery

- **Decision:** Preserve plan grounding, source provenance, and useful developer traceability, but the current unified `Evidence[]` architecture is not a required production architecture.
- `READ THE PLANS` should produce usable construction understanding from the plans. Information that Claude, OpenDataLoader, Drawing Compiler, Project Learning, project-specific interpretation, or other reader capabilities have already responsibly established does not need to be repackaged into a special Evidence/identity/binding/existence language merely because downstream code currently expects that representation.
- Stage 6 mechanisms whose primary purpose is to translate already-known reader information into Evidence objects, subject identities, canonical parent links, binding authority, existence eligibility, or another internal representation do not receive preservation preference.
- Preserve a Stage 6 capability only when it contributes information or interpretation that materially improves what we know about the construction plans and that information was not already responsibly established by `READ THE PLANS`. If useful logic is currently buried inside translation machinery, it may be absorbed into its natural reader or construction-domain owner rather than preserving the surrounding machinery.
- Relationships are preserved only when they are actually necessary to understand construction, derive the correct material quantity, prevent double-counting, or satisfy another concrete takeoff requirement. Relationships do not need universal Evidence or authority machinery merely to become usable.
- Wall-existence Evidence is not preserved as a production existence/eligibility requirement. A physical construction element responsibly identified from the plans does not need a separate Evidence object merely to be allowed to become usable by downstream takeoff logic.
- Provenance, Evidence snapshots, audits, traces, replay data, and similar artifacts may remain or be reworked in the developer/debug lane when useful, but they must not become production existence, identity, authority, eligibility, or calculation gates.

### D11 — Factory Reset / Controlling Production Architecture

- **Decision:** The pipeline reset is an architectural factory reset, not an incremental refactor of the existing engine. Treat the framing takeoff engine as if it were being started over with the benefit of everything learned from the existing implementation.
- The controlling production architecture is the Pipeline Reset North Star defined above.
- Existing stages, abstractions, Evidence systems, identity systems, relationship systems, authority systems, validation systems, claim systems, or other machinery receive no preservation preference merely because the current engine depends on them.
- Breaking the current pipeline during the reset is explicitly acceptable. Compatibility with the existing 16-stage architecture is not a reset requirement.
- A downstream stage breaking because removed upstream machinery no longer speaks its expected internal representation does not establish that the removed machinery was necessary.
- The reset's objective is the simplest architecture capable of reliably producing an accurate, complete framing material takeoff — not preservation of the current engine.

### D12 — Reader Boundary

- **Decision:** Stages 2, 3, 5, and the genuinely plan-reading portions of Stage 6 collapse conceptually into the single production responsibility `READ THE PLANS`.
- The reset does not need to preserve the current top-level boundaries between page classification, reading order, Project Learning, Project Orientation/project-specific interpretation, Drawing Compiler processing, Claude extraction, geometry extraction, semantic interpretation, or reader reconciliation.
- Sophisticated internal sequencing is allowed inside `READ THE PLANS` where technically necessary. Collapsing these into one production responsibility does not mean every reader operation must literally execute simultaneously or in one function.
- Do not preserve duplicate downstream reading/extraction behavior merely because it currently exists. If required construction information can already be responsibly obtained through the reader stack, downstream production code should consume that understood information rather than rereading the PDF or translating it through another special internal language.
- The output boundary of `READ THE PLANS` should serve the takeoff logic that follows; it should not require the house to pass through Evidence/existence/authority machinery before construction domains may use what the reader learned.

### D13 — Wall Resolution / Stage 7

- **Decision:** Stage 7 (`wallFraming` / `resolveWallFraming`) will not be preserved as a separate production resolution stage.
- Current Stage 7 does not discover physical walls from the plans. The relevant wall/run identity and major construction properties originate primarily from `READ THE PLANS` capabilities such as Drawing Compiler, Claude, Project Learning, project-specific interpretation, schedules, notes, geometry, and dimensions. Stage 7 primarily converts that already-known information from the current unified Evidence representation into `BuildingWall` / `WallSegment` objects, reconciles internal subject identities, inherits properties across Evidence subject clusters, creates canonical IDs, and records resolution/provenance metadata.
- The factory-reset engine does not require already-understood wall information to pass through Evidence grouping, canonical Evidence convergence, semanticTypeKey inheritance, binding-authority grades, existence eligibility, resolution traces, completion bookkeeping, or similar representation machinery merely to become usable for wall takeoff calculations.
- Preserve ordinary wall construction data structures where they are useful for calculation. Removing Stage 7 as a resolution stage does not prohibit having simple wall/domain objects or types. Such structures should represent construction information needed by the takeoff rather than act as permission or resolution gates.
- Preserve the construction meaning currently achieved through useful wall/type/schedule reconciliation when that meaning is required for material calculations. If `READ THE PLANS` establishes that a physical wall uses a particular plan-defined wall type, schedule definition, assembly, or other construction property, downstream wall takeoff logic should be able to use that understood information without requiring the current Evidence-to-semanticTypeKey-to-mark-cluster inheritance path.
- Wall material logic belongs under the North Star `CALCULATE / DERIVE / ASSUME` responsibility. For each required wall material input, use plan information already established by `READ THE PLANS`, deterministically derive what can responsibly be derived, use governed assumptions for genuinely missing inputs where authorized, and use NOT DETERMINABLE only when the input cannot responsibly be read, derived, or assumed.
- The current Stage 14 wall calculator is not the definition of complete wall-framing scope. Its current implementation calculates only studs and plates. Preserve useful deterministic calculation logic where appropriate, but future wall material completeness will be determined by the house, construction knowledge, and the researched Material Taxonomy rather than by the material families currently implemented.
- Developer provenance, traces, source references, replay information, and similar diagnostics may be preserved or reworked outside the production calculation authority path where useful.

### D14 — Natural Construction Relationships

- **Decision:** Construction relationships are part of understanding the house. They are not separate production milestones that must be re-proven through canonical relationship identifiers before takeoff calculations may use otherwise-established construction information.
- Residential build plans normally communicate relationships through the construction itself: openings occur in walls; member marks and callouts associate headers/beams with construction; schedules define marked assemblies; geometry establishes containment and adjacency; dimensions attach to physical construction; notes, leaders, details, legends, and keyed references establish additional meaning.
- `READ THE PLANS` is responsible for understanding and preserving the natural construction relationships necessary for takeoff. Its output should retain enough construction context for downstream domains to know which facts belong to which physical construction.
- Downstream production architecture must not require already-understood construction relationships to be translated through multiple representations merely to become usable. A relationship such as:
  `opening belongs to wall`
  or
  `opening uses header WB2`
  does not become more constructionally true because it is later represented as `parentPhysicalRunKey`, `parentWallId`, `parentObjectId`, `headerMemberId`, `supportedObjectIds`, or another canonical identifier.
- Identifiers, tags, references, pointers, nested structures, indexes, and similar implementation techniques are allowed wherever they are the simplest reliable way to represent or access construction information. This decision is not a prohibition on IDs or relationships.
- Such implementation representations must not become a second authority over the construction meaning already established by `READ THE PLANS`. Failure to create, translate, validate, or backlink a particular software identifier must not by itself discard otherwise usable construction information or suppress a material calculation.
- Preserve relationships only to the degree needed to:
  1. associate construction facts with the correct physical thing,
  2. derive a material quantity or specification,
  3. interpret construction necessary for a material,
  4. prevent duplicate counting,
  5. or support another concrete takeoff requirement.
- Reverse indexes and backlinks are not production requirements merely because they make the internal object graph bidirectional. They may exist for implementation convenience, developer inspection, debugging, replay, or UI use, but they must not become material-calculation gates unless a concrete takeoff requirement needs that exact relationship.
- Reconciliation of multiple reader observations that describe the same physical construction belongs inside `READ THE PLANS` when necessary to understand the plans. Do not finish reading the plans with several representations of a known construction relationship and then create a downstream production responsibility whose purpose is to translate those representations back into the relationship the reader already understood.
- The preferred conceptual flow is:

  `plans naturally represent construction`
  → `READ THE PLANS understands the construction and necessary relationships`
  → `CALCULATE / DERIVE / ASSUME consumes that understanding`
  → `MATERIAL TAXONOMY OUTPUT`

  not:

  `plans`
  → `reader relationship`
  → `Evidence relationship`
  → `canonical identity`
  → `relationship resolver`
  → `backlinks`
  → `validation of software relationship`
  → `recover construction relationship`
  → `calculate`

- The burden of proof is on any intermediate production relationship-resolution machinery to demonstrate that it discovers necessary construction meaning or materially improves takeoff correctness/completeness beyond what `READ THE PLANS` already established.

### D15 — Stage 8 Openings

- **Decision:** Stage 8 (`openings` / `resolveOpenings`) will not survive as a separate production resolution stage.
- Stage 8 does not discover physical openings from the plans. Opening occurrences, dimensions, categories, geometry, host-wall/run relationships, schedule/detail information, and similar construction information originate from READ THE PLANS capabilities.
- Preserve useful opening construction information in whatever simple domain representation best serves takeoff calculation. An Opening type/object is allowed and likely useful; the removed concept is the separate downstream resolution responsibility, not the construction information itself.
- Reconciliation of multiple reader observations that describe the same physical opening belongs inside READ THE PLANS when necessary to understand the plans.
- The opening↔wall relationship is legitimate construction information and must be preserved when needed for material calculations, wall stud netting, interpretation, or other concrete takeoff requirements. Per D14, the current parentPhysicalRunKey → Evidence → Stage 7 wall/segment ObjectIds → parentWallId/parentObjectId chain is not required merely to make that already-understood relationship usable.
- Failure to establish a canonical parent ObjectId must not by itself suppress otherwise calculable opening materials when READ THE PLANS has responsibly established the opening, its host construction, and the necessary inputs.
- Wall `openingIds` backlinks are not required production calculation machinery. Preserve a reverse index only if a concrete implementation, debugging, replay, or UI need justifies it; it must not become material authority.
- Opening identity clustering, identity-role classification, canonical ObjectId convergence, resolution traces/completion bookkeeping, and similar post-reader representation machinery are not preserved as separate production responsibilities. Any genuinely necessary observation reconciliation belongs in READ THE PLANS.
- Preserve useful deterministic opening-framing calculations and governed assumption behavior under CALCULATE / DERIVE / ASSUME. Current useful logic includes king/jack totals, rough-sill LF, cripple calculations, and governed defaults where applicable.
- The current Stage 14 opening calculator is not the definition of complete opening-framing scope. Missing capabilities such as responsible jack-stud determination, header framing/materials, garage-door framing, connectors, and other opening-related materials are future takeoff-capability questions to be evaluated from construction requirements and the researched Material Taxonomy.
- Developer provenance/source references/replay diagnostics may survive outside the production calculation authority path where useful.

### D16 — Stage 9 Structural Members

- **Decision:** Stage 9 (`structuralMembers` / `resolveStructuralMembers`) and its separate opening↔header canonical-linking responsibility will not survive as a separate production resolution stage.
- Stage 9 does not discover structural members from the plans. Member marks, categories, materials, sizes, lengths, locations, schedule definitions, and explicit opening↔header associations originate from READ THE PLANS capabilities and are converted by Stage 9 from Evidence into canonical StructuralMember objects.
- Preserve useful structural-member construction information in a simple domain representation suitable for calculation. StructuralMember types/objects and identifiers are allowed implementation techniques; they are not material-existence or calculation authority.
- Explicit construction relationships such as "this opening uses header WB2" belong to READ THE PLANS understanding. Per D14, translating headerMemberTag/supportedOpeningTag into headerMemberId/supportedObjectIds does not make the relationship more constructionally valid and is not a required production milestone.
- Canonical opening↔member backlinks must not become calculation gates merely because the internal object graph expects them. Current structural-member material calculation does not require the opening link.
- Preserve the useful deterministic construction/reconciliation logic currently contained in `applyStructuralMemberAuthority`, but absorb each rule into its natural future owner rather than preserving the Authority subsystem for its own sake. Useful behavior includes dimensional-notation reconciliation, distinguishing schedule marks from actual dimensional sizes, supported beam/header terminology reconciliation, and explicit single-occurrence quantity derivation.
- Preserve useful structural-member quantity calculation under CALCULATE / DERIVE / ASSUME. The current deterministic LF calculation (`length × quantity × ply count` where applicable) is useful construction logic.
- The current structural-member calculator is not the definition of complete structural framing scope. Future completeness is determined by the house, construction requirements, and researched Material Taxonomy.
- A failure in optional software relationship/backlink representation must not suppress an otherwise calculable structural-member material line.
- Resolution traces, completion bookkeeping, source references, provenance, replay information, and similar diagnostics may survive outside production calculation authority where useful.

### D17 — Stage 10 Sheathing

- **Decision:** Stage 10 (`sheathing` / `resolveSheathing`) will not be preserved as a separate production resolution stage. Preserve sheathing as a legitimate construction/takeoff domain under `CALCULATE / DERIVE / ASSUME`.
- Current Stage 10 does not discover sheathing construction from the plans. It primarily converts `sheathing-system` and `sheathing-area` Evidence into `SheathingSystem` / `SheathingArea` objects, resolves scalar properties, translates explicit relationship tags into ObjectIds, and creates system↔area links/backlinks.
- Preserve useful sheathing construction information such as application, panel type, thickness, grade, span/exposure information, edge treatment, specification references, coverage information, and other properties actually needed for takeoff. The current exact `SheathingSystem` / `SheathingArea` object split and lifecycle are not locked.
- `READ THE PLANS` should preserve sheathing specifications and their natural construction context wherever the plans establish them. Useful sheathing information does not need to be reminted onto a special `sheathing-system` Evidence subject merely because the current Stage 10 resolver expects that vocabulary.
- Sheathing information already understood through wall assemblies, wall types, shear-wall schedules, floor construction, roof construction, general framing notes, Project Learning, Drawing Compiler, Claude, or other reader capabilities should remain usable by the relevant takeoff logic. A property-path or subjectKind difference must not make otherwise-known construction information unusable.
- Preserve the distinction between:
  1. the sheathing specification required by the construction, and
  2. the physical construction coverage to which that specification applies.

  These concepts may be represented however is simplest for reliable calculation; they do not require the current standalone `SheathingSystem → SheathingArea` production lifecycle.
- Sheathing coverage should follow the North Star `FACT → DERIVE → ASSUME → NOT DETERMINABLE` behavior.

  Directly stated sheathing area is a usable plan fact when available.

  When coverage can be deterministically derived from responsibly understood construction geometry, dimensions, and relationships, it should be treated as a derivation rather than requiring an explicit square-foot value from the plans.

  Governed assumptions may later supply genuinely missing required inputs where construction knowledge authorizes them.

  `NOT DETERMINABLE` is reserved for cases where required information cannot responsibly be read, derived, or assumed.
- The current requirement for an explicit `sheathing-area.areaSquareFeet` Evidence subject is not preserved as the only legitimate source of sheathing coverage.
- The current requirement that every calculable sheathing area successfully translate `parentSystemTag` into a canonical `parentSystemId` is not preserved as a production authority gate. Per D14, natural construction relationships already established by `READ THE PLANS` may be consumed in the simplest reliable representation.
- `system.areaIds`, covered-wall ObjectId backlinks, opening ObjectId backlinks, canonical SHS/SHA identity convergence, resolution traces, completion bookkeeping, and similar representation machinery are not preserved as production requirements merely because the current object graph expects them. Preserve any such representation only when a concrete takeoff, implementation, debugging, replay, or UI need earns it.
- Preserve useful deterministic sheathing calculation behavior currently implemented, including the ability to emit coverage quantity from a known sheathing area and resolved material specification.
- The current Stage 14 sheathing calculator is not the definition of complete sheathing takeoff scope. It currently emits coverage square footage only and does not perform wall area derivation, opening deductions, panel/sheet counts, waste calculations, or other potentially required sheathing materials/calculations.
- Do not decide those missing formulas or material families in this decision. Future sheathing completeness will be determined from construction requirements and the researched Material Taxonomy.
- Validation of sheathing should protect actual interpretation and calculation integrity. Internal relationship consistency such as `system.areaIds ↔ parentSystemId` must not become a material-calculation gate unless the relationship is concretely necessary to calculate the material correctly.
- Developer provenance, source references, traces, replay information, and similar diagnostics may survive outside the production calculation authority path where useful.

### D18 — Stage 11 Floor Framing

- **Decision:** Stage 11 (`floorFraming` / `resolveFloorFraming`) will not be preserved as a separate production resolution stage. Preserve floor framing as a legitimate construction/takeoff domain under `CALCULATE / DERIVE / ASSUME`.
- Current Stage 11 primarily converts `floor-framing-system` and `floor-framing-area` Evidence into `FloorFramingSystem` / `FloorFramingArea` objects, resolves scalar construction properties, translates relationship tags into ObjectIds, creates system↔area links, and records resolution/authority metadata.
- Preserve useful floor-framing construction information and simple domain representations wherever they materially support takeoff. The current exact `FloorFramingSystem` / `FloorFramingArea` object split and lifecycle are not locked.
- Preserve the genuinely useful deterministic construction intelligence currently embedded in Stage 11, but move/absorb that capability into its natural reader or floor-takeoff owner rather than preserving the resolver architecture merely to retain it.

  Useful existing capabilities include, where supported by their actual construction meaning:

  - parsing combined joist descriptions into usable type/size information,
  - recovering member length from MAX SPAN/member-length callouts when the reader representation misclassifies that value,
  - reconciling fragmented/sibling floor-system assembly information when those observations describe the same construction,
  - recognizing the spacing axis needed for joist-count calculation,
  - preventing slab construction from being treated as a wood-framed joist floor.
- Reconciliation of multiple reader observations that describe the same floor construction should occur as part of understanding the plans or the natural floor-domain interpretation needed for takeoff. It does not justify a separate production resolution lifecycle by itself.
- Preserve the current deterministic joist calculation capability:

  joist count =
  `ceil(joistLayoutLengthFeet × 12 / joistSpacingInches) + 1`

  and, where installed member length is responsibly known:

  joist linear feet =
  `joist count × joistMemberLengthFeet`

  These are legitimate takeoff derivations from construction facts, not assumptions merely because the final quantities are not written on the plans.
- The Beckstead crawl example demonstrates the desired distinction:

  the plan/reader can establish the crawl-space joist specification, 40-foot spacing-axis bay dimension, 17-foot member/span information, and their natural construction context; deterministic takeoff logic can then derive 31 joists and 527 LF.
- The current requirement for that known floor construction to additionally pass through an explicit `parentSystemTag → parentSystemId` translation and bidirectional `system.areaIds` relationship before calculation is not preserved as a production authority requirement.
- Per D14, the construction relationship itself matters: the engine must know which physical floor area uses which framing construction. A particular canonical tag, ObjectId, backlink, or other software representation does not become a second authority over that already-understood construction relationship.
- Identifiers and references remain allowed when they are the simplest reliable implementation technique, but failure to create or validate a particular canonical relationship representation must not by itself suppress otherwise-calculable floor material.
- Floor-framing quantity inputs should follow:

  FACT → DERIVE → ASSUME → NOT DETERMINABLE.

  Direct plan dimensions and specifications are facts.

  Joist count, joist linear feet, parsed construction notation, and other values that deterministically follow from known construction information are derivations.

  Governed assumptions may later fill genuinely missing required inputs where construction knowledge authorizes them.

  NOT DETERMINABLE is reserved for required information that cannot responsibly be read, derived, or assumed.
- Do not require an explicitly extracted final takeoff quantity when that quantity can be deterministically calculated from construction information already understood by the engine.
- Preserve useful floor-construction compatibility rules such as preventing known slab construction from generating wood-floor joist material. Such rules belong to construction interpretation/calculation integrity, not a generalized authority or eligibility architecture.
- The current Stage 14 floor calculator is not the definition of complete floor-framing scope. It currently emits joist each-count and supported joist linear footage only.
- Existing information such as rim/band/rim-board requirements, blocking, bridging, opening conditions, floor sheathing/subfloor relationships, and other floor-framing requirements may be known or represented without currently becoming material output.
- Do not decide the complete future floor-framing material families or missing formulas in this decision. Future floor-framing completeness will be determined from construction requirements and the researched Material Taxonomy.
- Validation should protect actual interpretation and calculation integrity: required dimensions, specifications, construction compatibility, and mathematical correctness.
- Bidirectional relationship consistency, canonical IDs, trace authority, Evidence representation, or similar internal bookkeeping must not become material-calculation gates unless concretely necessary to calculate the material correctly.
- Developer provenance, source references, traces, replay information, and similar diagnostics may survive outside the production calculation authority path where useful.

### D19 — Stage 12 Roof Framing

- **Decision:** Stage 12 (`roofFraming` / `resolveRoofFraming`) will not be preserved as a separate production resolution stage. Preserve roof framing as a legitimate construction/takeoff domain under `CALCULATE / DERIVE / ASSUME`.
- Current Stage 12 primarily converts `roof-framing-system` and `roof-plane` Evidence into `RoofFramingSystem` / `RoofPlane` objects, resolves scalar properties from fixed Evidence paths, translates relationship tags into ObjectIds, creates system↔plane links, and records resolution metadata.
- Stage 12 does not itself discover roof planes from plan geometry, derive rafter/truss layout geometry, derive pitch-adjusted dimensions or areas, calculate roof-framing quantities, or consume several useful reader facts represented on other property paths.
- Preserve useful roof construction information and simple domain representations wherever they materially support takeoff. The current exact `RoofFramingSystem` / `RoofPlane` object split and lifecycle are not locked.
- `READ THE PLANS` should preserve the roof construction actually established by the plans, including framing family, roof regions/planes where needed, pitch, spacing, specifications, geometry, notes, schedules, and natural construction relationships.
- Useful roof information already understood through Claude, ODL/OCR, Drawing Compiler, Project Learning, Project Dictionary, roof notes, schedules, geometry, or other reader capabilities must not become unusable merely because it does not appear on the exact Evidence subjectKind or property path expected by the current Stage 12 resolver.
- Reconciliation of multiple reader observations describing the same roof construction belongs within READ THE PLANS or the natural roof-domain interpretation needed for takeoff. It does not justify a separate production resolution lifecycle by itself.
- Preserve the legitimate deterministic stick-common-rafter count currently implemented:

  common rafter count =
  `ceil(rafterLayoutLengthFeet × 12 / memberSpacingInches) + 1`

  when the understood construction is actually stick common-rafter framing and the required construction inputs are responsibly known.
- That quantity is a deterministic takeoff derivation, not an assumption merely because the final rafter count is not explicitly written on the plans.
- Preserve the useful construction distinction between framing families. Stick-rafter logic must not be applied to a roof understood to use prefab, engineered, scissor, or other truss construction merely to force material output.
- However, framing-family recognition should direct the roof takeoff logic to the appropriate construction calculation path; it should not function as a generalized eligibility/authority gate over whether roof construction exists.
- Beckstead's zero roof-framing output exposes a genuine takeoff-capability gap in addition to representation issues.

  The reader successfully identifies meaningful prefab/scissor-truss construction, spacing, pitch, and related roof information, while the current calculator implements only stick common-rafter count.

  Therefore Beckstead's zero roof output must not be characterized primarily as reader failure or solely as resolver/relationship failure.
- The current engine has no implemented production calculation path for truss packages/counts, ridge/hip/valley material, rafter linear footage, or other potentially required roof-framing material families.
- Those missing capabilities are legitimate future takeoff-domain work, not justification for preserving the current Stage 12 resolution architecture.
- Do not define the missing roof formulas, truss-estimation rules, or complete roof material families in this decision. Their requirements will be determined from construction research, the Material Taxonomy, and actual plan-set needs.
- Roof-framing inputs should follow:

  FACT → DERIVE → ASSUME → NOT DETERMINABLE.

  Directly established framing types, specifications, spacing, pitch, dimensions, notes, and geometry are facts.

  Quantities or dimensions that deterministically follow from responsibly understood construction facts and geometry are derivations.

  Governed assumptions may later fill genuinely missing required inputs where construction knowledge authorizes them.

  NOT DETERMINABLE is reserved for required information that cannot responsibly be read, derived, or assumed.
- The current requirement that a roof plane successfully translate an explicit `parentSystemTag → parentSystemId`, appear in `system.planeIds`, and satisfy the current canonical relationship representation is not preserved as a production authority requirement.
- Per D14, the underlying construction relationship matters: the engine must understand which roof region/plane uses which framing construction when that relationship is necessary for correct material calculation.

  A particular tag, ObjectId, backlink, or canonical representation does not become a second authority over that already-understood relationship.
- Identifiers and references remain allowed where they are the simplest reliable implementation technique, but failure to create or validate a particular canonical relationship representation must not by itself suppress otherwise-calculable roof material.
- Preserve only relationships that materially support correct roof interpretation, quantity derivation, material specification, double-counting prevention, or another concrete takeoff requirement.
- Validation should protect actual roof interpretation and calculation integrity: required construction inputs, correct framing-family logic, dimensional usability, and mathematical correctness.
- Missing or dangling internal backlinks, canonical IDs, Evidence traces, completion metadata, or similar representation bookkeeping must not become material-calculation gates unless concretely necessary to calculate the material correctly.
- The current Stage 14 roof calculator is not the definition of complete roof-framing scope. Its single implemented common-rafter quantity is one useful calculation, not the product boundary.
- Developer provenance, source references, traces, replay information, and similar diagnostics may survive outside the production calculation authority path where useful.

### D20 — Stage 13 Validation / Blocking

- **Decision:** Stage 13 (`validation` / `coordinateFramingValidation`) will not be preserved as a centralized production permission gate between understood construction and material calculation.
- Validation remains a legitimate capability, but its useful responsibilities should live with their natural owners rather than requiring all construction objects and quantities to pass through a separate validation authority before material may be calculated.
- The controlling principle remains:

  "Validators validate the engine's interpretation/calculation integrity.
  They do not validate the architect's design."

  Or more simply:

  "Validate our reading and our math — not the architect's building."
- Current Stage 13 receives the resolved domain outputs from Stages 7–12 and produces a parallel validation artifact containing validation issues, validation results, and review items.
- Stage 14 material suppression occurs only when a validation issue targets a contributing object and matching quantity key with `quantityImpacts.canCalculate === false`.

  Validation severity and review-item `blockingStatus` do not themselves determine material suppression.
- Beckstead M.4 establishes that the current Stage 13 is not necessary to produce the material lines currently calculable by the engine.

  Re-running Stage 14 with validation and without validation produces the identical 52 material lines.

  Therefore zero Beckstead material lines are suppressed solely by Stage 13 in the frozen M.4 run.
- The absent Beckstead opening, structural-member, sheathing, floor-framing, and roof-framing material is explained by missing calculator inputs, missing derivations, missing construction capability, or missing calculator paths before Stage 13 blocking becomes the limiting factor.
- Do not interpret this as proof that validation itself is unnecessary.

  Instead, separate the useful validation responsibilities according to their natural production owner.
- **Construction interpretation integrity belongs with READ THE PLANS.**

  When the engine has genuinely conflicting interpretations of plan information and cannot responsibly establish which construction fact is correct, that conflict should be handled where the construction is being understood.

  It should not require an otherwise-complete construction object to travel through a later centralized validation lifecycle merely to become usable.
- **Calculation-input and mathematical integrity belong with CALCULATE / DERIVE / ASSUME and the relevant domain calculator.**

  Calculators must continue to refuse formulas whose genuinely required inputs are unavailable, unresolved, numerically unusable, incompatible with the construction family being calculated, or otherwise incapable of producing a responsible quantity.
- Preserve the current calculator-side safety behavior where useful, including:

  - required-input checks,
  - null/unresolved input guards,
  - numeric guards,
  - construction-family compatibility checks,
  - formula-specific eligibility checks,
  - and other local protections actually necessary to prevent incorrect material output.
- Current Stage 14 calculators already independently guard the major construction/math inputs used by all current emitters.

  The Stage 13 audit proves that wall, opening, structural-member, sheathing, floor-framing, and roof-framing calculators safely refuse their currently unusable inputs without requiring Stage 13 to suppress them.
- Do not preserve duplicated Stage 13 rules merely because they provide a second copy of a safety check already naturally enforced by the calculator.
- **Representation consistency must not become material authority.**

  Missing canonical ObjectIds, backlinks, reverse indexes, dangling optional relationship pointers, Evidence traces, or other internal representation bookkeeping must not suppress otherwise-calculable material unless the underlying construction relationship or information is concretely required by that calculation.
- The proved `member.supportedObjects.resolved` case is the controlling example:

  a structural member can have complete category, material, size, length, quantity, and ply information sufficient for its material-LF formula, yet a dangling `supportedObjectId` causes current Stage 13 validation to block the material.

  Because the current structural-member LF formula does not consume `supportedObjectIds`, that representation failure must not function as a production material gate.
- This does not mean construction relationships are unimportant.

  Per D14, preserve relationships wherever they materially support correct interpretation, material specification, quantity derivation, double-counting prevention, or another concrete takeoff requirement.

  The construction relationship matters; a preferred software representation of that relationship does not become a second authority over the material.
- **Review and uncertainty must remain separate from calculation permission.**

  A review item may accompany calculated material.

  Review should normally mean:

  "We completed the takeoff using the best governed information available.
  Please verify this input."

  Review-required does not inherently mean material-blocked.
- Preserve useful review generation where it communicates genuine uncertainty, governed defaults, assumptions, interpretation conflicts, or other information a human should verify.
- Do not preserve the current coupling where the same centralized validation system simultaneously serves developer diagnostics, human review, representation-consistency auditing, and production material permission.
- **Developer diagnostics and auditability may survive outside the production authority path.**

  Validation results, provenance, source references, traces, pass/fail diagnostics, relationship-integrity checks, replay information, and similar developer-facing observability may remain where useful for debugging, testing, and engine evaluation.

  They do not need to authorize material calculation.
- Quantity-scoped diagnostic information remains potentially useful.

  The current ability to identify that a specific quantity cannot be calculated without necessarily suppressing unrelated quantities on the same object reflects a legitimate principle:

  failure of one calculation should not automatically invalidate unrelated calculations.

  Preserve that principle in the natural domain/calculation flow where needed; do not preserve Stage 13 solely to retain its current `quantityImpacts.canCalculate` mechanism.
- Warning, error, review, confidence, and calculation-completion state should remain conceptually distinct.

  A warning may accompany successful calculation.

  A review item may accompany successful calculation.

  Low confidence does not inherently mean no material.

  A genuinely unusable required calculation input may prevent only the affected calculation.
- `FACT → DERIVE → ASSUME → NOT DETERMINABLE` remains the controlling input completion flow.

  Validation must not prematurely convert a missing explicit fact into blocked material before deterministic derivation and governed assumptions have had their opportunity to complete the required input.
- NOT DETERMINABLE remains reserved for a required construction input that cannot responsibly be read, derived, or assumed.
- Stage 13 does not define material completeness.

  It does not determine the complete framing scope, Material Taxonomy coverage, missing material families, or whether the final takeoff is complete.
- No centralized validation stage is required in the minimum production pipeline merely because the current engine contains one.

  The minimum production architecture remains:

  UPLOAD PDF
  → READ THE PLANS
  → CALCULATE / DERIVE / ASSUME
  → MATERIAL TAXONOMY OUTPUT

  Interpretation validation belongs inside READ THE PLANS where needed.

  Calculation validation belongs inside CALCULATE / DERIVE / ASSUME where needed.

  Developer diagnostics, audit information, and human review may observe those processes without becoming a mandatory intermediate production authority.
- Do not implement the reset in this decision.
- Do not redesign the review system, assumption system, confidence system, or diagnostics architecture here.
- Do not add missing construction-domain capability discovered during prior audits.

  Known gaps remain post-reset backlog until the minimum reset pipeline is operational and Beckstead is rerun.

### D21 — Stage 14 Calculations

- **Decision:** Preserve the proven construction/takeoff intelligence in the current Stage 14 calculator layer, but do not preserve Stage 14's current orchestration contract, resolved-object prerequisites, validation dependencies, claim lifecycle, or artifact boundaries merely because the existing calculators use them.
- CALCULATE / DERIVE / ASSUME is a permanent production responsibility under the controlling architecture:

  UPLOAD PDF
  → READ THE PLANS
  → CALCULATE / DERIVE / ASSUME
  → MATERIAL TAXONOMY OUTPUT
- Preserve proven deterministic calculation behavior currently implemented where it remains construction-correct, including:

  - regularly spaced member counting:
    `ceil(lengthFeet × 12 / spacingInches) + 1`
    where applicable to the actual construction;

  - wall stud counting;

  - wall net stud deduction from positioned rough-opening zones;

  - wall plate linear footage;

  - opening king-stud quantity calculation;

  - opening jack-stud quantity calculation;

  - opening rough-sill linear footage;

  - opening cripple-count derivation;

  - structural-member linear footage using length, quantity, and ply where applicable;

  - floor joist count;

  - floor joist linear footage;

  - stick common-rafter count where the understood construction actually uses that framing method;

  - sheathing square-foot emission when physical coverage and material specification are responsibly known;

  - fastener quantity passthrough when an actual quantity is responsibly established.
- Preserve the construction logic represented by the three current governed opening assumptions as existing proven capability:

  - default kingStudCount = 2;
  - rough sill member size follows wall stud size;
  - cripple layout continuation from rough-opening width.

  This does not preserve the current assumption-registry API, object shape, claim lifecycle, or orchestration architecture. The assumption system may be simplified or redesigned later.
- Preserve the verified floor derivation:

  `ceil(40 × 12 / 16) + 1 = 31 joists`

  and:

  `31 × 17 = 527 LF`.

  The 40-foot value is the spacing-axis bay dimension, not a joist count.
- Frozen Beckstead M.4 producing zero floor material does not establish that the joist calculation is deficient.

  Existing fixture/test evidence proves that the calculator produces 31 joists and 527 LF when the required construction information reaches it.
- **Construction inputs are the calculator contract.**

  Preserve information genuinely required to calculate the material correctly.

  Do not preserve a software representation merely because the current calculator expects it.
- Genuine calculator requirements may include dimensions, spacing, material specification, construction family, quantity, ply, physical coverage, opening dimensions, host construction context, or other information that materially changes the calculation.
- Exact current software prerequisites do not receive preservation preference, including:

  - canonical parent ObjectIds;
  - bidirectional system/area/plane backlinks;
  - Evidence-derived resolution traces;
  - Stage 13 validation permission;
  - claimStatus;
  - claim/candidacy lifecycle;
  - artifact-envelope boundaries;
  - canonical IDs used only for material-line identity.
- D14 governs calculator relationships.

  Preserve the underlying construction relationship when the calculation actually needs it.

  Do not require a particular canonical ID, backlink, or translation chain merely to re-prove construction context READ THE PLANS already responsibly established.
- Preserve legitimate construction-family protections.

  For example:

  - do not apply stick-rafter math to a prefab-truss roof;
  - do not apply wood-framing formulas to incompatible construction;
  - do not calculate floor joists for a known slab.

  These are construction-correctness rules, not generalized material authority or eligibility machinery.
- Preserve calculator-local guards that prevent mathematically or constructionally invalid output when genuinely required inputs are unusable.
- Do not preserve duplicated validation, resolution, authority, trace, relationship, or lifecycle requirements merely because they currently sit in front of otherwise-valid formulas.
- FACT → DERIVE → ASSUME → NOT DETERMINABLE remains the controlling calculation-input flow.
- Current Stage 14 does not implement that flow universally.

  In many domains its behavior is effectively FACT → DERIVE → skip when required information is unavailable.

  That limitation is not adopted as the desired reset behavior.
- Per D22, do NOT preserve `PendingMaterialClaim`, `pendingClaims`, or a replacement pending-claim lifecycle as part of Stage 14.
- Do not introduce a generalized replacement abstraction for incomplete calculations during teardown.
- Do not fabricate material when a genuinely required input cannot be responsibly read, derived, or assumed.
- The current calculator surface is a proven starting capability, not the definition of a complete framing takeoff.
- Known missing calculator capability discovered by the audits remains post-reset work.

  This includes currently identified gaps such as opening headers through the opening path, blocking, connectors/hardware, rim board, floor-truss packages, truss-roof packages, ridge/hip/valley roof framing, geometry-derived sheathing coverage, sheathing sheet conversion, sheathing waste, and other repository-supported material families not currently calculated.
- Do not implement those missing capabilities during teardown.
- Beckstead M.4's narrow current material output does not mean only wall calculation survives.

  Preserve proven calculator capability demonstrated by code/tests/fixtures even where the current old-pipeline representation prevents it from executing on frozen Beckstead M.4.
- The calculator layer exists to answer:

  **Given what we responsibly understand about this house, what framing material does it require, and how much?**

  It does not exist to prove that construction information successfully traversed the old pipeline's representation lifecycle.
- The reset sequence remains:

  complete the factory-reset decisions
  → design/build the minimum production pipeline
  → carry forward proven reader and calculation capability
  → run full Beckstead
  → observe the resulting takeoff
  → address genuine takeoff-capability gaps
  → later evaluate completeness against the researched Material Taxonomy.
- Do not implement the reset in this decision.
- Do not redesign calculator APIs, domain objects, assumption architecture, review architecture, material-line schema, or Material Taxonomy here.

### D22 — Pending Claims / PendingMaterialClaim

- **Decision:** Remove `pendingClaims` / `PendingMaterialClaim` from the minimum reset architecture.
- The current pending-claim system has not demonstrated a necessary production responsibility that justifies carrying the concept into the reset.
- Do not preserve:

  - `PendingMaterialClaim`;
  - `pendingClaims`;
  - pending-claim collection;
  - pending-claim status/lifecycle;
  - claim-contract machinery whose purpose is to create or manage pending claims;
  - `unsupported_capability` pending markers;
  - calculator-generated pending claims, including the current missing jack-stud pending path.
- Do not design a replacement for pending claims during teardown.
- Do not preserve the concept under a different generalized name merely to retain the same lifecycle.
- Missing takeoff capability is not itself a runtime pending claim.

  For example, the absence of a blocking, connector, hardware, roof-truss, or opening-header calculator is a product-development capability gap. It does not require the production takeoff to manufacture a pending material object representing that missing software capability.
- Likewise, a required construction input being unavailable does not justify preserving `PendingMaterialClaim`.

  The controlling production flow remains:

  FACT
  → DERIVE
  → ASSUME where governed
  → NOT DETERMINABLE only when the required input cannot responsibly be read, derived, or assumed.
- The exact eventual representation of NOT DETERMINABLE does not need to be decided here.
- Human review remains a separate concern and does not require pending claims.
- Developer diagnostics remain a separate concern and do not require pending claims.
- Material Taxonomy completeness remains a separate concern and does not require pending claims.
- If the simplified pipeline later exposes a concrete production requirement that the old pending-claim machinery happened to address, recover only the smallest capability necessary to solve that demonstrated requirement.

  Do not restore `pendingClaims` merely because the old engine had them.
- Factory-reset burden of proof applies:

  `pendingClaims` do not survive because removing them might cause a future problem.

  They survive only if we can explain a concrete necessary job they perform for producing an accurate, complete framing takeoff.

  That burden has not been met.
- Therefore the reset default is **REMOVE**.

### D23 — Stage 15 Confidence

- **Decision:** REMOVE Stage 15 `confidence` / `coordinateFramingConfidence` as a production stage in the minimum reset architecture.
- Do not preserve `ConfidenceEvaluation` as a required production artifact.
- Do not design a replacement confidence subsystem during teardown.
- Do not preserve the current confidence system under another generalized name such as trust, certainty, quality, reliability, takeoff health, or similar merely to retain its existing behavior.
- The Stage 15 audit establishes that confidence is observational relative to material calculation.

  Stage 15 runs after Stage 14.

  It does not consume Stage 14 materials.

  It does not feed back into Stage 14.

  It does not change:

  - material existence;
  - material quantity;
  - unit;
  - size/specification;
  - material identity;
  - grouping;
  - deduplication;
  - waste;
  - calculation path;
  - assumption selection.
- Stage 15 does not participate in:

  FACT
  → DERIVE
  → ASSUME
  → NOT DETERMINABLE.

  Those decisions have already occurred before Stage 15 runs.
- Stage 15 does not:

  - read plans;
  - discover construction;
  - resolve construction relationships;
  - derive dimensions;
  - derive material quantities;
  - invoke governed assumptions;
  - calculate materials;
  - supply missing calculator inputs;
  - detect missing calculator families;
  - detect Material Taxonomy gaps;
  - measure takeoff completeness.
- The current `ConfidenceEvaluation` system primarily summarizes existing software state into categorical labels.

  Its inputs include:

  - resolution trace methods;
  - Evidence ID presence;
  - validation results/issues;
  - review items;
  - resolver completion metadata;
  - object-type quantity-impact tiers;
  - pipeline fixture/live mode.
- Current confidence therefore represents a mixture of:

  - partial plan-reading / interpretation signals;
  - resolution lifecycle state;
  - validation state;
  - review/blocking state;
  - software completion metadata.

  It is not a direct measure of framing-takeoff correctness or completeness.
- The current takeoff `completion.percentage` must not be preserved as a takeoff-completeness metric.

  It is calculated from average resolved-object completion.

  It does not measure whether the required framing material families have been accounted for.
- Beckstead demonstrates this distinction.

  Frozen M.4 contains:

  - 52 wall material lines;
  - zero opening material;
  - zero structural-member material;
  - zero sheathing material;
  - zero floor-framing material;
  - zero roof-framing material.

  Stage 15 nevertheless produces object confidence evaluations and a takeoff completion percentage.

  It does not identify missing material families or missing calculator capability.
- Therefore current Stage 15 confidence must not be interpreted or preserved as "confidence in the completeness/correctness of the framing takeoff."
- Do not preserve the current three-dimension confidence rollup merely because it is deterministic and test-covered:

  - evidence confidence;
  - resolution confidence;
  - validation confidence;
  - overallLabel.
- Do not preserve the current trace-method → confidence-band mapping merely because it exists.
- Do not preserve `quantityImpactWeight` / high-impact blocked propagation as part of a replacement confidence architecture merely because Stage 15 currently uses it.
- Do not preserve takeoff-level `blocked` propagation from Stage 15 merely because it currently summarizes Stage 13 review/blocking state.
- Review remains a separate concern.

  If human verification is genuinely required, that requirement does not need to pass through a confidence subsystem to exist.
- Governed assumptions remain a separate concern.

  Stage 15 does not currently score Stage 14 assumption objects and does not determine whether an assumption may be used.
- Developer observability remains a separate concern.

  Removing Stage 15 from production does not prohibit later developer diagnostics when a concrete debugging need exists.

  Do not preserve the current confidence subsystem preemptively for that possibility.
- The current Stage 16 dependency on Stage 15 does not justify preserving Stage 15.

  The audit establishes that Stage 16:

  - consumes Stage 14 materials directly;
  - passes those materials through unchanged;
  - requires Stage 15 only for current confidence/summary schema fields and companion observability state.
- Stage 16 currently throws when the takeoff confidence evaluation is absent.

  Treat this as a current wiring/schema dependency to remove during the reset, not evidence that confidence is a required production capability.
- The current Stage 16 fields that depend on Stage 15 receive no preservation preference merely because the current report schema requires them, including:

  - `confidenceEvaluationId`;
  - `summary.confidenceLabel`;
  - Stage-15-derived `summary.completion`;
  - Stage-15-derived `summary.reviewStatus`;
  - Stage-15-derived `summary.blockingStatus`.
- Whether any simple contractor-facing review/status/completeness information belongs in the eventual output will be determined from concrete product requirements, not inherited from Stage 15.
- The definitive Material Taxonomy will eventually provide the product's material-accounting target.

  Do not substitute Stage 15 object completion or confidence scoring for Material Taxonomy accounting.
- Factory-reset burden of proof applies:

  Stage 15 does not survive because removing it causes current Stage 16 schema or wiring failures.

  It survives only if it performs a concrete necessary job for producing an accurate, complete framing material takeoff.

  The Stage 15 factual audit does not establish such a necessary production job.
- If the simplified pipeline later exposes a concrete need for an uncertainty, trust, review, diagnostic, or status signal that the old Stage 15 happened to provide, recover only the smallest capability necessary to solve that demonstrated problem.

  Do not restore Stage 15 or a generalized confidence architecture merely because the old engine had one.
- Therefore the reset default for Stage 15 is **REMOVE**.
- Do not implement the reset in this decision.
- Do not redesign review, assumptions, diagnostics, reporting, confidence, or Material Taxonomy here.

### D24 — Stage 16 Report / Final Output

- **Decision:** Current Stage 16 `report` is NOT preserved as a separate production stage.

  The product absolutely requires a final contractor-facing takeoff output, but the current Stage 16 implementation is not that enduring architecture.

  The permanent North Star remains:

  UPLOAD PDF
  → READ THE PLANS
  → CALCULATE / DERIVE / ASSUME
  → MATERIAL TAXONOMY OUTPUT

  The final box — MATERIAL TAXONOMY OUTPUT — is the legitimate production responsibility.

  Current Stage 16 is primarily packaging around outputs and lifecycle machinery from the old 16-stage architecture.

#### Factual basis

The Stage 16 audit established:

- Stage 16 performs no material transformation.
- It assigns `materials: calculations.materials` directly.
- It does not map, filter, sort, merge, aggregate, deduplicate, convert, round, apply waste, choose stock lengths, or otherwise modify material lines.
- Beckstead M.4 proves 52 Stage 14 material lines become 52 Stage 16 material lines with identical order and content.
- Stage 16 does not calculate materials.
- Stage 16 does not derive missing construction inputs.
- Stage 16 does not invoke assumptions.
- Stage 16 does not detect missing calculator capability.
- Stage 16 does not enforce Material Taxonomy completeness.
- Stage 16 does not derive NOT APPLICABLE.
- Stage 16 does not derive NOT DETERMINABLE.
- Stage 16 does not convert calculated construction quantities into purchase/order quantities.
- Stage 16 does not optimize stock lengths or apply waste.
- Stage 16 does not aggregate equivalent material lines.
- Stage 16 does not produce purchase-ready sheets/pieces.
- Stage 16 does not recover missing domains.
- Stage 16 does not improve plan interpretation.

Therefore the existence of current Stage 16 is not evidence that its current schema, orchestration, dependencies, or lifecycle should survive the reset.

#### 1. Final output is preserved; current Stage 16 is not

Preserve the PRODUCT REQUIREMENT:

The engine must produce a final accurate, complete, contractor-usable framing material takeoff.

Do NOT preserve the current Stage 16 `report` stage merely because it is the current terminal pipeline stage.

Do NOT preserve:

- the current `final-framing-takeoff` envelope merely for compatibility;
- the current Stage 16 orchestration;
- the current requirement that Stage 16 consume Stages 7–15;
- the current object-inventory summary;
- the current report schema merely because UI/tests/CLI consume it;
- the current `reportPath` contract merely because existing tooling expects it.

Those are implementation details of the old pipeline.

The reset may establish a new terminal output contract appropriate to MATERIAL TAXONOMY OUTPUT.

Do not design that replacement in D24.

#### 2. Materials do not need a second packaging stage to become real

Current Stage 16 does not make calculated materials more valid, authoritative, complete, or usable for calculation.

Stage 14 material content can factually exist without Stage 16.

Therefore:

Calculated material must not require passage through a separate report stage merely to become production-valid.

The future output boundary may consume calculated/derived/assumed material requirements directly.

Do not preserve a calculation → report lifecycle solely because the old pipeline had one.

This does NOT mean the eventual final takeoff is simply the current Stage 14 `materials[]`.

The contractor-provided Material Taxonomy and preferred output format define the future product target.

Current Stage 14 material lines are only existing calculator capability to carry into the reset where useful.

#### 3. Material Taxonomy output is the future completeness boundary

The definitive contractor-provided Complete House Framing Materials Checklist and preferred Recommended Lumber Takeoff Format are the locked product target.

They are not the current repository's `knowledge/framing/09-material-taxonomy.md`.

The existing repository taxonomy is an engine classification document and is not the definitive contractor taxonomy.

Do NOT merge, reinterpret, expand, research, or modify the contractor-provided taxonomy during the reset unless explicitly instructed later.

The future final output must ultimately express the house through that definitive contractor taxonomy/output target.

The taxonomy does not decide what exists.

The house decides what exists.

The taxonomy is:

- the final answer vocabulary;
- the completeness/accounting checklist;
- the contractor-facing output structure.

It is NOT:

- a material existence authority;
- a candidacy engine;
- an applicability permission layer;
- an Evidence authority system;
- a claim lifecycle;
- a replacement resolver.

The intended completeness principle remains:

Every relevant taxonomy entry has been accounted for.

Expected eventual taxonomy outcomes include:

- CALCULATED;
- NOT APPLICABLE;
- NOT DETERMINABLE.

Do not implement or finalize their schema/lifecycle in D24.

#### 4. Orderable takeoff output is a real product requirement

The Stage 16 audit proved current output is primarily calculated construction quantity, not orderable material.

Examples:

- plate may remain linear feet rather than stock pieces;
- studs may have count without required stock length;
- I-joists may have count and LF separately rather than count × exact length;
- sheathing may remain square feet rather than sheets;
- trusses are not formatted per truss layout;
- hardware is not emitted as contractor/orderable model + quantity.

These are genuine product-output gaps.

They are NOT reasons to preserve Stage 16.

They are future MATERIAL TAXONOMY OUTPUT and/or domain calculation capability work.

Do NOT implement that work during teardown.

After the minimum reset pipeline runs end-to-end, the definitive contractor taxonomy/output target will guide this work.

#### 5. Remove Stage 15 dependency

D23 removed Stage 15 Confidence from the minimum production architecture.

Current Stage 16 throws without a takeoff ConfidenceEvaluation.

That is a schema/wiring dependency, not a material requirement.

Do NOT preserve:

- required takeoff ConfidenceEvaluation;
- `confidenceEvaluationId`;
- `summary.confidenceLabel`;
- Stage 15 `summary.completion`;
- Stage 15 `summary.reviewStatus`;
- Stage 15 `summary.blockingStatus`;
- companion confidence-evaluation counts;

as requirements of final material output.

Their removal must not prevent otherwise-calculated materials from reaching the final takeoff.

#### 6. Remove pending-claim dependency

The prior reset decision removing PendingMaterialClaim / pendingClaims remains controlling.

Current Stage 16 merely passes `pendingClaims` through and counts them.

Removing them causes no calculated material loss.

Therefore do NOT preserve:

- `pendingClaims` on final output;
- `summary.pendingClaimCount`;
- pending material rows;
- `UNSUPPORTED_CAPABILITY` pending rows;
- pending claim UI behavior;
- claim lifecycle state used only for pending output.

Do NOT design a replacement pending-material lifecycle.

If a future concrete product failure demonstrates a missing capability, solve that concrete failure with the smallest appropriate mechanism.

#### 7. Remove claim-lifecycle output requirements

Current Stage 16 passes through old lifecycle metadata without using it to calculate materials.

Do NOT preserve as final-output requirements solely because current report contains them:

- `claimStatus`;
- candidacy state;
- Evidence authority;
- binding state;
- eligibility state;
- canonical identity tokens;
- resolution state;
- quantity claim lifecycle.

If a field later proves independently useful to the contractor or calculator, it may exist for that concrete purpose.

It must not survive merely as inherited lifecycle metadata.

#### 8. Review remains separate from material existence

Human review remains legitimate.

But current Stage 16 does not contain the useful review itself. It contains mostly:

- `reviewItemIds`;
- `validationIssueIds`;
- counts;
- Stage 15-derived rollups.

The UI reconstructs actual review information from other artifacts.

Do NOT preserve Stage 16's review/validation ID arrays as required final takeoff structure merely for compatibility.

The locked review principle remains:

"We completed the takeoff using the best governed information available. Please verify this input."

Review normally coexists with calculated material.

Review does not make material pending.

Review does not make otherwise-calculable material nonexistent.

Review does not require the old Stage 13 → Stage 14 → Stage 15 → Stage 16 lifecycle.

Do NOT redesign the review system in D24.

#### 9. Assumption disclosure is legitimate; current ID-only packaging is not sacred

Current Stage 16 does not copy Stage 14 assumption objects.

It only may expose `assumptionIds` on material lines and requires external joins/UI reconstruction to explain the assumption.

The useful PRODUCT requirement is not preservation of those IDs.

The useful requirement is:

When a governed assumption materially affects a takeoff result and human verification is appropriate, the user must be able to understand what input was assumed and verify/edit it.

Preserve that requirement.

Do NOT preserve:

- exact `assumptionIds` representation;
- current Stage 14 → Stage 16 join mechanics;
- current claim status representation;
- current review reconstruction path;

unless later implementation proves one is the simplest mechanism.

FACT → DERIVE → ASSUME → NOT DETERMINABLE remains controlling.

#### 10. Domain object inventories are not takeoff completeness

Current Stage 16 reports counts/IDs for walls, openings, structural members, floor systems/areas, roof systems/planes, and sheathing systems/areas.

Beckstead proves these counts do not establish material completeness:

- openings can exist with zero opening materials;
- structural members can exist with zero structural materials;
- floor systems/areas can exist with zero floor materials;
- roof systems/planes can exist with zero roof materials;
- sheathing systems can exist with zero sheathing materials.

Therefore do NOT preserve domain object inventories or object counts as the definition of takeoff completeness.

The future completeness boundary is the definitive contractor Material Taxonomy applied to the actual house.

#### 11. Remove misleading current report status

Current Stage 16 hardcodes:

`status: "completed"`

even when its own summary says the takeoff is blocked/review-required.

Do NOT preserve this status behavior.

Do NOT design a new generalized run-status lifecycle during teardown.

The important production question is whether the engine produced the appropriate taxonomy-accounted takeoff and what, if anything, genuinely requires verification or is NOT DETERMINABLE.

#### 12. Developer observability stays outside product authority

Current Stage 16 builds:

`framing-package-product-state`

This contains useful developer funnel/diagnostic information such as package counts and `firstBrokenHandoff`.

It does not affect the takeoff.

It also contains misleadingly named fields such as `confidence`, which is a count of confidence evaluations rather than confidence quality.

Do NOT preserve the companion artifact as required production architecture.

Developer observability may survive outside the production authority path if it remains useful during/after reset.

Its absence must not prevent calculation or final output.

Do NOT redesign observability in D24.

#### 13. Provenance / internal IDs are not contractor output requirements

Current final material rows expose internal fields such as:

- deterministic material IDs;
- quantity keys;
- canonical classification tokens;
- source object IDs;
- assumption IDs;
- review item IDs.

Stage 16 does not provide direct plan-page/formula/source explanation; most traceability is ID-indirected into other artifacts.

Do NOT preserve these fields as contractor-facing output requirements merely because they currently exist.

Internal identifiers are allowed where they are the simplest software implementation.

They are not material authority.

They are not takeoff completeness.

They are not contractor value by themselves.

Developer provenance/debug traceability may remain outside the contractor takeoff when useful.

#### 14. Preserve existing material calculation capability through D21, not D24

D21 controls what proven Stage 14 calculator capability survives the reset.

D24 does NOT redefine calculator preservation.

Do not infer from removal of Stage 16 that existing useful formulas should be removed.

Likewise, do not infer that current Stage 14 output schema is the permanent final takeoff schema.

The reset should preserve useful construction/takeoff math while allowing its output representation to simplify around the new architecture.

#### 15. Current UI / CLI / test breakage is not proof Stage 16 must survive

Removing current Stage 16 will break:

- `reportPath`;
- `finalFramingTakeoffArtifactSchema` consumers;
- current UI loading;
- audit tooling;
- benchmark scripts;
- tests expecting `16-report.json`;
- PipelineRunner's current terminal artifact contract;
- in-run companion generation.

Under the Factory Reset Standard, these are not preservation arguments.

Adapt or replace them only as necessary for the minimum reset architecture.

Do NOT keep Stage 16 merely to keep the current 16-stage pipeline green.

Git, frozen artifacts, factual findings, tests, and the reset decision log are the recovery path.

#### 16. Reset scope

During teardown/reset:

REMOVE current Stage 16 as a required separate production stage.

Do NOT simultaneously build the full contractor Material Taxonomy output system.

Do NOT implement stock optimization.

Do NOT implement new missing material families.

Do NOT implement new roof/truss capability.

Do NOT implement new sheathing conversion.

Do NOT implement new hardware capability.

Do NOT redesign review.

Do NOT redesign observability.

Do NOT research or modify the definitive contractor taxonomy.

First establish the minimum production pipeline:

UPLOAD PDF
→ READ THE PLANS
→ CALCULATE / DERIVE / ASSUME
→ MATERIAL TAXONOMY OUTPUT

During the initial reset implementation, the terminal output may be a minimal temporary representation sufficient to run the existing preserved calculator capability end-to-end.

That temporary representation is NOT the final contractor output design and must not be mistaken for the definitive Material Taxonomy implementation.

Then run the full Beckstead takeoff.

Let that simplified run expose the honest remaining product/domain gaps.

#### 17. Recovery standard

If removing current Stage 16 later reveals a concrete capability that the simplified engine genuinely needs:

- identify the exact lost capability;
- recover the smallest mechanism that solves it;
- place it in the natural North Star box;
- do not restore Stage 16 wholesale;
- do not restore old confidence/pending/claim/authority machinery merely because it was formerly bundled there.

The burden of proof remains:

Code does not stay because removing it might break the current engine.

Code stays because we can explain exactly how it helps the simple pipeline produce a more accurate, complete, contractor-usable framing takeoff.

#### 18. D24 bottom line

Stage 16 as currently implemented is old-pipeline packaging, not the enduring final-output architecture.

REMOVE it as a separate required production stage.

Preserve the requirement for a final contractor-facing takeoff.

The future final-output responsibility belongs to MATERIAL TAXONOMY OUTPUT.

That output will ultimately be governed by the definitive contractor-provided framing Material Taxonomy and preferred takeoff format.

Do not implement that final system during teardown.

Reset first.

Run the simplified full takeoff.

Then use the actual failures plus the locked contractor taxonomy to build the missing calculation and final-output capability deliberately.
