# Stage 15 Confidence — Factual Finding

**Scope:** Current Stage 15 `confidence` / `coordinateFramingConfidence` and all confidence evaluation code.  
**Governing questions:** What does Stage 15 do? Does it change materials? Does it participate in FACT/DERIVE/ASSUME? What breaks if it disappears?  
**Authority:** Code, tests, and frozen Beckstead M.4 artifacts only. No KEEP/REMOVE recommendations. No replacement design.

**Primary files:**
- Stage wiring: [`createFramingStages.ts`](../src/scopes/framing/stages/createFramingStages.ts) (order 15)
- Coordinator: [`confidence-coordinator.ts`](../src/scopes/framing/confidence/confidence-coordinator.ts)
- Object evaluation: [`evaluateObjectConfidence.ts`](../src/scopes/framing/confidence/evaluateObjectConfidence.ts)
- Takeoff evaluation: [`evaluateTakeoffConfidence.ts`](../src/scopes/framing/confidence/evaluateTakeoffConfidence.ts)
- Dimension rules: [`deriveDimensions.ts`](../src/scopes/framing/confidence/deriveDimensions.ts)
- Schema: [`confidence.schema.ts`](../src/core/schemas/confidence.schema.ts), [`status.schema.ts`](../src/core/schemas/status.schema.ts)
- Beckstead artifacts: `artifacts/b2.2m.4/runs/beckstead-audit-b/framing/15-confidence.json`, `16-report.json`

---

## 1. Stage 15 wiring

### Pipeline position

```
Stages 7–12  resolved domain objects
Stage 13     validation (issues, results, review items)
Stage 14     calculations (materials, assumptions, pendingClaims)  ← NOT read by Stage 15
        ↓
Stage 15     confidence evaluations
        ↓
Stage 16     report (materials from Stage 14 + takeoff confidence summary)
```

Stage 15 runs **after** Stage 14 material calculation. It does **not** feed back into Stage 14.

### Inputs consumed (actual `createFramingStages.ts` order 15)

| Input | Source | Used for |
|---|---|---|
| `wallFraming` | Stage 7 | Per-wall + per-segment object evaluations |
| `openings` | Stage 8 | Per-opening evaluations |
| `structuralMembers` | Stage 9 | Per-member evaluations |
| `floorFraming` | Stage 11 | Per-system + per-area evaluations |
| `roofFraming` | Stage 12 | Per-system + per-plane evaluations |
| `sheathing` | Stage 10 | Per-system + per-area evaluations |
| `validation` | Stage 13 | Validation dimension, review/blocking derivation, issue/result IDs |
| `extractedEvidence.evidence[].id` | Stage 6 | Evidence ID list on **takeoff** evaluation only |
| `useMockAi` → `useExplicitFixture` | Pipeline context | Hard-coded takeoff evidence/resolution text |
| `pipelineRunId`, `scopeName` | Context | Takeoff evaluation target |

### Inputs NOT consumed

| Input | Notes |
|---|---|
| Stage 14 `materials` | **Not read** |
| Stage 14 `pendingClaims` | **Not read** |
| Stage 14 `assumptions` | **Not read** (only `assumptionIds` on resolved objects) |
| Material `claimStatus` | **Not read** |
| Quantity keys | **Not read** |
| Calculator output metadata | **Not read** |
| Evidence record content (beyond ID list on takeoff) | **Not read** for scoring |
| Blocking / connectors payloads | No objects to evaluate |

### Outputs produced

`ConfidencePayload` → artifact `15-confidence.json`:

```typescript
{
  confidenceEvaluations: ConfidenceEvaluation[]  // one per resolved object + one takeoff
}
```

Each `ConfidenceEvaluation` (`confidenceEvaluationSchema`):

