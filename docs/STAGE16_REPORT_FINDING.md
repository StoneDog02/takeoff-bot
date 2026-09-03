# Stage 16 Report / Final Output — Factual Finding

**Scope:** Current Stage 16 `report` stage and all downstream consumers of `final-framing-takeoff`.  
**Governing question:** What does current Stage 16 actually do, what does it add or transform, what old-pipeline machinery does it depend on, and what would be lost if it disappeared?  
**Authority:** Code, tests, schemas, and frozen Beckstead M.4 artifacts only. No KEEP/REMOVE recommendations. No replacement design. No Material Taxonomy implementation.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) (order 16)
- Report schema: [`framing-takeoff.schema.ts`](../src/scopes/framing/schemas/framing-takeoff.schema.ts)
- Material line schema: [`material.schema.ts`](../src/scopes/framing/schemas/material.schema.ts)
- Companion builder: [`buildFramingPackageProductState.ts`](../src/scopes/framing/observability/buildFramingPackageProductState.ts)
- UI consumers: [`loadFramingRunState.ts`](../src/ui/loadFramingRunState.ts), [`framingTakeoffService.ts`](../src/ui/framingTakeoffService.ts), [`public/app.js`](../public/app.js)
- Beckstead artifact: `artifacts/b2.2m.4/runs/beckstead-audit-b/framing/16-report.json`

---

## 1. Stage 16 wiring

### Pipeline position

```
Stages 7–12   resolved domain objects (ID lists only)
Stage 13      validation (review + issue ID lists)
Stage 14      calculations (materials, pendingClaims)  ← materials passed through
Stage 15      confidence (takeoff evaluation required)   ← summary labels
Stage 6       extractedEvidence (companion only)
        ↓
Stage 16      final-framing-takeoff + companion framing-package-product-state
        ↓
CLI / UI / audit scripts (no further pipeline stage)
```

Stage 16 is the **terminal pipeline stage**. No later stage transforms the takeoff artifact. Downstream systems read `16-report.json` (or in-memory equivalent) directly or load companion artifacts from the same run directory.

### Inputs consumed

| Input | Source stage/artifact | Fields consumed | Why consumed | Effect on report |
|---|---|---|---|---|
| `wallFraming` | Stage 7 | `walls[].id`, `segments[].id` | Inventory | `wallIds`, `wallSegmentIds`, `summary.wallCount`, `summary.wallSegmentCount` |
| `openings` | Stage 8 | `openings[].id` | Inventory | `openingIds`, `summary.openingCount` |
| `structuralMembers` | Stage 9 | `structuralMembers[].id` | Inventory | `structuralMemberIds`, `summary.structuralMemberCount` |
| `floorFraming` | Stage 11 | `systems[].id`, `areas[].id` | Inventory | `floorFramingSystemIds`, `floorFramingAreaIds`, summary counts |
| `roofFraming` | Stage 12 | `systems[].id`, `planes[].id` | Inventory | `roofFramingSystemIds`, `roofPlaneIds`, summary counts |
| `sheathing` | Stage 10 | `systems[].id`, `areas[].id` | Inventory | `sheathingSystemIds`, `sheathingAreaIds`, summary counts |
| `calculations` | Stage 14 | `materials`, `pendingClaims` | Takeoff body | `materials` (verbatim), `pendingClaims` (verbatim), `summary.materialLineItemCount`, `summary.pendingClaimCount` |
| `validation` | Stage 13 | `reviewItems[].id`, `validationIssues[].id` | Cross-reference | `reviewItemIds`, `validationIssueIds`, `summary.reviewItemCount`, `summary.validationIssueCount` |
| `confidence` | Stage 15 | takeoff `ConfidenceEvaluation` | Summary status | `confidenceEvaluationId`, `summary.completion`, `summary.confidenceLabel`, `summary.reviewStatus`, `summary.blockingStatus` |
| `extractedEvidence` | Stage 6 | full `evidence[]` | Companion only | Passed to `buildFramingPackageProductState` — **not** in primary report |
| `context.projectId`, `context.useMockAi` | Pipeline context | project id, mock flag | Metadata | `projectId`, `executionMode` |

### Inputs NOT consumed

