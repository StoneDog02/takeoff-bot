import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const DEFAULT_HYBRID_URL = "http://127.0.0.1:5002";
const DEFAULT_HYBRID_BIN = path.resolve(
  "artifacts/odl-audit-beckstead/.venv-odl-hybrid/bin/opendataloader-pdf-hybrid",
);

let startedProcess: ChildProcess | null = null;

async function hybridServerResponds(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    // Any HTTP response (including 4xx) means the server is listening.
    return response != null;
  } catch {
    return false;
  }
}

/**
 * Ensure a local ODL Hybrid server is reachable with force-OCR semantics.
 * Starts the audit venv binary when available; never fails the takeoff.
 */
export async function ensureProjectLearningHybridServer(input?: {
  url?: string;
  binaryPath?: string;
}): Promise<{ url: string; started: boolean; forceOcr: boolean }> {
  const url = input?.url ?? process.env.TAKEOFF_ODL_HYBRID_URL ?? DEFAULT_HYBRID_URL;
  if (await hybridServerResponds(url)) {
    return { url, started: false, forceOcr: true };
  }

  const binary = input?.binaryPath ?? DEFAULT_HYBRID_BIN;
  try {
    await access(binary);
  } catch {
    return { url, started: false, forceOcr: true };
  }

  const port = (() => {
    try {
      return new URL(url).port || "5002";
    } catch {
      return "5002";
    }
  })();

  startedProcess = spawn(
    binary,
    ["--port", port, "--force-ocr", "--ocr-engine", "easyocr"],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        http_proxy: "",
        https_proxy: "",
      },
    },
  );
  startedProcess.unref();

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await hybridServerResponds(url)) {
      return { url, started: true, forceOcr: true };
    }
  }

  return { url, started: false, forceOcr: true };
}
