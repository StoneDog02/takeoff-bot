import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import {
  buildSemanticBindingAuditFromCompiledPage,
  summarizeSemanticBindingPages,
} from "../../../drawing-compiler/type-marks/buildSemanticBindingAudit.js";
import {
  buildSemanticMarkRecoveryAuditFromPage,
  summarizeSemanticMarkRecoveryPages,
} from "../../../drawing-compiler/type-marks/buildSemanticMarkRecoveryAudit.js";

export type SemanticBindingAuditPayload = ReturnType<
  typeof summarizeSemanticBindingPages
> &
  ReturnType<typeof summarizeSemanticMarkRecoveryPages> & {
  compiledPageNumbers: number[];
  perPage: Record<number, ReturnType<typeof buildSemanticBindingAuditFromCompiledPage>>;
  perPageRecovery: Record<
    number,
    ReturnType<typeof buildSemanticMarkRecoveryAuditFromPage>
  >;
};

export function buildSemanticBindingAudit(
  pages: readonly CompiledDrawingPage[],
): SemanticBindingAuditPayload {
  const perPage: SemanticBindingAuditPayload["perPage"] = {};
  const perPageRecovery: SemanticBindingAuditPayload["perPageRecovery"] = {};
  for (const page of pages) {
    perPage[page.pageNumber] = buildSemanticBindingAuditFromCompiledPage(page);
    perPageRecovery[page.pageNumber] =
      buildSemanticMarkRecoveryAuditFromPage(page);
  }

  return {
    compiledPageNumbers: pages.map((p) => p.pageNumber),
    perPage,
    perPageRecovery,
    ...summarizeSemanticBindingPages(pages),
    ...summarizeSemanticMarkRecoveryPages(pages),
  };
}