| Field | Type | Source |
|---|---|---|
| `id` | `CE-{target-slug}` | Deterministic from target |
| `target` | object \| artifact \| takeoff | Object ID/type or pipeline run |
| `evidence` | `{ label: high\|medium\|low, explanation }` | `deriveEvidenceConfidence` |
| `resolution` | same | `deriveResolutionConfidence` |
| `validation` | same | `deriveValidationConfidence` |
| `overallLabel` | high \| medium \| low \| blocked | `deriveOverallLabel` |
| `completion` | Completion schema | **Copied** from object; takeoff = average of object % |
| `reviewStatus` | review enum | Derived from object + linked review items |
| `blockingStatus` | blocking enum | Derived from object + linked review items |
| `quantityImpactWeight` | low \| medium \| high | `quantityImpactWeightForObjectType` |
| `explanation` | string | Template text |
| `evidenceIds`, `assumptionIds` | ID arrays | Copied from object (takeoff: all evidence IDs / empty assumptions) |
| `validationIssueIds`, `validationResultIds`, `reviewItemIds` | ID arrays | Filtered from Stage 13 for object/takeoff |
| `userDecisionIds` | ID arrays | From resolution traces |

**Stage 15 does not modify material lines.** It produces a **parallel confidence artifact** only.

### Downstream consumers

| Consumer | What it uses |
|---|---|
| **Stage 16 report** | Requires takeoff `ConfidenceEvaluation`; copies `confidenceEvaluationId`, `summary.confidenceLabel`, `summary.completion`, `summary.reviewStatus`, `summary.blockingStatus`; passes **Stage 14 materials unchanged** |
| **Stage 16 companion** (`buildFramingPackageProductState`) | Full confidence payload for row counts (see §15) |
| **framing-scope.validator** | Optional snapshot integrity (not in M.4 main path) |

---

## 2. Complete confidence inventory

There are **no numerical confidence scores**. All values are categorical labels on three **dimensions** plus one **overall** label.

### Dimension: Evidence confidence

| | |
|---|---|
| **Produced by** | `deriveEvidenceConfidence` |
| **Inputs** | `object.evidenceIds[]`, `object.resolutionTraces[]` |
| **Output** | `{ label: high\|medium\|low, explanation }` |
| **Effect on materials** | **None** |
| **Effect on report** | Indirect via `overallLabel` on takeoff summary |
| **Effect on review** | **None** (review derived separately from review items) |

### Dimension: Resolution confidence

| | |
|---|---|
| **Produced by** | `deriveResolutionConfidence` |
| **Inputs** | `object.resolutionTraces[]` only |
| **Output** | `{ label: high\|medium\|low, explanation }` |
| **Effect on materials** | **None** |

### Dimension: Validation confidence

| | |
|---|---|
| **Produced by** | `deriveValidationConfidence` |
| **Inputs** | `validationResults[]`, `validationIssues[]` linked to object |
| **Output** | `{ label: high\|medium\|low, explanation }` |
| **Effect on materials** | **None** (`canCalculate` **not consulted**) |

### Overall label

| | |
|---|---|
| **Produced by** | `deriveOverallLabel(dimensions, blocked flag)` |
| **Rule** | blocked → `blocked`; else any dimension `low` → `low`; else any `medium` → `medium`; else `high` |
| **Blocked flag** | Object: `blockingStatus === "blocked"`; Takeoff: global blocked review items OR `highImpactBlocked` |

### Completion (on evaluation record)

| | |
|---|---|
| **Produced by** | Copied from resolved object `completion`; takeoff = `round(avg(object.completion.percentage))` |
| **Not recalculated** from materials or validation |

### Review status (on evaluation record)

| | |
|---|---|
| **Produced by** | `deriveReviewStatus(object.reviewStatus, reviewItems)` |
| **Rules** | Any linked review item `blockingStatus === "blocked"` → `review-required`; else any review items → `review-recommended`; else object status |

### Blocking status (on evaluation record)

| | |
|---|---|
| **Produced by** | `deriveBlockingStatus(object.blockingStatus, reviewItems)` |
| **Rules** | Any linked item `blocked` → `blocked`; else any `partially-blocked` → `partially-blocked`; else object status |
| **Takeoff** | Uses **all** `validation.reviewItems` (global), not per-object filter |

### Quantity impact weight

| | |
|---|---|
| **Produced by** | `quantityImpactWeightForObjectType(objectType)` — fixed lookup table |
| **High** | building-wall, structural-member, floor-framing-area, roof-plane, sheathing-area |
| **Medium** | wall-segment, opening, floor/roof/sheathing-system |
| **Low** | default |
| **Used only** | Takeoff `highImpactBlocked` check |

