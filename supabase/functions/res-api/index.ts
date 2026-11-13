// Proview Reservations: the shared-data API.
//
// Every device talks to this function, never to the tables. It keeps one JSON document per location
// (pr_site_state) and sends changes between devices as small patches.
//
// Who is calling:
//   1. The Supabase login (Authorization: Bearer <session>) says which business and location it may open
//      (pr_business_members, or the Proview master) and whether the location is licensed.
//   2. An Owner / Admin / Manager login (and the master) gets everything. A Staff login gets the document without
//      pay rates, labour and sales figures and the manager PIN, and cannot change them. On a Staff device a manager
//      types the manager PIN: the PIN is checked HERE (POST api/unlock) and a short-lived token (x-token) then lets
//      that device see and change the manager-only parts until it locks again.
//
// Routes (all under /res-api/, header x-site: <location id>):
//   GET  api/ping      → { proview, rev, hasState, role, master, full }
//   POST api/init      { state }       first upload for an empty location (owner, admin or master only)
//   POST api/unlock    { pin } → { token }      manager PIN on a Staff device
//   POST api/lock                               give the token back
//   GET  api/state     → { rev, state, full }
//   POST api/ops       { base, ops } → { rev, missed, dropped }
//   GET  api/changes?since=N → { rev, ops } | { rev, snapshot }
//
// A patch (op) is one of:
//   { k, set: value }                 replace a top-level field
//   { k, unset: true }                remove it
//   { k, up: [items], del: [ids] }    lists of things with an id (bookings, tables, punches…)
//   { k, mp: {sub: value}, md: [sub] } fields inside an object (table status, guest notes, venue…)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site, x-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const send = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// deno-lint-ignore no-explicit-any
type Any = any;
type Op = { k: string; set?: Any; unset?: boolean; up?: Any[]; del?: Any[]; mp?: Record<string, Any>; md?: string[] };
const isObj = (v: Any) => v && typeof v === "object" && !Array.isArray(v);

function applyOps(st: Any, ops: Op[]) {
  ops.forEach((o) => {
    const k = o.k;
    if (o.unset) { delete st[k]; return; }
    if ("set" in o) { st[k] = o.set; return; }
    if (o.mp || o.md) {
      if (!isObj(st[k])) st[k] = {};
      Object.entries(o.mp || {}).forEach(([s, v]) => { st[k][s] = v; });
      (o.md || []).forEach((s) => { delete st[k][s]; });
      return;
    }
    let arr = st[k]; if (!Array.isArray(arr)) arr = st[k] = [];
    (o.up || []).forEach((x) => { const i = arr.findIndex((y: Any) => y && y.id === x.id); if (i >= 0) arr[i] = x; else arr.push(x); });
    (o.del || []).forEach((id) => { const i = arr.findIndex((y: Any) => y && String(y.id) === String(id)); if (i >= 0) arr.splice(i, 1); });
  });
}