| Input | Notes |
|---|---|
| Stage 14 `assumptions[]` | **Not copied** to report |
| Evidence content (primary report) | Only used in companion builder |
| Resolved object fields (dimensions, traces) | Not embedded — only object IDs |
| Material calculator metadata | Not read |
| Review item / validation issue **objects** | IDs only, not embedded |
| Confidence object evaluations (per-object) | Only takeoff-level evaluation used |

### Outputs produced

**Primary artifact:** `16-report.json` — envelope `artifactType: "final-framing-takeoff"`, payload `FramingTakeoff` (`framingTakeoffSchema`).

**Companion artifact:** `16-report.package-product-state.json` — envelope `artifactType: "framing-package-product-state"`, payload `FramingPackageProductState`. Published via `context.stageSideEffects.publishCompanionArtifact`. **Not present** in frozen Beckstead M.4 run (companion added in later waves).

**Hardcoded report fields (not derived from upstream state):**

```typescript
status: "completed"           // always, regardless of blocking/review
scopeName: "framing"
```

Schema allows `status: "completed-with-review" | "blocked" | "failed"` but Stage 16 **never sets** those values.

### Downstream consumers

| Consumer | Uses |
|---|---|
| **CLI** (`src/app.ts`) | Prints `result.reportPath` |
| **PipelineRunner** | Sets `reportPath` on `PipelineRunResult` |
| **UI** (`loadFramingRunState`, `framingTakeoffService`) | `takeoff` from report; separately loads validation + calculations for review workspace |
| **Audit** (`collectFramingAuditMetrics`, `runFramingTakeoffAudit`) | Report payload for material output summary |
| **Benchmark scripts** | Frozen `16-report.json` comparisons |
| **Tests** | `finalFramingTakeoffArtifactSchema.parse` across pipeline tests |

---

## 2. Material flow — most important section

### Verdict: Stage 14 materials pass through unchanged

Stage 16 assigns:

```typescript
materials: calculations.materials,
```

There is **no** `.map()`, filter, sort, merge, or copy-with-mutation on the materials array in Stage 16 code.

### Proof

**Code** (`createFramingStages.ts` order 16): direct reference to `calculations.materials`.

**Beckstead M.4 frozen run:**

| Check | Result |
|---|---|
| Stage 14 material count | 52 |
| Stage 16 material count | 52 |
| Byte-identical per line (order + content) | **true** |
| Same material ID set | **true** |

**Tests** (`framing.pipeline.test.ts`): asserts exact `id`, `quantity`, `unit` on report materials match calculator output.

### Transformation inventory

| Operation | Stage 16 implements? | Where |
|---|---|---|
| Pass through unchanged | **Yes** | `materials: calculations.materials` |
| Filter materials | **No** | — |
| Suppress materials | **No** | (Stage 14 already suppressed) |
| Add materials | **No** | — |
| Merge equivalent materials | **No** | Stage 14 coordinator explicitly does not merge |
| Deduplicate | **No** | — |
| Aggregate quantities | **No** | — |
| Convert units | **No** | — |
| Round quantities | **No** | — |
| Apply waste | **No** | — |
| LF → pieces | **No** | — |
| SF → sheets | **No** | — |
| Choose stock lengths | **No** | — |
| Group by type/size/length | **No** | — |
| Sort materials | **No** | Order is Stage 14 calculator order (segment ID sort in wall calc) |
| Rename descriptions | **No** | — |
| Convert internal keys to contractor language | **No** | — |
| Modify specifications | **No** | — |
| Change `claimStatus` | **No** | Set in Stage 14 `calculation-coordinator` |
| Change quantity | **No** | — |

**All material transformation occurs in Stage 14 calculators**, not Stage 16.

---

## 3. Exact material-line schema

Stage 16 exposes `FramingMaterialLineItem` (`framingMaterialLineItemSchema`) unchanged from Stage 14.