### Takeoff-only hard-coded dimensions

When `useExplicitFixture === false` (Beckstead live):

| Dimension | Label | Explanation (fixed string) |
|---|---|---|
| evidence | medium | "Live extraction completed; walls were resolved from extracted evidence." |
| resolution | medium | "Some values remain unresolved after evidence resolution." |

When `useExplicitFixture === true`: both `high` with demo text.

**Not derived from actual evidence analysis at takeoff level.**

### Concepts NOT implemented in Stage 15

- Numerical scores / penalties / bonuses
- Per-material-line confidence
- Per-quantity-key confidence
- Source-type weighting (Claude vs geometry vs schedule)
- Assumption penalty scoring
- Pending-claim scoring
- Calculator-family completeness detection
- Material taxonomy completeness
- Evidence confidence field on Evidence records (separate from Stage 15)

---

## 3. Exact confidence formulas / rules

### `deriveResolutionConfidence(traces)`

| Condition | Label |
|---|---|
| `traces.length === 0` | medium |
| Any `trace.method === "unresolved"` | low |
| All traces `explicit-project-value` OR `deterministic-calculation` | high |
| Any `approved-default` OR `user-override` | high |
| Else (e.g. `supported-inference`, `evidence`) | medium |

### `deriveEvidenceConfidence(evidenceIds, traces)`

| Condition | Label |
|---|---|
| `evidenceIds.length === 0` | low |
| All trace evidence IDs ⊆ object evidenceIds AND all traces explicit/deterministic-calculation | high |
| Any `supported-inference` trace | medium |
| Else | medium |

### `deriveValidationConfidence(results, issues)`

| Condition | Label |
|---|---|
| `results.length === 0` | medium |
| No failed results | high |
| Any issue `severity === "critical"` OR `"blocking"` | low |
| Else (warnings only) | medium |

**Note:** `canCalculate`, quantity keys, and warning vs critical distinction for blocking overall are **separate** paths.

### `deriveOverallLabel(dimensions, blocked)`

```
if blocked → "blocked"
else if any dimension.label === "low" → "low"
else if any dimension.label === "medium" → "medium"
else → "high"
```

### `deriveReviewStatus` / `deriveBlockingStatus`

See §2. No numeric penalties. Multiple issues do not stack beyond first matching rule.

### Takeoff `highImpactBlocked`

```typescript
objectEvaluations.some(e =>
  e.quantityImpactWeight === "high" &&
  (e.overallLabel === "blocked" || e.blockingStatus === "blocked")
)
```

### Takeoff `overallLabel` blocked when

`blockingStatus === "blocked"` (from **any** global review item with `blockingStatus === "blocked"`) **OR** `highImpactBlocked`.

---

## 4. What is confidence measuring? (classification)

| Rule / input | Classification |
|---|---|
| `trace.method === "unresolved"` → resolution low | **G** Evidence/trace lifecycle |
| `trace.method === "explicit-project-value"` → resolution high | **A** Plan reading quality |
| `trace.method === "supported-inference"` → resolution medium | **B** Interpretation certainty |
| `evidenceIds.length === 0` → evidence low | **G** Lifecycle / linkage |
| Validation failed + critical severity → validation low | **H** Validation state |
| Validation warnings only → validation medium | **H** Validation state |
| `blockingStatus` from review items → overall blocked | **I** Human-review state |
| `completion` copied from resolver | **F** Software completion metadata |
| Takeoff hard-coded "Live extraction completed" | **K** Pipeline-mode flag, not measured |
| `quantityImpactWeight` by objectType | **F** Software taxonomy |
| No material-line or calculator output inspection | **—** Not measuring **J** takeoff completeness |

---

## 5. Confidence vs FACT / DERIVATION / ASSUMPTION / NOT DETERMINABLE