// ---------- What a Staff login never receives ----------
const PIN_MARK = "set";                              // "a manager PIN exists" (the real one is digits, so never equal)
const FC_HIDE = ["spend", "rate", "target", "typical"]; // labour and sales settings
const hideStaff = (x: Any) => (x && typeof x === "object" && "rate" in x) ? { ...x, rate: 0 } : x;
const hideHist = (d: Any) => isObj(d) ? (("c" in d) ? { c: d.c } : {}) : d;
const hideFc = (fc: Any) => { if (!isObj(fc)) return fc; const o = { ...fc }; FC_HIDE.forEach((f) => { if (f in o) o[f] = 0; }); return o; };
function hideVal(k: string, v: Any) {
  if (k === "mgrPin") return v ? PIN_MARK : "";
  if (k === "staff") return Array.isArray(v) ? v.map(hideStaff) : v;
  if (k === "fc") return hideFc(v);
  if (k === "hist") return isObj(v) ? Object.fromEntries(Object.entries(v).map(([d, x]) => [d, hideHist(x)])) : v;
  return v;
}
function viewState(st: Any, full: boolean) {
  if (full) return st;
  const o: Any = {};
  for (const k in st) o[k] = hideVal(k, st[k]);
  return o;
}
function viewOps(ops: Op[], full: boolean) {
  if (full) return ops;
  return ops.map((o) => {
    if ("set" in o) return { k: o.k, set: hideVal(o.k, o.set) };
    if (o.k === "staff" && o.up) return { ...o, up: o.up.map(hideStaff) };
    if (o.k === "fc" && o.mp) return { ...o, mp: hideFc(o.mp) };
    if (o.k === "hist" && o.mp) return { ...o, mp: Object.fromEntries(Object.entries(o.mp).map(([d, x]) => [d, hideHist(x)])) };
    return o;
  });
}
// What a Staff login cannot change: the manager PIN, staff records and pay rates, labour settings, what staff may
// do, the rota. History keeps its sales and labour figures whatever a Staff device sends.
const PROT = new Set(["mgrPin", "staff", "fc", "perm", "rotaSh"]);
function checkOps(st: Any, ops: Op[], full: boolean) {
  if (full) return { ops, dropped: 0 };
  const ok: Op[] = []; let dropped = 0;
  ops.forEach((o) => {
    if (PROT.has(o.k)) { dropped++; return; }
    if (o.k === "hist") {
      if (o.unset || "set" in o) { dropped++; return; }
      const cur = isObj(st.hist) ? st.hist : {}; const mp: Record<string, Any> = {};
      Object.entries(o.mp || {}).forEach(([d, x]) => { const ex = isObj(cur[d]) ? cur[d] : {}; mp[d] = isObj(x) && "c" in x ? { ...ex, c: x.c } : ex; });
      if (Object.keys(mp).length) ok.push({ k: "hist", mp });          // days are never removed by a Staff device
      return;
    }
    ok.push(o);
  });
  return { ops: ok, dropped };
}

// ---------- storage ----------
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const UNLOCK_MIN = 12;       // the app itself locks after 10 minutes of no use