| Field | Meaning | Producer | Stage 16 behavior | Contractor-facing or internal | Required |
|---|---|---|---|---|---|
| `id` | Deterministic line ID (`MAT-{quantityKey}-object-{objectId}`) | Stage 14 `createMaterialLineItemId` | Pass-through | **Internal** (exposed in UI) | Yes |
| `quantityKey` | Calculator quantity slot (e.g. `wall.studs`) | Stage 14 calculator | Pass-through | Internal | Optional |
| `claimStatus` | Material claim ladder state | Stage 14 `deriveMaterialClaimStatus` / opening calc | Pass-through | Semi-facing (UI column) | Optional |
| `category` | Taxonomy category enum (`lumber`, `structural-panel`, etc.) | Stage 14 calculator | Pass-through | Internal classification | Yes |
| `description` | Human-readable line text | Stage 14 calculator template | Pass-through | **Contractor-facing** (primary display) | Yes |
| `canonicalClassification` | Normalized classification token | Stage 14 calculator | Pass-through | Internal | Yes |
| `quantity` | Numeric quantity | Stage 14 calculator | Pass-through | **Contractor-facing** | Yes |
| `unit` | `each`, `linear-foot`, `square-foot`, `sheet`, etc. | Stage 14 calculator | Pass-through | **Contractor-facing** | Yes |
| `sourceObjectIds` | Resolved object IDs used in calculation | Stage 14 `collectLineItemProvenance` | Pass-through | **Internal** (exposed in UI) | Yes |
| `assumptionIds` | Linked assumption record IDs | Stage 14 provenance / opening assumptions | Pass-through | Internal IDs only | Default `[]` |
| `reviewItemIds` | Linked review item IDs | Stage 14 provenance | Pass-through | Internal IDs only | Default `[]` |

**Not present on material line:** plan page, dimension text, formula, Evidence ID, stud length, stock length, sheet count, hardware model, confidence score, grouping/category rollup fields.

### Schema classification

**A. Calculated construction quantity** — yes, primarily. Lines represent calculator outputs (stud count, plate LF, joist count, sheathing SF).

**B. Orderable material** — **no**. No piece lengths, stock breakdown, sheet counts, or SKU-level identity.

**Answer: A, not B.** Stage 16 does not bridge to orderable materials.

---

## 4. Report summary

| Field | Source | Formula / rule | Product meaning | Affects materials? |
|---|---|---|---|---|
| `wallCount` | Stage 7 | `walls.length` | Resolved wall object count | **No** |
| `wallSegmentCount` | Stage 7 | `segments.length` | Resolved segment count | **No** |
| `openingCount` | Stage 8 | `openings.length` | Opening object count | **No** |
| `structuralMemberCount` | Stage 9 | members.length | SM object count | **No** |
| `floorFramingSystemCount` | Stage 11 | systems.length | Floor system count | **No** |
| `floorFramingAreaCount` | Stage 11 | areas.length | Floor area count | **No** |
| `roofFramingSystemCount` | Stage 12 | systems.length | Roof system count | **No** |
| `roofPlaneCount` | Stage 12 | planes.length | Roof plane count | **No** |
| `sheathingSystemCount` | Stage 10 | systems.length | Sheathing system count | **No** |
| `sheathingAreaCount` | Stage 10 | areas.length | Sheathing area count | **No** |
| `blockingCount` | Schema default | **Not set by Stage 16** → 0 | Blocking object count | **No** |
| `connectorCount` | Schema default | **Not set** → 0 | Connector count | **No** |
| `hardwareCount` | Schema default | **Not set** → 0 | Hardware count | **No** |
| `fastenerCount` | Schema default | **Not set** → 0 | Fastener count | **No** |
| `materialLineItemCount` | Stage 14 | `calculations.materials.length` | Emitted line count | **No** (count only) |
| `pendingClaimCount` | Stage 14 | `pendingClaims?.length ?? 0` | Pending claim rows | **No** |
| `reviewItemCount` | Stage 13 | `reviewItems.length` | Review item count | **No** |
| `validationIssueCount` | Stage 13 | `validationIssues.length` | Validation issue count | **No** |
| `completion` | Stage 15 takeoff eval | Copied from confidence | Object-completion average | **No** |
| `confidenceLabel` | Stage 15 takeoff eval | `overallLabel` | Categorical takeoff trust | **No** |
| `reviewStatus` | Stage 15 takeoff eval | Copied | Review rollup | **No** |
| `blockingStatus` | Stage 15 takeoff eval | Copied | Blocking rollup | **No** |

**D23 note:** `completion`, `confidenceLabel`, `reviewStatus`, `blockingStatus` are **Stage 15-derived** and copied into summary. They do not gate or alter materials.

**Top-level `status`:** Always `"completed"` in Stage 16 — **does not reflect** `blockingStatus: blocked` or 480 review items on Beckstead.

