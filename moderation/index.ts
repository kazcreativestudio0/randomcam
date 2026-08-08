export interface Env {
  MODERATION_DB: D1Database;
  SESSION_HMAC_SECRET: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  MATCHER_INTERNAL_SECRET: string;
  MATCHER_ORIGIN?: string;
}

const DAY = 86_400_000;
// D1 is a database, not an image archive. Keep individual evidence captures small.
const IMAGE_LIMIT = 750_000;
const ALLOWED_ORIGIN = "https://randomcam.kaz-creative-studio0.workers.dev";
type Match = { status: string; partnerId?: string; matchId?: string };
type UploadIntent = {
  id: string; reporter_session_key: string; reported_session_key: string; match_id: string;
  created_at: string; expires_at: string; uploaded_at: string | null; sha256: string | null;
  evidence_blob: ArrayBuffer | null; evidence_content_type: string | null; evidence_size: number | null;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/admin" || url.pathname === "/admin/") return adminPage(request, env);
    if (url.pathname === "/admin/login" && request.method === "POST") return adminLogin(request, env);
    if (url.pathname === "/admin/logout" && request.method === "POST") return adminLogout();
    if (url.pathname.startsWith("/admin/api/")) return adminApi(request, env, url);
    if (url.pathname === "/api/session" && request.method === "POST") return cors(await createSession(request, env));
    if (url.pathname === "/api/reports/upload-intent" && request.method === "POST") return cors(await uploadIntent(request, env));
    if (url.pathname.match(/^\/api\/reports\/upload\/[\w-]+$/) && request.method === "PUT") return cors(await uploadEvidence(request, env, url));
    if (url.pathname === "/api/reports" && request.method === "POST") return cors(await createReport(request, env));
    if (url.pathname === "/cron/cleanup") return new Response("not found", { status: 404 });
    return cors(json({ error: "not found" }, 404));
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> { await cleanup(env); },
};

