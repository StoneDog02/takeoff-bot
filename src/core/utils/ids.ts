import { randomUUID } from "node:crypto";

function compactUuid(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

export function generateProjectId(): string {
  return `project-${compactUuid()}`;
}

export function generateUiSessionId(): string {
  return `ui-session-${compactUuid()}`;
}
