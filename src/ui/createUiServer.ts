import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ReviewItemId } from "../core/schemas/identity.schema.js";
import { logger } from "../core/logging/logger.js";
import {
  FramingTakeoffService,
  type TakeoffViewState,
} from "./framingTakeoffService.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(moduleDirectory, "../../public");

type JsonRecord = Record<string, unknown>;

async function readJsonBody(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRecord;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string,
): void {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": contentType.includes("html") ? "no-store" : "public, max-age=0",
  });
  response.end(body);
}

async function serveStaticFile(
  response: ServerResponse,
  relativePath: string,
): Promise<boolean> {
  const filePath = path.join(publicDirectory, relativePath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(publicDirectory)) {
    return false;
  }

  try {
    const content = await readFile(normalized, "utf8");
    const contentType = relativePath.endsWith(".css")
      ? "text/css; charset=utf-8"
      : relativePath.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8";
    sendText(response, 200, contentType, content);
    return true;
  } catch {
    return false;
  }
}

function parseSubmitDecisionBody(body: JsonRecord): {
  reviewItemId: string;
  value?: string | number | boolean;
  rationale: string;
  decisionType: "value-provided" | "confirmed";
} {
  const reviewItemId = body.reviewItemId;
  const value = body.value;
  const rationale = body.rationale;
  const decisionTypeRaw = body.decisionType;

  if (typeof reviewItemId !== "string" || reviewItemId.trim().length === 0) {
    throw new Error("reviewItemId is required.");
  }

  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    throw new Error("rationale is required.");
  }

  const decisionType =
    decisionTypeRaw === "confirmed" ? "confirmed" : "value-provided";

  if (decisionType === "value-provided") {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error("value must be a string, number, or boolean.");
    }
    return {
      reviewItemId,
      value,
      rationale: rationale.trim(),
      decisionType,
    };
  }

  return {
    reviewItemId,
    rationale: rationale.trim(),
    decisionType,
  };
}

export function createUiServer(service = new FramingTakeoffService()) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/") {
        if (await serveStaticFile(response, "index.html")) {
          return;
        }
        sendText(response, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }

      if (request.method === "GET" && (pathname === "/app.js" || pathname === "/styles.css")) {
        const relativePath = pathname.slice(1);
        if (await serveStaticFile(response, relativePath)) {
          return;
        }
        sendText(response, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }

      if (request.method === "POST" && pathname === "/api/sessions") {
        const body = await readJsonBody(request);
        const artifactDir =
          typeof body.artifactDir === "string" ? body.artifactDir : undefined;
        const state = await service.startSession({ artifactDir });
        sendJson(response, 201, state);
        return;
      }

      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]!);
        const state = service.getSession(sessionId);
        if (!state) {
          sendJson(response, 404, { error: "Session not found." });
          return;
        }
        sendJson(response, 200, state);
        return;
      }

      const decisionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/decisions$/);
      if (request.method === "POST" && decisionMatch) {
        const sessionId = decodeURIComponent(decisionMatch[1]!);
        const body = parseSubmitDecisionBody(await readJsonBody(request));
        const state: TakeoffViewState = await service.submitReviewDecision({
          sessionId,
          reviewItemId: body.reviewItemId as ReviewItemId,
          value: body.value,
          rationale: body.rationale,
          decisionType: body.decisionType,
        });
        sendJson(response, 200, state);
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("UI request failed", { error: message });
      sendJson(response, 400, { error: message });
    }
  });
}

export function startUiServer(options: { port?: number; host?: string } = {}) {
  const startPort = options.port ?? Number(process.env.TAKEOFF_UI_PORT ?? 3000);
  const host = options.host ?? "127.0.0.1";
  const server = createUiServer();

  const tryListen = (port: number): void => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        tryListen(port + 1);
        return;
      }

      throw error;
    });

    server.listen(port, host, () => {
      server.removeAllListeners("error");
      logger.info("Takeoff UI server listening", { host, port });
      console.log(`Takeoff UI ready at http://${host}:${port}`);
    });
  };

  tryListen(startPort);

  return server;
}