---

## 5. Stage 13 / review dependency

| Question | Answer |
|---|---|
| Review items embedded? | **No** — `reviewItemIds[]` only |
| Validation issues embedded? | **No** — `validationIssueIds[]` only |
| Validation affects material inclusion? | **No** in Stage 16 (already applied in Stage 14 via `isQuantityBlocked`) |
| Blocking prevents report generation? | **No** — report always emitted with `status: "completed"` |
| Blocked takeoff contains calculated materials? | **Yes** — Beckstead: 52 materials with `blockingStatus: blocked` |
| Report-level review status changes materials? | **No** |
| Representation-only validation visible? | **Indirectly** — IDs reference Stage 13 artifact; contractor must resolve IDs externally |

### Contractor verification vs lifecycle information

| Type | In report artifact | How accessed |
|---|---|---|
| **Contractor verification** | Review item IDs, validation issue IDs | UI loads Stage 13 artifact and builds `reviewWorkspace` with titles, descriptions, property values, assumption linkage |
| **Lifecycle bookkeeping** | Object ID inventories, confidence ID, 480-issue count | Summary/metadata only |

**Review workspace is NOT part of the report artifact.** UI reconstructs it from Stage 13 + Stage 14 at load time (`projectFramingReviewWorkspace`).

---

## 6. Stage 15 dependency (post-D23)

| Dependency | Classification |
|---|---|
| Required takeoff `ConfidenceEvaluation` (throws if missing) | **B** schema/wiring |
| `confidenceEvaluationId` on report | **B** schema/wiring + **C** product-visible metadata |
| `summary.confidenceLabel` | **C** product-visible metadata (D23: not required production architecture) |
| `summary.completion` | **C** product-visible metadata |
| `summary.reviewStatus` | **C** — duplicates review rollup also available from Stage 13 |
| `summary.blockingStatus` | **C** — duplicates review rollup |
| Companion `confidence` column (evaluation **count**) | **D** developer/debug — misleading name per Stage 15 audit |

**None are required to produce materials** (**A**). Materials come solely from Stage 14.

---

## 7. Assumptions

| Path | In Stage 16 report? |
|---|---|
| Stage 14 `assumptions[]` objects | **No** — not copied |
| `assumptionIds` on material lines | **Yes** — pass-through from Stage 14 |
| Assumption descriptions / `reasonUsed` | **No** |
| `summary` assumption count | **No** (companion has `assumptions.count` from Stage 14) |
| Review items from assumptions | IDs only on material lines; full text via Stage 13 + review workspace |

### Can a contractor tell "we used a governed assumption; verify X" from the report artifact alone?

**Partially, only when opening materials exist with assumptions:**

- Material line may have `claimStatus: "CALCULATED_WITH_ASSUMPTION"` (Stage 14 sets on opening assumption lines).
- Material line may have non-empty `assumptionIds`.
- UI infers `CALCULATED_WITH_ASSUMPTION` when `assumptionIds.length > 0` even without `claimStatus` (`public/app.js` `formatClaimStatus`).

**But the report does not include assumption text.** A contractor reading raw JSON sees IDs only. Assumption explanations require:

1. Joining `assumptionIds` → Stage 14 `assumptions[]` artifact (not in report), or
2. UI review workspace (`valueSource: "industry-default-assumption"`, `explanation` from `assumption.reasonUsed`).

**Beckstead M.4:** 0 materials with `assumptionIds`; 0 opening materials — **no assumption disclosure on emitted lines**.

---

## 8. Pending claim dependency (post-D22)

| Item | Stage 16 behavior |
|---|---|
| `pendingClaims` on report | `calculations.pendingClaims ?? []` — pass-through |
| `summary.pendingClaimCount` | `pendingClaims?.length ?? 0` |
| Pending material objects | Copied verbatim (no quantity) |
| `UNSUPPORTED_CAPABILITY` markers | In `pendingClaims` if Stage 14 collected them |
| Claim lifecycle status | On pending claim rows only |

**If `pendingClaims` absent from Stage 14:** report gets `[]`; no throw; materials unchanged.

**Beckstead M.4 frozen:** Stage 14 has no `pendingClaims` field; Stage 16 report has no `pendingClaims` key (artifact predates field; current code would emit `[]`).

