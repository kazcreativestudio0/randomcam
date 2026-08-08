export interface Env {
  MATCHER: DurableObjectNamespace;
  MATCHER_INTERNAL_SECRET?: string;
}

type Match = { partnerId: string; matchedAt: number; matchId: string };
type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };
type SavedState = {
  waiting: string[];
  matches: Record<string, Match>;
  recentPairs: Record<string, Record<string, number>>;
  signals: Record<string, Signal[]>;
};

export class RandomCamMatcher {
  private ready: Promise<void>;
  private waiting: string[] = [];
  private matches = new Map<string, Match>();
  private history = new Map<string, Record<string, number>>();
  private signals = new Map<string, Signal[]>();

  constructor(private ctx: DurableObjectState) {
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<SavedState>("state");
      if (saved) {
        this.waiting = saved.waiting ?? [];
        this.matches = new Map(Object.entries(saved.matches ?? {}));
        this.history = new Map(Object.entries(saved.recentPairs ?? {}));
        this.signals = new Map(Object.entries(saved.signals ?? {}));
      }
      this.pruneHistory();
      await this.persist();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      partnerId?: string;
      signal?: unknown;
    };
    const sessionId = body.sessionId;
    if (!sessionId || sessionId.length > 100) return json({ error: "invalid session" }, 400);

    if (url.pathname === "/join") {
      const existing = this.matches.get(sessionId);
      if (existing) return json({ status: "matched", ...existing });
      const partnerId = this.waiting.find((id) => id !== sessionId && !this.wasRecentlyMatched(sessionId, id));
      if (partnerId) {
        this.waiting = this.waiting.filter((id) => id !== partnerId && id !== sessionId);
        const matchedAt = Date.now();
        const matchId = crypto.randomUUID();
        this.matches.set(sessionId, { partnerId, matchedAt, matchId });
        this.matches.set(partnerId, { partnerId: sessionId, matchedAt, matchId });
        this.rememberPair(sessionId, partnerId, matchedAt);
        await this.persist();
        return json({ status: "matched", partnerId, matchedAt });
      }
      if (!this.waiting.includes(sessionId)) this.waiting.push(sessionId);
      await this.persist();
      return json({ status: "waiting" });
    }

    if (url.pathname === "/status") {
      const match = this.matches.get(sessionId);
      return json(match ? { status: "matched", ...match } : { status: this.waiting.includes(sessionId) ? "waiting" : "idle" });
    }

    if (url.pathname === "/leave") {
      this.waiting = this.waiting.filter((id) => id !== sessionId);
      const match = this.matches.get(sessionId);
      if (match) {
        this.matches.delete(sessionId);
        this.matches.delete(match.partnerId);
        this.signals.delete(sessionId);
        this.signals.delete(match.partnerId);
      }
      await this.persist();
      return json({ status: "left" });
    }

    if (url.pathname === "/signal/send") {
      const match = this.matches.get(sessionId);
      if (!match || body.partnerId !== match.partnerId) return json({ error: "not matched" }, 403);
      const signal = parseSignal(body.signal);
      if (!signal) return json({ error: "invalid signal" }, 400);

      const queued = this.signals.get(match.partnerId) ?? [];
      // A WebRTC exchange is small. This cap prevents one peer from using the room as storage.
      if (queued.length >= 64) return json({ error: "signal queue full" }, 429);
      queued.push(signal);
      this.signals.set(match.partnerId, queued);
      await this.persist();
      return json({ status: "sent" });
    }

    if (url.pathname === "/signal/poll") {
      if (!this.matches.has(sessionId)) return json({ status: "idle", signals: [] });
      const signals = this.signals.get(sessionId) ?? [];
      this.signals.delete(sessionId);
      await this.persist();
      return json({ status: "matched", signals });
    }
    return json({ error: "not found" }, 404);
  }

  private wasRecentlyMatched(first: string, second: string) {
    const when = this.history.get(first)?.[second];
    return Boolean(when && Date.now() - when < 10 * 60 * 1000);
  }

  private rememberPair(first: string, second: string, when: number) {
    this.history.set(first, { ...this.history.get(first), [second]: when });
    this.history.set(second, { ...this.history.get(second), [first]: when });
    this.pruneHistory();
  }

  private async persist() {
    await this.ctx.storage.put<SavedState>("state", {
      waiting: this.waiting,
      matches: Object.fromEntries(this.matches),
      recentPairs: Object.fromEntries(this.history),
      signals: Object.fromEntries(this.signals),
    });
  }

  private pruneHistory() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [sessionId, partners] of this.history) {
      for (const [partnerId, when] of Object.entries(partners)) if (when < cutoff) delete partners[partnerId];
      if (Object.keys(partners).length === 0) this.history.delete(sessionId);
    }
  }
}

function parseSignal(value: unknown): Signal | null {
  if (!value || typeof value !== "object") return null;
  const signal = value as { type?: unknown; sdp?: unknown; candidate?: unknown };
  if (signal.type === "offer" || signal.type === "answer") {
    if (!signal.sdp || typeof signal.sdp !== "object") return null;
    const sdp = signal.sdp as RTCSessionDescriptionInit;
    if ((sdp.type !== "offer" && sdp.type !== "answer") || typeof sdp.sdp !== "string" || sdp.sdp.length > 100_000) return null;
    return { type: signal.type, sdp };
  }
  if (signal.type === "ice") {
    if (!signal.candidate || typeof signal.candidate !== "object") return null;
    const candidate = signal.candidate as RTCIceCandidateInit;
    if (typeof candidate.candidate !== "string" || candidate.candidate.length > 4_000) return null;
    return { type: "ice", candidate };
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    if (url.pathname === "/internal/match") {
      if (!env.MATCHER_INTERNAL_SECRET || request.headers.get("x-randomcam-internal") !== env.MATCHER_INTERNAL_SECRET) return json({ error: "forbidden" }, 403);
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      const body = await request.json().catch(() => ({})) as { sessionId?: string };
      const sessionId = body.sessionId;
      if (!sessionId || sessionId.length > 100) return json({ error: "invalid session" }, 400);
      const stub = env.MATCHER.getByName("global-waiting-room");
      return stub.fetch(new Request(new URL("/status", request.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) }));
    }
  if (!url.pathname.startsWith("/match/")) return cors(json({ error: "not found" }, 404));
    if (request.method !== "POST") return cors(json({ error: "method not allowed" }, 405));
    const stub = env.MATCHER.getByName("global-waiting-room");
    return cors(await stub.fetch(new Request(new URL(url.pathname.replace("/match", ""), request.url), request)));
  },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function cors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "https://randomcam.kaz-creative-studio0.workers.dev");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(response.body, { status: response.status, headers });
}
