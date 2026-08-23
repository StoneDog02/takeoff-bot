import { readFile } from "node:fs/promises";
import path from "node:path";

import { compileDrawingPage } from "../drawing-compiler/compileDrawingPage.js";
import { auditPlanLineStyles } from "../drawing-compiler/plan-annotations/auditPlanLineStyles.js";
import { classifyEnclosureAnnotation } from "../drawing-compiler/plan-annotations/classifyPlanAnnotation.js";
import { renderPagePng } from "../drawing-compiler/dimensions/dimOwnership.js";
import { extractSegments } from "../drawing-compiler/sgg/extractSegments.js";
import type { PbgRun } from "../drawing-compiler/pbg/consolidatePhysicalRuns.js";
import { detectEnclosureCandidates } from "../drawing-compiler/semantic-mark-recovery/detectEnclosures.js";
import { extractAnnotationSegments } from "../drawing-compiler/semantic-mark-recovery/annotationSegments.js";
import {
  cropBboxFromRaster,
  createMarkOcrWorker,
  ocrMarkRegion,
} from "../drawing-compiler/semantic-mark-recovery/markOcr.js";
import type { CompiledDrawingPage } from "../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import { indexPlan } from "../plans/indexPlan.js";
import type { PlanIndex } from "../plans/PlanIndex.js";

const L3_METRICS_DIR = path.resolve("artifacts/b2.2l.3/metrics");
const L2_METRICS_DIR = path.resolve("artifacts/b2.2l.2/metrics");
const REGION_RENDER_SCALE = 2;

export type SheetSummary = {
  pageNumber: number;
  sheetId: string | null;
  label: string | null;
  textContentLength: number;
  compiled: boolean;
  pageRole: string | null;
};

export type TextHit = {
  pageNumber: number;
  text: string;
  source: "native" | "ocr" | "plan_index";
  textPrimitiveId?: string;
};

export type RegionImageRef = {
  pageNumber: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  imagePath: string;
  widthPx: number;
  heightPx: number;
  toolCallId: string;
  ocrText: string;
  /** Base64 PNG for multimodal tool_result delivery to Claude. */
  pngBase64: string;
};

export type RegionOcrCacheEntry = {
  toolCallId: string;
  pageNumber: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  imagePath: string;
  ocrText: string;
};

type LineStyleCache = Map<
  number,
  ReturnType<typeof auditPlanLineStyles>
>;