**UI:** Renders `pendingClaims` rows in materials table with description and claim status, no quantity.

**D22 removal impact on Stage 16:** If Stage 14 stops emitting `pendingClaims`, Stage 16 copies empty array — **no material loss**, only pending-claim rows and `pendingClaimCount` disappear from report.

---

## 9. Claim / candidacy / authority dependency

| Field/concept | Produced | Stage 16 use | Changes materials? | Contractor need? |
|---|---|---|---|---|
| `claimStatus` on material line | Stage 14 | Pass-through | No | Optional UI column |
| `pendingClaims` | Stage 14 | Pass-through | No | UI shows blocked/unsupported rows |
| Candidacy / `admitMaterialClaimCandidate` | Stage 14 | Indirect via pendingClaims | No | No |
| Evidence authority | Stage 6 objects | **Not read** | No | No |
| Binding / eligibility | Resolvers | **Not read** | No | No |
| Canonical identity (`canonicalClassification`) | Stage 14 | Pass-through | No | Internal |
| Confidence | Stage 15 | Summary + ID only | No | Metadata |
| Completion | Stage 15 | Summary only | No | Metadata |
| Resolution state | Stages 7–12 | Object ID lists only | No | No |

Stage 16 is a **packaging** layer for claim fields already set in Stage 14; it does not run claim logic.

---

## 10. Provenance / source traceability

| Trace target | In final material line? | Available elsewhere |
|---|---|---|
| Plan page | **No** | Evidence artifact, compiled pages |
| Plan region / dimension text | **No** | Evidence `candidateValue`, review workspace |
| Schedule / note | **No** | Evidence |
| Opening / wall / SM / floor / roof / sheathing object | **Partial** — `sourceObjectIds` only | Full objects in stage 7–12 artifacts |
| Evidence record | **No** | Stage 6 artifact |
| Assumption | **ID only** (`assumptionIds`) | Stage 14 `assumptions[]` |
| Calculation formula | **No** | Knowledge docs + calculator source |
| Resolution trace method | **No** | On resolved objects in stage artifacts |
| Review item | **ID only** (`reviewItemIds`) | Stage 13 artifact |

**Provenance is mostly lost or ID-indirected before contractor-facing output.** Stage 16 does not enrich traceability.

---

## 11. Calculated quantity vs orderable material

Current Stage 16 **does not** convert construction quantities to purchase/order quantities.

| Example | What Stage 16 outputs | Order conversion? |
|---|---|---|
| 986 LF plate | 26 lines × ~38 LF each, `unit: "linear-foot"`, description `"2x4 wall plates"` | **No** pieces, no stock lengths |
| 284 studs | 26 lines, `unit: "each"`, description `"2x4 regularly spaced studs at 16 in O.C."` | **No** stud length (8'/9'/etc.) |
| 527 LF I-joist (fixture tests) | Separate count line + LF line when member length resolved | **No** `31 × 17'` breakdown in report |
| Sheathing SF | `unit: "square-foot"`, description includes thickness/type | **No** sheet count |
| Hardware / connectors | Not emitted in Beckstead; fastener calc exists in Stage 14 | **No** model numbers in report schema |
| Truss / roof | Roof calculator emits count/LF when inputs resolve | **No** truss layout pieces |

All orderable-material behavior would require **new logic** (not present in Stage 16).

---

## 12. Contractor readability

| Aspect | Current behavior |
|---|---|
| Material names | Semi-readable calculator templates (`"2x4 regularly spaced studs at 16 in O.C."`) |
| Internal keys exposed? | `id`, `quantityKey`, `canonicalClassification` on every line |
| Object IDs exposed? | **Yes** — `sourceObjectIds` shown in UI materials table |
| Claim statuses exposed? | **Yes** — UI column (inferred `CONFIRMED` when absent) |
| Confidence IDs exposed? | `confidenceEvaluationId` on report; not on material lines |
| Grouped orderable rows? | **No** — one line per segment per quantity key |
| Exact sizes/lengths where known? | **Partial** — size in description (2x4) but not length for studs |
| Units appropriate for ordering? | **Mixed** — `each` without length; `linear-foot` without piece breakdown |
| Organization | Flat `materials[]` array — no domain grouping in artifact |
| Human-readable rendered report? | **UI HTML table** + CSV export in `app.js`; primary artifact is **JSON** |
| Lumberyard-ready without transformation? | **No** |