async function createSession(request: Request, env: Env) {
  const body = await readJson(request); const id = text(body.sessionId, 100);
  if (!id || body.adultConfirmed !== true) return json({ error: "adult confirmation required" }, 400);
  const install = cookie(request, "rc_install") || crypto.randomUUID();
  const [sessionKey, installKey] = await Promise.all([hmac(env.SESSION_HMAC_SECRET, id), hmac(env.SESSION_HMAC_SECRET, install)]);
  if (await isSuspended(env, sessionKey) || await isSuspended(env, installKey)) return json({ error: "suspended" }, 403);
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  if (!cookie(request, "rc_install")) headers.append("set-cookie", `rc_install=${install}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
  return new Response(JSON.stringify({ status: "active" }), { headers });
}

async function uploadIntent(request: Request, env: Env) {
  const body = await readJson(request); const auth = await publicAuth(request, env, body);
  if (auth instanceof Response) return auth;
  const id = crypto.randomUUID(); const now = new Date(); const expires = new Date(now.getTime() + 5 * 60_000);
  await env.MODERATION_DB.prepare("INSERT INTO upload_intents (id,reporter_session_key,reported_session_key,match_id,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .bind(id, auth.reporterKey, auth.reportedKey, auth.matchId, now.toISOString(), expires.toISOString()).run();
  return json({ uploadId: id, uploadUrl: `/api/reports/upload/${id}`, expiresAt: expires.toISOString() });
}

async function uploadEvidence(request: Request, env: Env, url: URL) {
  const id = url.pathname.split("/").pop()!; const intent = await env.MODERATION_DB.prepare("SELECT * FROM upload_intents WHERE id=?").bind(id).first<UploadIntent>();
  if (!intent || intent.uploaded_at || Date.parse(intent.expires_at) < Date.now()) return json({ error: "invalid or expired upload" }, 404);
  const type = request.headers.get("content-type")?.split(";")[0]; const length = Number(request.headers.get("content-length") || 0);
  if (type !== "image/webp" || (length && length > IMAGE_LIMIT)) return json({ error: "WebP evidence under 750 KB required" }, 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > IMAGE_LIMIT) return json({ error: "image too large" }, 413);
  if (!isWebp(bytes)) return json({ error: "invalid WebP image" }, 400);
  const sha = await digest(bytes);
  await env.MODERATION_DB.prepare("UPDATE upload_intents SET uploaded_at=?, sha256=?, evidence_blob=?, evidence_content_type=?, evidence_size=? WHERE id=?")
    .bind(new Date().toISOString(), sha, bytes, type, bytes.byteLength, id).run();
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

async function createReport(request: Request, env: Env) {
  const body = await readJson(request); const auth = await publicAuth(request, env, body);
  if (auth instanceof Response) return auth;
  const uploadId = text(body.uploadId, 80); const reason = text(body.reasonCode, 30); const note = text(body.note, 500) || "";
  if (!uploadId || !["sexual","nudity","harassment","solicitation","minor_concern","other"].includes(reason || "")) return json({ error: "invalid report" }, 400);
  const intent = await env.MODERATION_DB.prepare("SELECT * FROM upload_intents WHERE id=?").bind(uploadId).first<UploadIntent>();
  if (!intent || !intent.uploaded_at || intent.reporter_session_key !== auth.reporterKey || intent.reported_session_key !== auth.reportedKey || intent.match_id !== auth.matchId) return json({ error: "invalid upload" }, 400);
  if (!intent.evidence_blob || intent.evidence_content_type !== "image/webp" || Number(intent.evidence_size) <= 0 || Number(intent.evidence_size) > IMAGE_LIMIT) return json({ error: "evidence unavailable" }, 400);
  const id = crypto.randomUUID(); const now = new Date(); const expiry = new Date(now.getTime() + 30 * DAY).toISOString();
  const result = await env.MODERATION_DB.prepare("INSERT OR IGNORE INTO reports (id,reported_session_key,reporter_session_key,match_id,reason_code,note,evidence_blob,evidence_content_type,evidence_size,evidence_sha256,captured_at,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, auth.reportedKey, auth.reporterKey, auth.matchId, reason, note, intent.evidence_blob, intent.evidence_content_type, Number(intent.evidence_size), intent.sha256, text(body.capturedAt, 40) || now.toISOString(), now.toISOString(), expiry).run();
  if (!result.meta.changes) return json({ error: "already reported this match" }, 409);
  const count = await env.MODERATION_DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE reported_session_key=? AND expires_at>? ").bind(auth.reportedKey, now.toISOString()).first<{ count: number }>();
  let suspended = false;
  if ((count?.count || 0) >= 2) { await suspend(env, auth.reportedKey, "session", "auto_two_reports"); suspended = true; }
  await env.MODERATION_DB.prepare("DELETE FROM upload_intents WHERE id=?").bind(uploadId).run();
  return json({ status: "received", suspended });
}

async function publicAuth(request: Request, env: Env, body: Record<string, unknown>) {
  const sessionId = text(body.sessionId, 100), partnerId = text(body.partnerId, 100), matchId = text(body.matchId, 100), install = cookie(request, "rc_install");
  if (!sessionId || !partnerId || !matchId || !install) return json({ error: "invalid session" }, 401);
  const [reporterKey, reportedKey] = await Promise.all([hmac(env.SESSION_HMAC_SECRET, sessionId), hmac(env.SESSION_HMAC_SECRET, partnerId)]);
  if (await isSuspended(env, reporterKey)) return json({ error: "suspended" }, 403);
  const match = await matcherCheck(env, sessionId);
  if (match.status !== "matched" || match.partnerId !== partnerId || match.matchId !== matchId) return json({ error: "match is no longer active" }, 403);
  return { reporterKey, reportedKey, matchId };
}

async function matcherCheck(env: Env, sessionId: string): Promise<Match> {
  const origin = env.MATCHER_ORIGIN || "https://randomcam-matcher.kaz-creative-studio0.workers.dev";
  const response = await fetch(`${origin}/internal/match`, { method: "POST", headers: { "content-type": "application/json", "x-randomcam-internal": env.MATCHER_INTERNAL_SECRET }, body: JSON.stringify({ sessionId }) });
  return response.ok ? response.json() : { status: "idle" };
}

async function suspend(env: Env, key: string, type: "session" | "install", source: string) { const now = new Date(); const end = new Date(now.getTime() + 30 * DAY); await env.MODERATION_DB.prepare("INSERT OR IGNORE INTO suspensions (id,subject_key,subject_type,status,source,reason,started_at,ends_at) VALUES (?,?,?,'active',?,?,?,?)").bind(crypto.randomUUID(), key, type, source, "Two independent reports received", now.toISOString(), end.toISOString()).run(); }
async function isSuspended(env: Env, key: string) { const now = new Date().toISOString(); const row = await env.MODERATION_DB.prepare("SELECT id FROM suspensions WHERE subject_key=? AND status='active' AND ends_at>? LIMIT 1").bind(key, now).first(); return Boolean(row); }

async function adminLogin(request: Request, env: Env) { const body = await readJson(request); if (text(body.password, 200) !== env.ADMIN_PASSWORD) { await audit(env, "login_failure", null, request); return new Response("Unauthorized", { status: 401 }); } await audit(env, "login_success", null, request); const token = await sign(env.ADMIN_SESSION_SECRET, `${Date.now() + 8 * 60 * 60_000}.kazuma`); return new Response(null, { status: 204, headers: { "set-cookie": `rc_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=28800`, "cache-control": "no-store" } }); }
function adminLogout() { return new Response(null, { status: 204, headers: { "set-cookie": "rc_admin=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0", "cache-control": "no-store" } }); }
async function adminApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await adminAuthed(request, env))) return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  if (url.pathname === "/admin/api/reports" && request.method === "GET") { const rows = await env.MODERATION_DB.prepare("SELECT id,reason_code,created_at,expires_at,review_status, evidence_blob IS NOT NULL AS has_evidence FROM reports WHERE expires_at>? ORDER BY created_at DESC LIMIT 100").bind(new Date().toISOString()).all(); return noStoreJson(rows.results); }
  const evidence = url.pathname.match(/^\/admin\/api\/reports\/([\w-]+)\/evidence$/); if (evidence && request.method === "GET") { const r = await env.MODERATION_DB.prepare("SELECT evidence_blob,evidence_content_type,evidence_size FROM reports WHERE id=? AND expires_at>?").bind(evidence[1], new Date().toISOString()).first<{evidence_blob:ArrayBuffer|null;evidence_content_type:string|null;evidence_size:number|null}>(); if (!r?.evidence_blob || r.evidence_content_type !== "image/webp" || !r.evidence_size || r.evidence_size > IMAGE_LIMIT) return new Response("Not found", { status: 404 }); await audit(env, "view_evidence", evidence[1], request); return new Response(r.evidence_blob, { headers: { "content-type": "image/webp", "content-length": String(r.evidence_size), "cache-control": "no-store, private", "x-content-type-options": "nosniff" } }); }
  const decision = url.pathname.match(/^\/admin\/api\/reports\/([\w-]+)\/decision$/); if (decision && request.method === "POST") { const body = await readJson(request); const action = text(body.action, 10); const note = text(body.note, 1000) || ""; if (action !== "uphold" && action !== "dismiss") return noStoreJson({ error: "invalid decision" }, 400); const report = await env.MODERATION_DB.prepare("SELECT reported_session_key FROM reports WHERE id=?").bind(decision[1]).first<{reported_session_key:string}>(); if (!report) return noStoreJson({error:"not found"},404); const now=new Date().toISOString(); await env.MODERATION_DB.batch([env.MODERATION_DB.prepare("UPDATE reports SET review_status=?, reviewed_at=?, review_note=? WHERE id=?").bind(action === "uphold" ? "upheld" : "dismissed",now,note,decision[1]), action === "dismiss" ? env.MODERATION_DB.prepare("UPDATE suspensions SET status='lifted', lifted_at=?, lifted_by='kazuma' WHERE subject_key=? AND status='active'").bind(now,report.reported_session_key) : env.MODERATION_DB.prepare("UPDATE suspensions SET ends_at=? WHERE subject_key=? AND status='active'").bind(new Date(Date.now()+30*DAY).toISOString(),report.reported_session_key)]); await audit(env, action === "uphold" ? "uphold" : "dismiss", decision[1], request); return noStoreJson({status:"ok"}); }
  return new Response("Not found", {status:404});
}
async function adminAuthed(request:Request,env:Env){const token=cookie(request,"rc_admin");if(!token)return false;const split=token.lastIndexOf(".");if(split<1)return false;const value=token.slice(0,split);const expected=await sign(env.ADMIN_SESSION_SECRET,value);return expected===token && Number(value.split(".")[0])>Date.now();}
async function adminPage(request:Request,env:Env){if(!(await adminAuthed(request,env)))return new Response(loginHtml,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store"}});return new Response(adminHtml,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"}})}
async function cleanup(env:Env){const now=new Date().toISOString();await env.MODERATION_DB.batch([env.MODERATION_DB.prepare("DELETE FROM reports WHERE expires_at<=?").bind(now),env.MODERATION_DB.prepare("DELETE FROM upload_intents WHERE expires_at<=?").bind(now),env.MODERATION_DB.prepare("UPDATE suspensions SET status='expired' WHERE status='active' AND ends_at<=?").bind(now),env.MODERATION_DB.prepare("DELETE FROM admin_audit_logs WHERE created_at<=?").bind(new Date(Date.now()-90*DAY).toISOString())]);}
async function audit(env:Env,action:string,reportId:string|null,request:Request){const ip=request.headers.get("cf-connecting-ip")||"";await env.MODERATION_DB.prepare("INSERT INTO admin_audit_logs (id,admin_id,action,report_id,created_at,ip_hash) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),"kazuma",action,reportId,new Date().toISOString(),ip?await hmac(env.SESSION_HMAC_SECRET,ip):null).run()}
async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));} async function sign(secret:string,value:string){return `${value}.${await hmac(secret,value)}`;} async function digest(bytes:Uint8Array){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));} function bytesToHex(bytes:Uint8Array){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}function isWebp(bytes:Uint8Array){return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"}function cookie(r:Request,n:string){return r.headers.get("cookie")?.match(new RegExp(`(?:^|; )${n}=([^;]+)`))?.[1]}function text(v:unknown,max:number){return typeof v==="string"&&v.length<=max?v.trim():null}async function readJson(r:Request){const x=await r.json().catch(()=>({}));return x&&typeof x==="object"?x as Record<string,unknown>:{};}function json(x:unknown,status=200){return new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}function noStoreJson(x:unknown,status=200){return json(x,status)}function cors(r:Response){const h=new Headers(r.headers);h.set("access-control-allow-origin",ALLOWED_ORIGIN);h.set("access-control-allow-credentials","true");h.set("access-control-allow-methods","POST,PUT,OPTIONS");h.set("access-control-allow-headers","content-type");return new Response(r.body,{status:r.status,headers:h})}
const loginHtml=`<!doctype html><title>RandomCam Admin</title><style>body{font:16px system-ui;max-width:420px;margin:10vh auto;padding:24px}input,button{width:100%;box-sizing:border-box;padding:12px;margin:8px 0}</style><h1>RandomCam Admin</h1><form id=f><input type=password name=password required autofocus placeholder="Password"><button>Sign in</button></form><script>f.onsubmit=async e=>{e.preventDefault();let r=await fetch('/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:f.password.value})});if(r.ok)location='/admin';else alert('Sign-in failed')}</script>`;
const adminHtml=`<!doctype html><title>RandomCam Admin</title><style>body{font:16px system-ui;max-width:900px;margin:30px auto;padding:20px}article{border:1px solid #ddd;padding:14px;margin:10px 0}img{max-width:420px;display:block;margin:12px 0}button{margin-right:8px}</style><h1>RandomCam moderation</h1><button onclick="fetch('/admin/logout',{method:'POST'}).then(()=>location='/admin')">Sign out</button><main>Loading…</main><script>const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));async function load(){let a=await (await fetch('/admin/api/reports')).json();document.querySelector('main').innerHTML=a.map(r=>'<article><b>'+esc(r.reason_code)+'</b> · '+esc(r.review_status)+'<br>'+esc(r.created_at)+'<br>'+(r.has_evidence?'<img src="/admin/api/reports/'+r.id+'/evidence">':'No evidence')+'<p><button onclick="dec(\''+r.id+'\',\'uphold\')">Keep suspension</button><button onclick="dec(\''+r.id+'\',\'dismiss\')">Lift suspension</button></p></article>').join('')||'No active reports.'}async function dec(id,action){let note=prompt('Admin note (optional)')??'';await fetch('/admin/api/reports/'+id+'/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,note})});load()}load()</script>`;