type AnnotationCache = Map<
  number,
  Array<{
    id: string;
    conventionClass: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>
>;

/**
 * Read-only investigation facade over compiled drawing pages and plan index.
 * No semantic conclusions — observation queries only.
 */
export class CompilerInvestigationFacade {
  private readonly pdfPath: string;
  private readonly planIndex: PlanIndex;
  private readonly pageCache = new Map<number, CompiledDrawingPage>();
  private readonly lineStyleCache: LineStyleCache = new Map();
  private readonly annotationCache: AnnotationCache = new Map();
  private readonly regionRenderCache = new Map<string, RegionImageRef>();
  private readonly regionOcrCache = new Map<string, RegionOcrCacheEntry>();
  private crossPageInventory: Record<string, unknown> | null = null;
  private inspectRegionCount = 0;

  private constructor(pdfPath: string, planIndex: PlanIndex) {
    this.pdfPath = pdfPath;
    this.planIndex = planIndex;
  }

  static async create(pdfPath: string): Promise<CompilerInvestigationFacade> {
    const planIndex = await indexPlan(pdfPath);
    return new CompilerInvestigationFacade(pdfPath, planIndex);
  }

  getPdfPath(): string {
    return this.pdfPath;
  }

  getPlanIndex(): PlanIndex {
    return this.planIndex;
  }

  async ensurePageCompiled(pageNumber: number): Promise<CompiledDrawingPage> {
    const cached = this.pageCache.get(pageNumber);
    if (cached) return cached;

    const prevEnv = { ...process.env };
    process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = "1";
    process.env.TAKEOFF_B2_2L3_PROOF = "1";
    process.env.TAKEOFF_SCHEDULE_PAGE_NUMBERS = "1";

    try {
      const compiled = await compileDrawingPage({
        pdfPath: this.pdfPath,
        pageNumber,
        options: { maxOcr: 30 },
      });
      this.pageCache.set(pageNumber, compiled);
      return compiled;
    } finally {
      process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION =
        prevEnv.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
      process.env.TAKEOFF_B2_2L3_PROOF = prevEnv.TAKEOFF_B2_2L3_PROOF;
      process.env.TAKEOFF_SCHEDULE_PAGE_NUMBERS =
        prevEnv.TAKEOFF_SCHEDULE_PAGE_NUMBERS;
    }
  }

  async precompilePages(pageNumbers: readonly number[]): Promise<void> {
    for (const pageNumber of pageNumbers) {
      await this.ensurePageCompiled(pageNumber);
    }
  }

  listSheets(): SheetSummary[] {
    return this.planIndex.pages.map((page) => {
      const compiled = this.pageCache.get(page.pageNumber);
      return {
        pageNumber: page.pageNumber,
        sheetId: page.sheetId ?? null,
        label: page.label ?? null,
        textContentLength: page.textContent?.length ?? 0,
        compiled: compiled != null,
        pageRole: compiled?.pageRole.role ?? null,
      };
    });
  }

  async getSheetRole(pageNumber: number): Promise<{
    pageNumber: number;
    pageRole: string;
    roleConfidence: string;
    sheetId: string | null;
    label: string | null;
    textContentLength: number;
  }> {
    const compiled = await this.ensurePageCompiled(pageNumber);
    const planPage = this.planIndex.pages.find((p) => p.pageNumber === pageNumber);
    return {
      pageNumber,
      pageRole: compiled.pageRole.role,
      roleConfidence: compiled.pageRole.method,
      sheetId: planPage?.sheetId ?? null,
      label: planPage?.label ?? null,
      textContentLength: planPage?.textContent?.length ?? 0,
    };
  }

  async getCompiledPageSummary(pageNumber: number): Promise<{
    pageNumber: number;
    pageRole: string;
    pbgRunCount: number;
    textPrimitiveCount: number;
    dimTranscriptionCount: number;
    compileTimingMs: number;
    semanticDefinitionCount: number;
    dereferenceBindingCount: number;
  }> {
    const compiled = await this.ensurePageCompiled(pageNumber);
    return {
      pageNumber,
      pageRole: compiled.pageRole.role,
      pbgRunCount: compiled.geometry.pbgRuns.length,
      textPrimitiveCount: compiled.text.primitives.length,
      dimTranscriptionCount: compiled.transcriptions.length,
      compileTimingMs: compiled.timingMs.total,
      semanticDefinitionCount:
        compiled.semanticDefinitions?.definitions.length ?? 0,
      dereferenceBindingCount:
        compiled.semanticDereference?.bindings.length ?? 0,
    };
  }

  async getPhysicalRuns(
    pageNumber: number,
    filter?: { wallAuthority?: string },
  ): Promise<
    Array<{
      physicalRunKey: string;
      orientation: string;
      wallAuthority: string;
      lengthPt: number;
      thicknessPt: number;
    }>
  > {
    const compiled = await this.ensurePageCompiled(pageNumber);
    let runs = compiled.geometry.pbgRuns;
    if (filter?.wallAuthority) {
      runs = runs.filter((r) => r.wallAuthority === filter.wallAuthority);
    }
    return runs.map((r) => ({
      physicalRunKey: r.physicalRunKey,
      orientation: r.orientation,
      wallAuthority: r.wallAuthority,
      lengthPt: r.lengthPt,
      thicknessPt: r.thicknessPt ?? 0,
    }));
  }

  async getPhysicalRun(runId: string): Promise<{
    physicalRunKey: string;
    pageNumber: number;
    orientation: string;
    wallAuthority: string;
    centerline: { x1: number; y1: number; x2: number; y2: number };
    lengthPt: number;
    thicknessPt: number;
  } | null> {
    for (const [pageNumber, compiled] of this.pageCache) {
      const run = compiled.geometry.pbgRuns.find(
        (r) => r.physicalRunKey === runId || r.id === runId,
      );
      if (run) {
        return {
          physicalRunKey: run.physicalRunKey,
          pageNumber,
          orientation: run.orientation,
          wallAuthority: run.wallAuthority,
          centerline: run.centerline,
          lengthPt: run.lengthPt,
          thicknessPt: run.thicknessPt ?? 0,
        };
      }
    }
    return null;
  }

  private async getLineStyleAudit(pageNumber: number) {
    const cached = this.lineStyleCache.get(pageNumber);
    if (cached) return cached;

    const compiled = await this.ensurePageCompiled(pageNumber);
    const { segments } = await extractSegments(this.pdfPath, pageNumber);
    const audit = auditPlanLineStyles({
      segments,
      pbgRuns: compiled.geometry.pbgRuns as PbgRun[],
      pageNumber,
    });
    this.lineStyleCache.set(pageNumber, audit);
    return audit;
  }

  async getLineStyleObservations(
    pageNumber: number,
    runId?: string,
  ): Promise<{
    strokeWidthMedian: number;
    strokeWidthP90: number;
    heavyLineNearRunCount: number;
    entries: Array<{
      id: string;
      strokeWidth: number;
      isHeavyLine: boolean;
      nearRunKey: string | null;
      distancePt: number | null;
    }>;
  }> {
    const audit = await this.getLineStyleAudit(pageNumber);
    let entries = audit.entries;
    if (runId) {
      entries = entries.filter((e) => e.nearRunKey === runId);
    } else {
      const heavyNear = entries.filter(
        (e) =>
          e.isHeavyLine &&
          e.nearRunKey &&
          e.distancePt != null &&
          e.distancePt < 25,
      );
      const heavyKeys = new Set(heavyNear.map((e) => e.id));
      const rest = entries.filter((e) => !heavyKeys.has(e.id));
      entries = [...heavyNear, ...rest];
    }
    return {
      strokeWidthMedian: audit.strokeWidthMedian,
      strokeWidthP90: audit.strokeWidthP90,
      heavyLineNearRunCount: audit.heavyLineNearRunCount,
      entries: entries.slice(0, 200).map((e) => ({
        id: e.id,
        strokeWidth: e.strokeWidth,
        isHeavyLine: e.isHeavyLine,
        nearRunKey: e.nearRunKey,
        distancePt: e.distancePt,
      })),
    };
  }

  private async buildAnnotationInventory(pageNumber: number) {
    const cached = this.annotationCache.get(pageNumber);
    if (cached) return cached;

    const compiled = await this.ensurePageCompiled(pageNumber);
    const { segments } = await extractSegments(this.pdfPath, pageNumber);
    const annSegs = extractAnnotationSegments(segments);
    const enclosures = detectEnclosureCandidates(annSegs, pageNumber);
    const entries = enclosures.slice(0, 500).map((enc, idx) => {
      const classified = classifyEnclosureAnnotation({
        enc,
        pageNumber,
        pbgRuns: compiled.geometry.pbgRuns as PbgRun[],
        pageWidth: compiled.pageWidth,
        pageHeight: compiled.pageHeight,
        isSchedulePage: pageNumber === 1,
      });
      return {
        id: `ann-p${pageNumber}-${idx}`,
        conventionClass: classified.conventionClass,
        bbox: enc.bbox,
      };
    });
    this.annotationCache.set(pageNumber, entries);
    return entries;
  }

  async getAnnotationInventory(pageNumber: number): Promise<{
    pageNumber: number;
    entryCount: number;
    byClass: Record<string, number>;
    sampleEntries: Array<{
      id: string;
      conventionClass: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  }> {
    const entries = await this.buildAnnotationInventory(pageNumber);
    const byClass: Record<string, number> = {};
    for (const e of entries) {
      byClass[e.conventionClass] = (byClass[e.conventionClass] ?? 0) + 1;
    }
    return {
      pageNumber,
      entryCount: entries.length,
      byClass,
      sampleEntries: entries.slice(0, 40),
    };
  }

  async getSemanticDefinitions(): Promise<
    Array<{
      semanticTypeKey: string;
      sourcePage: number;
      properties: Array<{ propertyPath: string; rawText: string }>;
    }>
  > {
    const out: Array<{
      semanticTypeKey: string;
      sourcePage: number;
      properties: Array<{ propertyPath: string; rawText: string }>;
    }> = [];

    for (const [, compiled] of this.pageCache) {
      const block = compiled.semanticDefinitions;
      if (!block) continue;
      for (const def of block.definitions) {
        out.push({
          semanticTypeKey: def.semanticTypeKey,
          sourcePage: def.sourcePageNumber,
          properties: def.properties.map((p) => ({
            propertyPath: p.propertyPath,
            rawText: p.rawText,
          })),
        });
      }
    }
    return out;
  }

  async getSemanticDereferenceAudit(): Promise<{
    bindings: Array<{
      bindingId: string;
      physicalRunKey: string;
      referenceKey: string;
      status: string;
      emit: boolean;
    }>;
    referenceMechanism: string | null;
    metrics: Record<string, number> | null;
  }> {
    const bindings: Array<{
      bindingId: string;
      physicalRunKey: string;
      referenceKey: string;
      status: string;
      emit: boolean;
    }> = [];
    let referenceMechanism: string | null = null;
    let metrics: Record<string, number> | null = null;

    for (const [, compiled] of this.pageCache) {
      const block = compiled.semanticDereference;
      if (!block) continue;
      referenceMechanism = block.referenceMechanism;
      metrics = block.metrics as Record<string, number>;
      for (const b of block.bindings) {
        bindings.push({
          bindingId: b.bindingId,
          physicalRunKey: b.physicalRunKey,
          referenceKey: b.referenceKey,
          status: b.status,
          emit: b.emit,
        });
      }
    }
    return { bindings, referenceMechanism, metrics };
  }

  searchProjectText(query: string): TextHit[] {
    const q = query.toLowerCase();
    const hits: TextHit[] = [];
    for (const page of this.planIndex.pages) {
      const text = page.textContent ?? "";
      if (text.toLowerCase().includes(q)) {
        hits.push({
          pageNumber: page.pageNumber,
          text: text.slice(0, 500),
          source: "plan_index",
        });
      }
    }
    for (const [pageNumber, compiled] of this.pageCache) {
      for (const tp of compiled.text.primitives) {
        if (tp.rawText.toLowerCase().includes(q)) {
          hits.push({
            pageNumber,
            text: tp.rawText,
            source:
              tp.sourceAuthority === "localized-ocr" ? "ocr" : "native",
            textPrimitiveId: tp.id,
          });
        }
      }
    }
    return hits.slice(0, 50);
  }

  findTextPattern(pattern: string): TextHit[] {
    let re: RegExp;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return [];
    }
    const hits: TextHit[] = [];
    for (const page of this.planIndex.pages) {
      const text = page.textContent ?? "";
      const match = text.match(re);
      if (match) {
        hits.push({
          pageNumber: page.pageNumber,
          text: match[0],
          source: "plan_index",
        });
      }
    }
    for (const [pageNumber, compiled] of this.pageCache) {
      for (const tp of compiled.text.primitives) {
        const match = tp.rawText.match(re);
        if (match) {
          hits.push({
            pageNumber,
            text: match[0],
            source:
              tp.sourceAuthority === "localized-ocr" ? "ocr" : "native",
            textPrimitiveId: tp.id,
          });
        }
      }
    }
    return hits.slice(0, 50);
  }

  async getCrossPageInventory(): Promise<Record<string, unknown>> {
    if (this.crossPageInventory) return this.crossPageInventory;

    const files = [
      "p4-semantic-convention-inventory.json",
      "phase0-reference-mechanism-decision.json",
      "phase0-proof-target.json",
      "p1-schedule-vector-audit.json",
      "p1-definition-vocabulary.json",
    ];

    const bundle: Record<string, unknown> = {
      source: "artifacts/b2.2l.3/metrics",
    };

    for (const file of files) {
      try {
        const raw = await readFile(path.join(L3_METRICS_DIR, file), "utf8");
        bundle[file.replace(".json", "")] = JSON.parse(raw) as unknown;
      } catch {
        bundle[file.replace(".json", "")] = null;
      }
    }

    try {
      const raw = await readFile(
        path.join(L2_METRICS_DIR, "page-semantic-inventory.json"),
        "utf8",
      );
      bundle.pageSemanticInventory = JSON.parse(raw) as unknown;
    } catch {
      bundle.pageSemanticInventory = null;
    }

    this.crossPageInventory = bundle;
    return bundle;
  }

  async inspectRegion(
    pageNumber: number,
    bbox: { x0: number; y0: number; x1: number; y1: number },
    outputDir: string,
    maxCalls: number,
    toolCallId: string,
  ): Promise<RegionImageRef | { error: string }> {
    if (this.inspectRegionCount >= maxCalls) {
      return { error: `inspectRegion budget exhausted (max ${maxCalls})` };
    }

    const key = `${pageNumber}:${bbox.x0},${bbox.y0},${bbox.x1},${bbox.y1}`;
    const cached = this.regionRenderCache.get(key);
    if (cached) {
      this.regionOcrCache.set(toolCallId, {
        toolCallId,
        pageNumber: cached.pageNumber,
        bbox: cached.bbox,
        imagePath: cached.imagePath,
        ocrText: cached.ocrText,
      });
      return { ...cached, toolCallId };
    }

    const compiled = await this.ensurePageCompiled(pageNumber);
    const rendered = await renderPagePng(
      this.pdfPath,
      pageNumber,
      REGION_RENDER_SCALE,
    );
    const crop = cropBboxFromRaster(
      rendered.png,
      compiled.pageWidth,
      compiled.pageHeight,
      bbox,
      12,
    );

    const worker = await createMarkOcrWorker();
    let ocrText = "";
    try {
      const ocr = await ocrMarkRegion(crop.png, worker);
      ocrText = ocr.text.trim();
    } finally {
      await worker.terminate();
    }

    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(outputDir, { recursive: true });
    const imagePath = path.join(
      outputDir,
      `region-p${pageNumber}-${this.inspectRegionCount}.png`,
    );
    await writeFile(imagePath, crop.png);

    const ref: RegionImageRef = {
      pageNumber,
      bbox,
      imagePath,
      widthPx: crop.width,
      heightPx: crop.height,
      toolCallId,
      ocrText,
      pngBase64: crop.png.toString("base64"),
    };
    this.regionRenderCache.set(key, ref);
    this.regionOcrCache.set(toolCallId, {
      toolCallId,
      pageNumber,
      bbox,
      imagePath,
      ocrText,
    });
    this.inspectRegionCount++;
    return ref;
  }

  getRegionOcrEntry(toolCallId: string): RegionOcrCacheEntry | null {
    return this.regionOcrCache.get(toolCallId) ?? null;
  }

  getRegionOcrCache(): ReadonlyMap<string, RegionOcrCacheEntry> {
    return this.regionOcrCache;
  }

  registerScheduleOcrEntry(entry: RegionOcrCacheEntry): void {
    this.regionOcrCache.set(entry.toolCallId, entry);
  }

  resetRegionOcrCache(): void {
    this.regionOcrCache.clear();
  }

  getInspectRegionCount(): number {
    return this.inspectRegionCount;
  }

  resetInspectRegionCount(): void {
    this.inspectRegionCount = 0;
    this.resetRegionOcrCache();
  }

  async compareRunGraphics(runIds: string[]): Promise<{
    runs: Array<{
      physicalRunKey: string;
      pageNumber: number;
      heavyLineCount: number;
      medianStrokeNearRun: number;
    }>;
  }> {
    const runs: Array<{
      physicalRunKey: string;
      pageNumber: number;
      heavyLineCount: number;
      medianStrokeNearRun: number;
    }> = [];

    for (const runId of runIds) {
      const detail = await this.getPhysicalRun(runId);
      if (!detail) continue;
      const lineObs = await this.getLineStyleObservations(
        detail.pageNumber,
        runId,
      );
      const strokes = lineObs.entries.map((e) => e.strokeWidth);
      const median =
        strokes.length > 0
          ? strokes.sort((a, b) => a - b)[Math.floor(strokes.length / 2)]!
          : 0;
      runs.push({
        physicalRunKey: runId,
        pageNumber: detail.pageNumber,
        heavyLineCount: lineObs.entries.filter((e) => e.isHeavyLine).length,
        medianStrokeNearRun: median,
      });
    }
    return { runs };
  }

  async getNearbyObservations(
    runId: string,
    radiusPt: number,
  ): Promise<{
    runId: string;
    nearbyAnnotations: Array<{
      id: string;
      conventionClass: string;
      distancePt: number;
    }>;
  }> {
    const detail = await this.getPhysicalRun(runId);
    if (!detail) {
      return { runId, nearbyAnnotations: [] };
    }
    const mid = {
      x: (detail.centerline.x1 + detail.centerline.x2) / 2,
      y: (detail.centerline.y1 + detail.centerline.y2) / 2,
    };
    const inventory = await this.buildAnnotationInventory(detail.pageNumber);
    const nearby = inventory
      .map((ann) => {
        const cx = (ann.bbox.x0 + ann.bbox.x1) / 2;
        const cy = (ann.bbox.y0 + ann.bbox.y1) / 2;
        const distancePt = Math.hypot(cx - mid.x, cy - mid.y);
        return { ...ann, distancePt };
      })
      .filter((a) => a.distancePt <= radiusPt)
      .sort((a, b) => a.distancePt - b.distancePt)
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        conventionClass: a.conventionClass,
        distancePt: Number(a.distancePt.toFixed(1)),
      }));
    return { runId, nearbyAnnotations: nearby };
  }

  /** Dispatch tool by name for interpreter loop. */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    outputDir: string,
    maxRegionCalls: number,
    toolCallId?: string,
  ): Promise<unknown> {
    switch (name) {
      case "listSheets":
        return this.listSheets();
      case "getSheetRole":
        return this.getSheetRole(Number(args.pageNumber));
      case "getCompiledPageSummary":
        return this.getCompiledPageSummary(Number(args.pageNumber));
      case "getPhysicalRuns":
        return this.getPhysicalRuns(
          Number(args.pageNumber),
          args.filter as { wallAuthority?: string } | undefined,
        );
      case "getPhysicalRun":
        return this.getPhysicalRun(String(args.runId));
      case "getLineStyleObservations":
        return this.getLineStyleObservations(
          Number(args.pageNumber),
          args.runId != null ? String(args.runId) : undefined,
        );
      case "getAnnotationInventory":
        return this.getAnnotationInventory(Number(args.pageNumber));
      case "getSemanticDefinitions":
        return this.getSemanticDefinitions();
      case "getSemanticDereferenceAudit":
        return this.getSemanticDereferenceAudit();
      case "searchProjectText":
        return this.searchProjectText(String(args.query));
      case "findTextPattern":
        return this.findTextPattern(String(args.pattern));
      case "getCrossPageInventory":
        return this.getCrossPageInventory();
      case "inspectRegion":
        return this.inspectRegion(
          Number(args.pageNumber),
          args.bbox as { x0: number; y0: number; x1: number; y1: number },
          outputDir,
          maxRegionCalls,
          toolCallId ?? `inspect-${Date.now()}`,
        );
      case "compareRunGraphics":
        return this.compareRunGraphics(
          (args.runIds as string[]) ?? [],
        );
      case "getNearbyObservations":
        return this.getNearbyObservations(
          String(args.runId),
          Number(args.radiusPt ?? 50),
        );
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
}