---

## 13. Definitive taxonomy / output target — gap inventory only

**The contractor-provided Complete House Framing Materials Checklist and Recommended Lumber Takeoff Format are not implemented in Stage 16** (not found in repository under those names).

`knowledge/framing/09-material-taxonomy.md` exists as an **engine classification document** ("not a purchasing catalog"). It is **not** wired into Stage 16 output or completeness checking.

| Question | Current Stage 16 |
|---|---|
| Outputs only what calculators emitted? | **Yes** |
| Expected-but-not-applicable taxonomy entries? | **No** |
| NOT DETERMINABLE taxonomy entries? | **No** |
| Detect unaccounted taxonomy entries? | **No** |
| Measure completeness against checklist? | **No** |
| Format dimensional lumber by length/type/qty? | **No** |
| Format I-joists by depth/length/count? | **No** |
| Format rim board by depth/LF? | **No** |
| Format engineered lumber W×D×L×count? | **No** |
| Format sheathing by thickness/sheets? | **No** (SF only when emitted) |
| Format trusses per layout? | **No** |
| Format hardware per structural plans? | **No** |

---

## 14. Beckstead Stage 16 trace (M.4 frozen)

| Metric | Value |
|---|---|
| Stage 14 materials | 52 |
| Stage 16 materials | 52 |
| All Stage 14 lines survive | **Yes**, identical |
| `status` | `completed` |
| `summary.confidenceLabel` | `blocked` |
| `summary.blockingStatus` | `blocked` |
| `summary.reviewStatus` | `review-required` |
| `summary.completion.percentage` | 36 |
| `reviewItemIds` | 480 |
| `validationIssueIds` | 480 |
| `confidenceEvaluationId` | `CE-framing-run-3b68b1e39b61` |
| Assumptions on materials | 0 lines with `assumptionIds` |
| `pendingClaims` on report | **Absent** (frozen artifact; field added later in schema) |
| Material grouping | None — flat array, segment order |
| Units | `each` (studs), `linear-foot` (plates) |

### Representative rows

**Wall studs (segment `WS-physical-run:p3:343b5ac7d6dc`):**

```json
{
  "id": "MAT-wall-studs-object-WS-physical-run:p3:343b5ac7d6dc",
  "category": "lumber",
  "description": "2x4 regularly spaced studs at 16 in O.C.",
  "canonicalClassification": "stud-2x4-regular-spacing",
  "quantity": 7,
  "unit": "each",
  "sourceObjectIds": ["physical-run:p3:343b5ac7d6dc", "WS-physical-run:p3:343b5ac7d6dc"]
}
```

**Wall plates (same segment):**

```json
{
  "id": "MAT-wall-plates-object-WS-physical-run:p3:343b5ac7d6dc",
  "description": "2x4 wall plates",
  "quantity": 20.4999,
  "unit": "linear-foot"
}
```

**Totals:** 284 studs, 986.0 LF plates across 26 emitting segments (42 segments resolved; 16 without materials).

### Absent domains

| Domain | Objects in summary | Materials in report | Stage 16 awareness |
|---|---|---|---|
| Openings | 57 | 0 | Object count only — **no absence signal** |
| Structural members | 11 | 0 | Object count only |
| Sheathing | 6 systems, 0 areas | 0 | Object count only |
| Floor | 3 systems, 8 areas | 0 | Object count only |
| Roof | 5 systems, 2 planes | 0 | Object count only |

Stage 16 **does not know** material families are missing — it reports `materials[]` as received and includes non-zero object counts for unresolved domains.

---

## 15. Counterfactual: minimum material report

If Stage 14 `materials[]` were serialized as the final output:

| Lost capability | Class |
|---|---|
| Material line transformation | **None** — Stage 16 does not transform |
| Object ID inventories (walls, openings, etc.) | **B** useful metadata |
| `reviewItemIds` / `validationIssueIds` cross-refs | **C** human-review pointers |
| Summary domain counts | **B** metadata |
| `confidenceEvaluationId` + summary confidence fields | **E** lifecycle metadata (D23) |
| `pendingClaims` pass-through | **E** — same as Stage 14, not added by Stage 16 |
| `status`, `executionMode`, `projectId` | **F** wiring/metadata |
| Companion `framing-package-product-state` | **D** developer observability |
| Schema validation as `final-framing-takeoff` | **F** wiring |

