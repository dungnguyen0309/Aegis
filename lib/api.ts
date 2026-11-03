import type { Assessment, AssessRequest, BatchResult, BatchRowIn, CalcRequest, CalcResult, Memo, Radar, Reference, Registry } from "./types";

/** The backend cannot be reached (server not running, network down or proxy error). */
export class ApiUnavailable extends Error {
  constructor() {
    super(process.env.NODE_ENV === "development"
      ? "The analysis service (FastAPI) is not running. Start the app with npm run dev; this page reconnects on its own."
      : "The analysis service is not responding. This page will reconnect on its own.");
  }
}

/** True when the backend answers its health check. */
export async function healthy(): Promise<boolean> {
  try {
    return (await fetch("/api/health", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      // Live data can take ~15 s (paced UN Comtrade calls); anything past 30 s is stuck
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("The analysis service took too long to answer. Try again.");
    }
    throw new ApiUnavailable();
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    let fromApi = false;
    try {
      const body = await res.json();
      fromApi = "detail" in body;
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* not a FastAPI error body */
    }
    // A bare 5xx with no FastAPI body usually means the backend is down (the dev proxy answers 500)
    if (!fromApi && res.status >= 500 && !(await healthy())) throw new ApiUnavailable();
    throw new Error(fromApi ? detail : `The analysis service returned an error (${detail}). Please try again.`);
  }
  return res.json() as Promise<T>;
}

/**
 * Assessments a hover asked for ahead of the click. The click takes its answer once, so pressing
 * Run again always asks the server; an answer nobody took within a minute is dropped.
 */
const ahead = new Map<string, { at: number; answer: Promise<Assessment> }>();
const AHEAD_MS = 60_000;
const postAssess = (req: AssessRequest) => call<Assessment>("/assess", { method: "POST", body: JSON.stringify(req) });

export const api = {
  reference: () => call<Reference>("/reference"),
  assess: (req: AssessRequest) => {
    const key = JSON.stringify(req);
    const hit = ahead.get(key);
    ahead.delete(key);
    return hit && Date.now() - hit.at < AHEAD_MS ? hit.answer : postAssess(req);
  },
  /** Starts an assessment the user is about to open. Live requests are never started ahead. */
  prefetchAssess: (req: AssessRequest) => {
    const key = JSON.stringify(req);
    const hit = ahead.get(key);
    if (req.live || (hit && Date.now() - hit.at < AHEAD_MS)) return;
    const answer = postAssess(req);
    answer.catch(() => { if (ahead.get(key)?.answer === answer) ahead.delete(key); });
    ahead.delete(key);
    ahead.set(key, { at: Date.now(), answer });
    if (ahead.size > 30) ahead.delete(ahead.keys().next().value!); // oldest first
  },
  memo: (req: AssessRequest) => call<Memo>("/memo", { method: "POST", body: JSON.stringify(req) }),
  radar: (exporter: string) => call<Radar>(`/radar?exporter=${encodeURIComponent(exporter)}`),
  company: (name: string, country: string | null) =>
    call<Registry>(`/company?name=${encodeURIComponent(name)}${country ? `&country=${country}` : ""}`),
  calculate: (req: CalcRequest) => call<CalcResult>("/calculate", { method: "POST", body: JSON.stringify(req) }),
  batch: (rows: BatchRowIn[], exporter: string) =>
    call<BatchResult>("/batch", { method: "POST", body: JSON.stringify({ rows, exporter }) }),
};