| Question | Answer |
|---|---|
| Can low-confidence FACT stop its use? | **No** — confidence runs after Stage 14; does not gate calculators |
| Can confidence convert fact to unresolved? | **No** |
| Can confidence skip derivation? | **No** |
| Can confidence authorize/reject assumptions? | **No** — registry is Stage 14 only |
| Does assumption usage lower confidence? | **No** — `assumptionIds` copied but not scored; `approved-default` traces → resolution **high** |
| Can confidence create NOT DETERMINABLE? | **No** — pending claims are Stage 14 only |
| When is confidence calculated? | **After** FACT/DERIVE/ASSUME/NOT DETERMINABLE decisions in Stages 6–14 |

**Stage 15 scores post-hoc metadata; it does not participate in the decision chain.**

---

## 6. Confidence vs material calculation

| Can Stage 15 change… | Answer |
|---|---|
| Whether a material line exists | **No** |
| Quantity | **No** |
| Unit / size / spec / identity | **No** |
| Grouping / deduplication / waste | **No** |
| Calculation path / assumption selection | **No** |

Stage 15 is **observational** relative to Stage 14. Materials are already computed when confidence runs.

**Beckstead proof:** 52 wall material lines in Stage 14 = 52 in Stage 16 report regardless of takeoff `overallLabel: blocked`.

---

## 7. Confidence vs validation

| Aspect | Behavior |
|---|---|
| Stage 15 reads validation | **Yes** — results, issues, review items |
| `canCalculate` affects confidence | **No** |
| Severity affects confidence | **Yes** — critical/blocking → validation dimension `low` |
| Warning-only failures | validation dimension `medium`; overall blocked only if review item `blockingStatus === "blocked"` |
| Stage 15 validates independently | **No** |
| Duplicated semantics | validation issues → confidence validation dimension; review items → confidence review/blocking status; overall `blocked` correlates with blocked review items |

**Representation validation** (e.g. dangling refs) reduces validation dimension to `low` when severity is critical; it does **not** use `canCalculate` to distinguish representation vs construction input.

**Stage 13 issues that do not block materials** (e.g. wall height warning with studs `canCalculate: true`) still produce validation dimension `low` if severity is critical — but overall label blocked only when review item `blockingStatus === "blocked"`.

---

## 8. Confidence vs review

| Question | Answer |
|---|---|
| Low confidence creates review item? | **No** — review items come from Stage 13 only |
| Review item lowers confidence? | **Yes** — via `deriveReviewStatus` / `deriveBlockingStatus` / blocked overall |
| Stage 15 consumes review items? | **Yes** — filtered per object; all items for takeoff |
| Stage 15 creates review items? | **No** |
| Confidence sets review `blockingStatus`? | **No** — reads it from review items |
| Review affects calculation? | **Only via Stage 13 `isQuantityBlocked`** — not via Stage 15 |
| Calculated material can be low/blocked confidence? | **Yes** — object can differ from takeoff |
| Material requiring review can still emit? | **Yes** — D20 principle; Stage 15 does not block materials |
| High confidence suppress review? | **No** |
| Review without confidence? | Review items exist in validation artifact even if Stage 15 removed |

**Beckstead:** All 26 emitting wall segments have `overallLabel: high`, `blockingStatus: not-blocked` while takeoff is `blocked` / `review-required`.

---

## 9. Confidence vs assumptions

| Question | Answer |
|---|---|
| Assumption usage lowers confidence automatically? | **No** |
| Different assumption penalties? | **No** |
| Stage 15 reads assumption objects from Stage 14? | **No** |
| `assumptionIds` on object | Copied to evaluation record only |
| `approved-default` trace method | Resolution dimension **high** (not penalized) |
| Takeoff `assumptionIds` | Always `[]` |
| Assumption affects review via confidence? | Only if Stage 13 created linked review items |

**Governed assumptions used in Stage 14** (king stud, sill, cripple) do not flow into Stage 15 scoring. Distinction between "verify assumption" vs "invalid material" is **not** made in confidence code.

---

## 10. Confidence vs representation / old architecture