---

## 16. Product-state / companion outputs

**Builder:** `buildFramingPackageProductState` — called in Stage 16, persisted as companion artifact.

**Contents:** Per-package funnel rows (Walls, Openings, Floor, Structural, Sheathing, Roof, Blocking, Connectors, Hardware, Fasteners) with detected/evidence/materialized/resolved/calcEligible/stage16Lines counts; evidence totals; extraction intent pages; plan-reference queue stats; assumption count; review counts; `firstBrokenHandoff` diagnostic.

**Consumers:** UI package dashboard (`deriveProductPackageViewRows`), CSV export, wave closeout scripts, tests.

**Affects takeoff?** **No** — observability only.

### Misleadingly named fields (verified)

| Field | Actual meaning |
|---|---|
| `packages[].confidence` | **Count** of Stage 15 confidence evaluation records for that object type — **not** quality label |
| `packages[].stage16Lines` | Count of Stage 14 materials attributed to package via `sourceObjectIds` — **same count Stage 16 would have if it transformed** (it does not) |
| `stage16.materialLineCount` | Stage **14** `materials.length` |
| `productFunnel.stage16MaterialLines` | Same as stage14 lines for floor/structural funnels |

**M.4 frozen run:** No companion file on disk. UI shows limitation: "Package product-state companion artifact not found."

---

## 17. What Stage 16 does NOT do

Supported by code — Stage 16 does **not**:

- Calculate materials
- Derive missing construction inputs
- Invoke assumptions
- Detect missing calculator capability
- Enforce Material Taxonomy completeness
- Derive NOT APPLICABLE / NOT DETERMINABLE
- Convert calculated quantities to stock/order quantities
- Optimize stock lengths or apply waste
- Deduplicate or aggregate material lines
- Produce purchase-ready sheets/pieces
- Recover missing domains
- Improve plan interpretation
- Filter materials by confidence, review, or blocking status
- Embed review or validation detail (IDs only)
- Set `status` from blocking/review state

---

## 18. Legitimate reporting capability vs old-pipeline packaging

### TABLE A — Legitimate takeoff/report information

| Information/capability | Source | Stage 16 behavior | Product effect |
|---|---|---|---|
| Calculated material lines | Stage 14 | Verbatim `materials[]` | Primary takeoff payload |
| Descriptions, quantities, units | Stage 14 | Pass-through | UI materials table |
| `claimStatus` / `assumptionIds` on lines | Stage 14 | Pass-through | UI status column (partial assumption signal) |
| Pending non-quantity claims | Stage 14 | Pass-through `pendingClaims` | UI pending rows |
| Review/validation ID cross-refs | Stage 13 | ID arrays on report | Enables UI to load review detail |
| Domain object counts | Stages 7–12 | Summary counts | Context for what was resolved vs calculated |
| Material line count | Stage 14 | `summary.materialLineItemCount` | Header/summary display |

### TABLE B — Old-pipeline / software-lifecycle packaging

| Information/capability | Source | Stage 16 behavior | Product effect |
|---|---|---|---|
| `confidenceEvaluationId` | Stage 15 | Required field | Schema link to confidence artifact |
| `summary.confidenceLabel` | Stage 15 | Copied | Summary badge (blocked on Beckstead) |
| `summary.completion` | Stage 15 | Copied | 36% on Beckstead — object avg, not takeoff completeness |
| `summary.reviewStatus` / `blockingStatus` | Stage 15 | Copied | Summary status — does not gate materials |
| Object ID inventories | Stages 7–12 | Full ID arrays | Lifecycle inventory, not order list |
| `validationIssueIds` (480) | Stage 13 | ID list | Developer/review join key |
| `canonicalClassification` | Stage 14 | Pass-through | Internal taxonomy token |
| `sourceObjectIds` on lines | Stage 14 | Pass-through | Internal linkage |
| Companion package matrix | Stages 6–15 | Observability artifact | Developer funnel dashboard |
| `confidence` column in companion | Stage 15 | Evaluation count | Misleading diagnostic |
| `status: "completed"` always | Hardcoded | Ignores blocking | Misleading run status |

---

## 19. Bottom-line factual answers

### 1. What unique material/takeoff transformation does Stage 16 perform?