async function loadState(db: SupabaseClient, site: string): Promise<{ rev: number; state: Any | null }> {
  const r = await db.from("pr_site_state").select("rev,data").eq("id", site).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? { rev: Number(r.data.rev), state: r.data.data } : { rev: 0, state: null };
}
async function commit(db: SupabaseClient, site: string, rev: number, state: Any, ops: Op[] | null): Promise<number | null> {
  const r = await db.rpc("pr_state_commit", { p_site: site, p_rev: rev, p_data: state, p_ops: ops });
  if (r.error) throw r.error;
  return r.data == null ? null : Number(r.data);
}
async function logSince(db: SupabaseClient, site: string, since: number, rev: number): Promise<Op[][] | null> {
  if (since >= rev) return [];
  const r = await db.from("pr_site_log").select("rev,ops").eq("site", site).gt("rev", since).order("rev");
  if (r.error) throw r.error;
  const rows = r.data || [];
  // every revision after "since" must be in the log, otherwise the device gets a full copy
  if (rows.length !== rev - since || (rows.length && Number(rows[0].rev) !== since + 1)) return null;
  return rows.map((x) => x.ops as Op[]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/res-api\/?/, "").replace(/\/+$/, "");
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: ud } = await db.auth.getUser(jwt);
    const user = ud?.user;
    if (!user) return send({ error: "auth" }, 401);
    const site = String(req.headers.get("x-site") || "");
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(site)) return send({ error: "site" }, 400);
    const g = await db.rpc("pr_gate", { p_user: user.id, p_site: site });
    if (g.error) throw g.error;
    const gate = g.data as Any;
    if (!gate?.exists || (!gate.master && !gate.role)) return send({ error: "site" }, 403);
    if (!gate.master && !gate.ok) return send({ error: "licence", suspended: !!gate.suspended }, 402);
    const boss = gate.master || gate.role === "Owner" || gate.role === "Admin";
    const body = async () => { try { return await req.json(); } catch (_) { return {}; } };

    // manager PIN unlock on a Staff device
    const tk = req.headers.get("x-token") || "";
    const th = tk ? await sha(tk) : "";
    let unlocked = false;
    if (th) {
      const ss = await db.from("pr_site_sessions").select("exp").eq("token_sha256", th).eq("site", site).eq("user_id", user.id).maybeSingle();
      const left = ss.data ? new Date(ss.data.exp).getTime() - Date.now() : -1;
      unlocked = left > 0;
      if (unlocked && left < (UNLOCK_MIN - 3) * 6e4) {      // still in use: keep it alive
        await db.from("pr_site_sessions").update({ exp: new Date(Date.now() + UNLOCK_MIN * 6e4).toISOString() }).eq("token_sha256", th);
      }
    }
    const full = boss || gate.role === "Manager" || unlocked;

    let { rev, state } = await loadState(db, site);

    if (path === "api/ping") return send({ proview: true, rev, hasState: !!state, role: gate.role, master: !!gate.master, full });

    if (path === "api/init" && req.method === "POST") {
      const b = await body();
      if (!state && b.state) {
        if (!boss) return send({ error: "Only the owner can set this business up." }, 403);
        const nr = await commit(db, site, 0, b.state, null);
        rev = nr || (await loadState(db, site)).rev;
      }
      return send({ rev });
    }
    if (!state) return send({ error: "no state" }, 409);

    if (path === "api/unlock" && req.method === "POST") {
      const b = await body();
      const key = site + "|" + user.id;
      const bl = await db.rpc("pr_pin_blocked", { p_key: key, p_max: 5 });
      if (bl.data) return send({ error: "wait" }, 429);
      if (!state.mgrPin) return send({ error: "nopin" }, 403);
      if (String(b.pin || "").trim() !== String(state.mgrPin)) { await db.rpc("pr_pin_failed", { p_key: key }); return send({ error: "pin" }, 401); }
      const t = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
      await db.from("pr_site_sessions").delete().lt("exp", new Date().toISOString());
      const r = await db.from("pr_site_sessions").insert({ token_sha256: await sha(t), site, pid: "mgr", user_id: user.id, exp: new Date(Date.now() + UNLOCK_MIN * 6e4).toISOString() });
      if (r.error) throw r.error;
      return send({ token: t });
    }
    if (path === "api/lock" && req.method === "POST") { if (th) await db.from("pr_site_sessions").delete().eq("token_sha256", th); return send({ ok: true }); }

    if (path === "api/state" && req.method === "GET") return send({ rev, state: viewState(state, full), full });

    if (path === "api/ops" && req.method === "POST") {
      const b = await body();
      const base = Number(b.base) || 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt) { ({ rev, state } = await loadState(db, site)); if (!state) return send({ error: "no state" }, 409); }
        const chk = checkOps(state, Array.isArray(b.ops) ? b.ops : [], full);
        const ops = chk.ops;
        const log = await logSince(db, site, base, rev);
        const missed = log ? log.map((e) => viewOps(e, full)).filter((x) => x.length) : [];
        const stale = log === null;                       // too far behind: tell the device to reload everything
        if (!ops.length) return send({ rev, missed, dropped: chk.dropped + (stale ? 1 : 0), full });
        applyOps(state, ops);
        const nr = await commit(db, site, rev, state, ops);
        if (!nr) continue;                                // someone else saved first: read again and retry
        return send({ rev: nr, missed, dropped: chk.dropped + (stale ? 1 : 0), full });
      }
      return send({ error: "busy" }, 503);
    }

    if (path === "api/changes" && req.method === "GET") {
      const since = Number(url.searchParams.get("since")) || 0;
      if (since >= rev) return send({ rev, ops: [], full });
      const log = await logSince(db, site, since, rev);
      if (!log) return send({ rev, snapshot: viewState(state, full), full });
      return send({ rev, ops: log.map((e) => viewOps(e, full)).filter((x) => x.length), full });
    }
    return send({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return send({ error: String((e as Error)?.message || e) }, 500);
  }
});