| Dependency | Info obtained | Construction or lifecycle? | Missing effect | Material change? |
|---|---|---|---|---|
| `resolutionTraces[].method` | Resolution label | **Lifecycle** (unresolved vs explicit) | medium/low resolution | No |
| `evidenceIds` on object | Evidence label | **Lifecycle linkage** | evidence low if empty | No |
| `completion` on object | Copied to evaluation | **Software metadata** | takeoff avg % changes | No |
| `validationResults/Issues` | Validation dimension | **H** validation state | low validation | No |
| `reviewItems` | Review/blocking/overall blocked | **I** review machinery | blocked overall | No |
| `assumptionIds` on object | ID list only | Lifecycle bookkeeping | none on score | No |
| `userDecisionIds` from traces | ID list only | Lifecycle bookkeeping | none on score | No |
| `quantityImpactWeight` | Object-type table | **Software taxonomy** | takeoff blocked if high+blocked | No |
| Evidence ID list (takeoff) | Count for attachment | Not analyzed | fixed medium text | No |

**PendingMaterialClaim, claimStatus, candidacy** — **not consumed** by Stage 15.

---

## 11. Confidence and source / provenance

Stage 15 does **not** distinguish:

- Direct plan dimension vs schedule vs Claude vs geometry
- Project Learning vs compiler
- "Derived from dimensions" vs "read from dimension" (only `deterministic-calculation` trace method → resolution high)

Source distinctions collapse into:

1. **`trace.method`** enum on resolution traces
2. **`evidenceIds` presence/count**
3. **Hard-coded takeoff strings** for live vs fixture mode

No `source.type`, page reference, or Evidence `provenance` fields are read in confidence code.

---

## 12. Confidence and completeness

Stage 15 measures **neither** per-line correctness **nor** takeoff family completeness.

| Question | Answer |
|---|---|
| Confidence emitted line is correct? | **Partially** — object-level trust in evidence/resolution/validation only |
| Interpreted construction fact correct? | Same, per object |
| Entire takeoff complete? | **No** — no check for missing domains/calculators |
| Combination? | **D** — mixture of object-trust rollup + validation/review mirroring, not completeness |

**Beckstead:** Takeoff `completion.percentage = 36` (average object completion) with **only wall materials emitted**. Zero floor/opening/structural/sheathing/roof lines — Stage 15 still evaluates those objects (mostly `blocked`) but does **not** flag "no truss calculator" or "no floor output."

A run can have **high-confidence emitting segments** and **blocked takeoff** simultaneously while **most material families are absent**.

---

## 13. Beckstead Stage 15 trace (M.4 frozen)

### Aggregate (frozen `15-confidence.json`)

| Metric | Value |
|---|---|
| Object + takeoff evaluations | **153** (re-run with current code on same artifacts: 177) |
| Stage 14 materials entering Stage 15 | **52** (not read by Stage 15) |
| Takeoff `overallLabel` | **blocked** |
| Takeoff `blockingStatus` | **blocked** |
| Takeoff `reviewStatus` | **review-required** |
| Takeoff `completion.percentage` | **36** |
| Takeoff validation dimension | **low** ("Critical validation issues remain") |
| Blocked review items (Stage 13) | **342** of 480 |

### `overallLabel` distribution (frozen)

| Label | Count |
|---|---|
| blocked | 114 |
| medium | 31 |
| high | 32 |

### Representative traces

#### Emitted wall stud line

| Stage | State |
|---|---|
| Material | `MAT-wall-studs-object-WS-physical-run:p3:343b5ac7d6dc`, qty 7 |
| Segment confidence | `overallLabel: high`, `blockingStatus: not-blocked`, validation dimension: high |
| Takeoff | **blocked** (global review items + high-impact blocked walls) |

#### Emitted wall plate line

Same segment/wall context as studs — plate lines share source objects; segment confidence **high**.

#### Absent opening material

| Stage | State |
|---|---|
| Stage 14 | 0 opening lines |
| Opening object confidence | `overallLabel: blocked` (57 openings blocked) |
| Stage 15 knows absent? | **No** — only scores opening **objects**, not missing material lines |

#### Absent structural member

| Stage | State |
|---|---|
| Members | length/qty mostly null; 0 Stage 14 lines |
| SM confidence | 11 members `blocked` |
| Knows absent LF? | **No** |

#### Absent sheathing