**None on material lines.** Stage 16 **assembles** a report envelope: copies Stage 14 materials and pending claims, attaches Stage 13 ID lists, Stage 7–12 object inventories, Stage 15 summary labels, and builds a developer companion matrix.

### 2. Does Stage 16 change any material quantity, specification, or existence?

**No.** Proven on Beckstead (52 identical lines) and by source code.

### 3. Does Stage 16 turn calculated quantities into orderable materials?

**No.**

### 4. Does Stage 16 aggregate/deduplicate equivalent material lines?

**No.**

### 5. Does Stage 16 know whether the framing takeoff is complete?

**No.** It reports object counts and material line count but does not compare against expected material families or detect missing calculators.

### 6. Does Stage 16 detect missing material families or missing calculator capability?

**No.** Companion `firstBrokenHandoff` is developer observability, not in the primary contractor report.

### 7. Does Stage 16 implement or check against a Material Taxonomy?

**No.** `canonicalClassification` on lines is a calculator token, not checklist enforcement.

### 8. What contractor-useful information does Stage 16 uniquely provide?

- Single artifact combining **material lines** + **domain object counts** + **review/validation ID indexes**
- `pendingClaims` rows (when Stage 14 emits them) in the same payload as materials
- UI/CLI **report path** as the conventional "final output" location

Most contractor-useful *line content* originates in Stage 14; Stage 16 **packages** it.

### 9. What human-review information does Stage 16 uniquely provide?

- `reviewItemIds` and `validationIssueIds` arrays (not embedded items)
- Summary `reviewItemCount`, `reviewStatus`, `blockingStatus`

Full review text is **not** in the report — UI rebuilds from Stage 13.

### 10. What developer/debug information does Stage 16 uniquely provide?

- Companion `framing-package-product-state` funnel matrix
- `confidenceEvaluationId` linkage
- Full object ID inventories per domain
- Hardcoded `executionMode`

### 11. What Stage 16 behavior depends solely on Stage 15 confidence?

- **Throws** without takeoff evaluation
- `confidenceEvaluationId`, `summary.confidenceLabel`, `summary.completion`, `summary.reviewStatus`, `summary.blockingStatus`
- Companion package `confidence` column counts

### 12. What Stage 16 behavior depends on pendingClaims / claim lifecycle?

- `pendingClaims` array and `summary.pendingClaimCount` — pass-through only
- UI pending-claim rows
- **No** effect on `materials[]`

### 13. What would concretely break if current Stage 16 disappeared?

- Pipeline `reportPath` unset / stage missing
- `finalFramingTakeoffArtifactSchema` consumers fail (UI, tests, audit, CLI)
- No single artifact combining materials + summary + ID cross-refs
- Companion product-state not generated in-run
- `PipelineRunner` terminal artifact contract broken

### 14. Wiring vs product capability loss

| Wiring/schema | Product capability |
|---|---|
| `final-framing-takeoff` envelope, `confidenceEvaluationId` required | Material lines (available from Stage 14) |
| Stage 15 throw dependency | Review IDs (available from Stage 13) |
| `reportPath` convention | Assumption text (Stage 14 assumptions artifact + review workspace) |
| Companion artifact path | Orderable material formatting (**never existed**) |

### 15. Could Stage 14 materials factually exist as a terminal output without Stage 16?

**Yes** for material content. Stage 14 `materials[]` is complete and identical. Terminal output would lack packaging, summary, ID cross-refs, and schema convention.

### 16. What genuinely useful reporting behavior would be lost if Stage 16 disappeared entirely?

### 17. Precise behaviors (no recommendation on survival)

1. **Single terminal artifact** joining materials, pending claims, review/validation ID indexes, and per-domain object inventories.
2. **Summary block** with material line count and domain object counts in one place.
3. **Stage 15 summary mirror** (`confidenceLabel`, `blockingStatus`, etc.) on the takeoff record.
4. **Companion package-product-state** generation for developer funnel/observability dashboards.
5. **Pipeline `reportPath` contract** used by CLI, UI, and audit tooling as the canonical run output pointer.

None of these alter calculated quantities. Items 1–2 are **aggregation/packaging** of data available in earlier stage artifacts. Items 3–4 are **lifecycle/observability** per D23. Item 5 is **wiring convention**.