| Stage | State |
|---|---|
| 6 systems, 0 areas | 0 lines |
| Sheathing system confidence | 6 × `blocked` |
| Knows missing SF? | **No** |

#### Absent floor

| Stage | State |
|---|---|
| `FFA-FLOOR-AREA-CRAWL-SPACE` has `joistLayoutLengthFeet=40` but `FFS-UNRESOLVED` | 0 lines |
| Floor area confidence | 8 areas `blocked` |
| Knows 40 ft not calculated? | **No** |

#### Absent roof

| Stage | State |
|---|---|
| Truss construction, unresolved planes | 0 lines |
| Roof confidence | 5 systems + 2 planes `blocked` |
| Knows truss gap? | **No** |

**Stage 15 scores resolved objects and mirrors validation; it does not account for Stage 14 output gaps.**

---

## 14. Counterfactual: remove Stage 15

Factual dependency analysis (no code changes):

| Effect | Result |
|---|---|
| Material count | **Unchanged** (Stage 16 copies Stage 14 materials directly) |
| Quantities / specs | **Unchanged** |
| Grouping | **Unchanged** |
| Review items | **Remain** in validation artifact; still on report as `reviewItemIds` |
| Stage 16 execution | **Fails** — `throw new Error("Takeoff confidence evaluation is missing.")` |
| Report `summary.confidenceLabel` | **Missing** — requires takeoff evaluation |
| Report `summary.completion` from confidence | **Missing** |
| `confidenceEvaluationId` | **Missing** — required by schema |
| Package product state companion | `confidence` column uses evaluation **count** → would be 0/null |
| Developer observability | Per-object dimension labels lost |

**Wiring dependency ≠ product requirement:** Stage 16 schema **requires** confidence artifact today, but materials do not.

---

## 15. Stage 16 dependency preview

Stage 16 (`report`):

1. Loads Stage 14 `calculations.materials` → **passed through verbatim** to report `materials`.
2. Loads Stage 13 `validation` → `reviewItemIds`, `validationIssueIds` on report.
3. Loads Stage 15 → finds `target.kind === "takeoff"` evaluation (**required**).
4. Sets `confidenceEvaluationId`, `summary.confidenceLabel` (= takeoff `overallLabel`), `summary.completion`, `summary.reviewStatus`, `summary.blockingStatus`.
5. Builds `framing-package-product-state` companion with full confidence payload.

**Confidence does not filter, sort, or gate materials in Stage 16.**

`buildFramingPackageProductState` `confidence` column per package = **`countConfidenceForTypes`** = **number of evaluation records** for that object type, **not** high/medium/low quality.

Stage 16 could factually consume Stage 14 materials without confidence **except** for current schema requirement and summary fields.

---

## 16. What Stage 15 does NOT do

Supported by code — Stage 15 does **not**:

- Read plans or Evidence content
- Discover construction
- Resolve relationships
- Derive dimensions or quantities
- Invoke assumptions
- Calculate materials
- Read Stage 14 output (materials, pending claims, assumptions)
- Detect missing calculator families or material taxonomy gaps
- Prevent duplicate material
- Change quantities or specifications
- Create validation issues (only consumes them)
- Block or permit calculation (that is Stage 13 + Stage 14)
- Assign per-material-line confidence
- Use numerical scoring

---

## 17. Legitimate information vs architecture-created information

### TABLE A — Information about the house / takeoff

| Information | Source | Stage 15 representation | Consumer | Concrete effect |
|---|---|---|---|---|
| Property unresolved on object | Resolver traces `unresolved` | resolution dimension `low` | Takeoff summary (via overall) | Report label only |
| Explicit plan values | trace `explicit-project-value` | resolution/evidence `high` | Object evaluation | Report label only |
| Validation critical issues on object | Stage 13 issues | validation dimension `low` | Object evaluation | Report label only |
| Human review needed | Stage 13 review items | `reviewStatus`, `blockingStatus` | Takeoff summary | Report `review-required` |
| Object partial completion | Resolver `completion` | Copied; takeoff averaged | Report `completion: 36%` | Summary metric only |
| High-impact domain blocked | wall/SM/floor-area etc. + blocked | `highImpactBlocked` → takeoff blocked | Report `confidenceLabel: blocked` | Summary label only |

### TABLE B — Information about the software lifecycle

| Information | Source | Stage 15 representation | Consumer | Concrete effect |
|---|---|---|---|---|
| Evidence ID attachment | Object metadata | evidence dimension | Object evaluation | Label only |
| Trace method taxonomy | resolutionTraces | resolution dimension | Object evaluation | Label only |
| Validation result linkage | validationResults per object | validation dimension + ID arrays | Evaluation record | Label + traceability |
| Review item blockingStatus | Stage 13 | overall `blocked` | Takeoff summary | Label only |
| Object-type impact tier | Hard-coded map | `quantityImpactWeight` | Takeoff blocked check | Label only |
| Pipeline mock vs live | `useMockAi` | Fixed takeoff evidence/resolution text | Takeoff evaluation | Explanation string only |
| Evaluation record inventory | Count of evaluations | Product state `confidence` column | Observability CSV | Count, not quality |

---

## 18. Bottom-line factual answers

### 1. What unique production capability does Stage 15 provide?

**Post-calculation categorical labeling** of resolved objects (evidence/resolution/validation dimensions + overall label) and a **takeoff-level rollup** (completion average, global review/blocking mirror, blocked if any blocked review item or high-impact object blocked). It does **not** duplicate calculation, assumption registry, or quantity blocking — it **summarizes** resolver + validation state into `ConfidenceEvaluation` records.

### 2. Does Stage 15 change any material quantity or existence?

**No.**

### 3. Does Stage 15 participate in FACT → DERIVE → ASSUME → NOT DETERMINABLE?

**No.** It runs **after** those decisions. It **scores** their artifacts (traces, validation, review).

### 4. What does confidence measure?

A **mixture**: partial plan-reading/interpretation signal (trace methods), **validation state** (severity-based), and **review/blocking machinery** (review item statuses). **Not** calculation correctness, assumption validity, or takeoff completeness.

### 5. Can Stage 15 assign good confidence to an incomplete takeoff?

**Yes.** Emitting segments can be `high` while takeoff is `blocked`. Takeoff `completion` reflects **object field completion**, not material-line coverage. **No** check for missing domains.

### 6. Does Stage 15 detect missing material families / calculator capability?

**No.**

### 7. What product-visible behavior depends on Stage 15?

Report `summary.confidenceLabel`, `summary.completion`, `summary.reviewStatus`, `summary.blockingStatus`, `confidenceEvaluationId`. Stage 16 **fails** without takeoff evaluation. Materials and review item lists do **not** depend on Stage 15.

### 8. What developer/debug behavior depends on Stage 15?

`15-confidence.json` artifact; per-object dimension labels; package product state evaluation counts; framing-scope snapshot validation (optional).

### 9. What breaks if Stage 15 is removed?

**Stage 16 throws** (missing takeoff confidence). Report schema validation fails without `confidenceEvaluationId` and summary confidence fields. Product state companion loses confidence counts. **Materials unchanged** if Stage 16 stubbed.

### 10. Wiring vs construction information loss

| Loss type | What |
|---|---|
| **Wiring/schema** | Stage 16 hard dependency; summary fields; CE id on report |
| **Actual takeoff information** | Categorical per-object trust rollup; takeoff blocked label driven by review-item inventory; average object completion % — all **observational**, already largely available in Stages 7–13 artifacts |

### 11. Genuinely useful rules/signals if subsystem disappeared?

### 12. Precise signals (no recommendation on survival)

1. **Three-dimension rollup** (`deriveEvidenceConfidence`, `deriveResolutionConfidence`, `deriveValidationConfidence`) → single `overallLabel` per object.
2. **Trace-method → trust band** mapping (`unresolved` → low; explicit → high).
3. **Takeoff blocked propagation** when any review item is `blockingStatus: blocked` OR high `quantityImpactWeight` object is blocked.
4. **Separation attempt** of completion / review / blocking / confidence on same record (Brain doc intent; partially implemented as parallel fields).

These signals are **deterministic** and **test-covered** but **do not alter** takeoff output on Beckstead.
