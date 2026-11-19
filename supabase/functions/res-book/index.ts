// Proview Reservations: the public booking page's API.
//
// Guests are not signed in. This function is the only thing the booking page (book/index.html) talks to,
// and it never sends guest details, bookings or staff data back: only the venue name, its online rules and
// which times are free.
//
// Routes (all under /res-book, ?v=<location id>):
//   GET  ?v=…&a=info                       → { name, on, label, msg, maxParty, ahead, mkTick, today, look }
//   GET  ?v=…&a=slots&date=YYYY-MM-DD&size=N → { date, size, why, times: ["18:00", …] }
//   POST ?v=…&a=book  { date, time, size, name, phone, email, notes, mk } → { ok, ref, confirm, name, date, time, size }
//
// The free times are worked out with the same rules as the "Try it" box on the Widget page of the app
// (availSlots in the app): opening hours, special days, stay length, notice, days ahead, last booking before
// closing, guests per time, tables kept back for walk-ins, rooms offered online, joined and split tables.
// A booking is written into the location's document the same way a device writes it (pr_state_commit), so it
// shows on every signed-in device straight away.
//
// Deploy with verify_jwt = false (guests have no login).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const send = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// deno-lint-ignore no-explicit-any
type Any = any;

// ---------- time in the venue's time zone (the app's venues are in the UK) ----------
const TZ = "Europe/London";
function nowParts() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p: Record<string, string> = {}; f.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { today: `${p.year}-${p.month}-${p.day}`, nowMin: +p.hour * 60 + +p.minute };
}

// ---------- the app's own availability rules, with the document passed in ----------
const pad = (n: number) => String(n).padStart(2, "0");
const m = (t: string) => { const a = String(t).split(":"); return +a[0] * 60 + +a[1]; };
const hm = (x: number) => pad(Math.floor(x / 60)) + ":" + pad(x % 60);
const addD = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d: string) => (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
const OBD = { on: false, step: 30, maxParty: 8, notice: 2, ahead: 60, lastBefore: 60, cap: 0, hold: 0, confirm: "auto", msg: "", label: "Book a table", rooms: null as string[] | null };
const PL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rules(S: Any, today: string, nowMin: number) {
  const v = S.venue || {};
  const parties: Any[] = Array.isArray(S.parties) ? S.parties : [];
  const tables: Any[] = Array.isArray(S.tables) ? S.tables : [];
  const OB = () => Object.assign({}, OBD, v.ob || {});
  const wk = () => (Array.isArray(v.hrs) && v.hrs.length === 7 ? v.hrs : Array.from({ length: 7 }, () => ({ o: v.open || "09:00", c: v.close || "22:00", x: false })));
  const hoursFor = (d: string) => {
    const e = (v.exc || []).find((x: Any) => x.d === d);
    if (e) return { open: e.o || v.open || "09:00", close: e.c || v.close || "22:00", closed: !!e.x, note: e.n || "" };
    const h = wk()[dow(d)]; return { open: h.o, close: h.c, closed: !!h.x, note: "" };
  };
  const durFor = (n: number) => (v.bigDur > 0 && n >= v.bigFrom ? v.bigDur : v.dur);
  const onT = (p: Any, id: string) => p.table === id || (p.join || []).includes(id);
  const occEnd = (p: Any) => { const e = m(p.time) + p.dur; return p.status === "seated" && p.date === today ? Math.max(e, nowMin + 5) : e; };
  const occStart = (p: Any) => (p.status === "seated" && p.date === today ? Math.min(m(p.time), nowMin) : m(p.time));
  const free = (tid: string, date: string, st: number, du: number, part?: number) =>
    !parties.some((p) => onT(p, tid) && p.date === date && (part == null || p.part == null || p.part === part) && (p.status === "booked" || p.status === "seated") && st < occEnd(p) && occStart(p) < st + du);
  const tmax = (t: Any) => (t.max > 0 ? t.max : t.seats + (v.over == null || v.over === "" || isNaN(+v.over) ? 1 : Math.max(0, +v.over)));
  const tmin = (t: Any) => (t.min > 0 ? t.min : 1);
  const COMB = () => (S.combos || []).filter((c: Any) => c.ids && c.ids.length > 1 && c.ids.every((id: string) => tables.some((t) => t.id === id)));
  const tbn = (id: string) => (tables.find((t) => t.id === id) || { name: "?" }).name;
  const cseats = (c: Any) => c.ids.reduce((a: number, id: string) => a + tables.find((t) => t.id === id).seats, 0);
  const cmax = (c: Any) => (c.max > 0 ? c.max : cseats(c));
  const cmin = (c: Any) => (c.min > 0 ? c.min : Math.max(...c.ids.map((id: string) => tmax(tables.find((t) => t.id === id)))) + 1);
  const cname = (c: Any) => c.ids.map(tbn).join(" + ");
  const SPL = () => (S.splits || []).filter((x: Any) => x.parts && x.parts.length > 1 && tables.some((t) => t.id === x.tid));
  const partUnits = (x: Any, t: Any) => x.parts.map((n: number, k: number) => ({ ids: [t.id], name: t.name + " " + PL[k], min: 1, max: n, seats: n, area: t.area || "Main room", combo: false, part: k }));
  const unitsFor = (date: string) => {
    const sp = SPL().filter((x: Any) => date >= x.from && date <= x.to), sids = sp.map((x: Any) => x.tid), out: Any[] = [];
    tables.forEach((t) => { const x = sp.find((y: Any) => y.tid === t.id); if (x) partUnits(x, t).forEach((u: Any) => out.push(u)); else out.push({ ids: [t.id], name: t.name, min: tmin(t), max: tmax(t), seats: t.seats, area: t.area || "Main room", combo: false }); });
    COMB().filter((c: Any) => !c.ids.some((id: string) => sids.includes(id))).forEach((c: Any) => out.push({ ids: c.ids.slice(), name: cname(c), min: cmin(c), max: cmax(c), seats: cseats(c), area: (tables.find((t) => t.id === c.ids[0]).area) || "Main room", combo: true }));
    return out;
  };
  const uFit = (u: Any, n: number) => n >= u.min && n <= u.max;
  const uFree = (u: Any, date: string, st: number, du: number) => u.ids.every((id: string) => free(id, date, st, du, u.part));

  // The same checks, in the same order, as availSlots in the app. `unit` is the table the guest would get.
  function availSlots(date: string, size: number) {
    const o = OB(), h = hoursFor(date), r: { date: string; size: number; why: string; code: string; slots: { t: string; ok: boolean; why: string; unit?: Any }[] } = { date, size, why: "", code: "", slots: [] };
    if (h.closed) { r.code = "closed"; r.why = "Closed" + (h.note ? " (" + h.note + ")" : ""); return r; }
    if (date < today) { r.code = "past"; r.why = "That date has passed"; return r; }
    if (date > addD(today, o.ahead)) { r.code = "ahead"; r.why = "More than " + o.ahead + " days ahead"; return r; }
    if (!(size > 0)) { r.code = "size"; r.why = "Enter a party size"; return r; }
    if (size > o.maxParty) { r.code = "big"; r.why = "Over the online limit of " + o.maxParty + " guests. Guests would be asked to phone"; return r; }
    const du = durFor(size), op = m(h.open), cl = m(h.close), earliest = date === today ? nowMin + o.notice * 60 : -1, rs = o.rooms;
    const step = Math.max(5, +o.step || 30);
    for (let x = op; x <= cl - o.lastBefore; x += step) {
      let ok = true, why = "", unit: Any;
      if (x < earliest) { ok = false; why = "too soon"; }
      else if (o.cap > 0 && parties.filter((p) => p.date === date && p.time === hm(x) && p.status !== "cancelled" && p.status !== "noshow").reduce((a, p) => a + p.size, 0) + size > o.cap) { ok = false; why = "slot full"; }
      else {
        const fu = unitsFor(date).filter((u) => uFit(u, size) && uFree(u, date, x, du) && (!rs || rs.includes(u.area)));
        if (!fu.length) { ok = false; why = "no table"; }
        else if (o.hold > 0) { const fr = unitsFor(date).filter((u) => !u.combo && uFree(u, date, x, du) && (!rs || rs.includes(u.area))).length; if (fr - fu[0].ids.length < o.hold) { ok = false; why = "kept for walk-ins"; } }
        // the app's own choice of table for a party (auto): a table that seats them, single tables first, smallest first
        if (ok) unit = fu.slice().sort((a, b) => (+(size > a.seats) - +(size > b.seats)) || (+a.combo - +b.combo) || (a.seats - b.seats))[0];
      }
      r.slots.push({ t: hm(x), ok, why, unit });
    }
    if (!r.slots.length) { r.code = "hours"; r.why = "No times fit inside opening hours"; }
    return r;
  }
  return { OB, availSlots, durFor };
}

// What the guest reads when a day has no times.
function guestWhy(r: Any, o: Any) {
  if (r.code === "closed") return "We are closed that day. Please choose another date.";
  if (r.code === "past") return "That date has passed. Please choose another date.";
  if (r.code === "ahead") return "We take online bookings up to " + o.ahead + " days ahead. Please choose an earlier date.";
  if (r.code === "size") return "Please enter how many guests.";
  if (r.code === "big") return "For more than " + o.maxParty + " guests please contact us directly.";
  if (r.code === "hours") return "There are no online times that day. Please choose another date.";
  return "";
}

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const clean = (v: unknown, max: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const normPh = (x: string) => { let d = String(x || "").replace(/\D/g, ""); if (d.startsWith("0044")) d = "0" + d.slice(4); else if (d.startsWith("440")) d = d.slice(2); else if (d.startsWith("44") && d.length >= 11) d = "0" + d.slice(2); return d.length >= 7 ? d : ""; };
const gkeyOf = (ph: string, n: string) => normPh(ph) || (ph || n).toLowerCase();
// The venue's look for the booking page: only known values are passed on.
function lookOf(o: Any) {
  const L = (o && o.look) || {}, hex = (x: unknown) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : "");
  return { mode: L.mode === "dark" ? "dark" : "light", accent: hex(L.accent), bg: hex(L.bg), corners: L.corners === "square" || L.corners === "pill" ? L.corners : "round" };
}
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + "T12:00:00Z").getTime());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url), q = url.searchParams;
    const site = String(q.get("v") || "").toLowerCase(), a = q.get("a") || "info";
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(site)) return send({ error: "notfound", message: "This booking link is not right. Please check it with the venue." }, 404);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const g = await db.rpc("pr_gate", { p_user: "00000000-0000-0000-0000-000000000000", p_site: site });
    if (g.error) throw g.error;
    if (!g.data || !g.data.exists) return send({ error: "notfound", message: "This booking link is not right. Please check it with the venue." }, 404);
    const load = async () => { const r = await db.from("pr_site_state").select("rev,data").eq("id", site).maybeSingle(); if (r.error) throw r.error; return r.data; };
    let row = await load();
    const name = (row && row.data && row.data.venue && row.data.venue.name) || g.data.site_name || "";
    const off = (extra: Record<string, unknown> = {}) => send({ name, on: false, look: lookOf(row && row.data && row.data.venue && row.data.venue.ob), message: "Online booking is not available at the moment. Please contact us directly.", ...extra });
    if (!g.data.ok || !row || !row.data) return a === "book" ? send({ error: "off", message: "Online booking is not available at the moment. Please contact us directly." }, 403) : off();

    const { today, nowMin } = nowParts();
    let R = rules(row.data, today, nowMin), o = R.OB();
    const featOff = row.data.venue && row.data.venue.feat && row.data.venue.feat.online === false;
    const on = !!o.on && !featOff;

    if (a === "info") {
      if (!on) return off();
      return send({ name, on: true, label: o.label || "Book a table", msg: o.msg || "", maxParty: o.maxParty, ahead: o.ahead, confirm: o.confirm, mkTick: row.data.venue.mkTick !== false, today, look: lookOf(o) });
    }

    if (a === "slots") {
      if (!on) return off();
      const date = String(q.get("date") || ""), size = Math.round(+(q.get("size") || 0));
      if (!isDate(date)) return send({ error: "bad", message: "Please choose a date." }, 400);
      const r = R.availSlots(date, size);
      const times = r.slots.filter((s) => s.ok).map((s) => s.t);
      const why = guestWhy(r, o) || (times.length ? "" : "Sorry, there are no tables free online that day for " + size + (size === 1 ? " guest" : " guests") + ". Please try another date or contact us directly.");
      return send({ date, size, times, why });
    }

    if (a === "book" && req.method === "POST") {
      if (!on) return send({ error: "off", message: "Online booking is not available at the moment. Please contact us directly." }, 403);
      const b = await req.json().catch(() => ({}));
      if (clean(b.website, 200)) return send({ ok: true, ref: uid().slice(0, 6).toUpperCase() }); // a field people never see: only robots fill it in
      const date = String(b.date || ""), time = String(b.time || ""), size = Math.round(+b.size || 0);
      const gname = clean(b.name, 80), phone = clean(b.phone, 30), email = clean(b.email, 120).toLowerCase(), notes = clean(b.notes, 300);
      if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return send({ error: "bad", message: "Please choose a date and time." }, 400);
      if (gname.length < 2) return send({ error: "bad", message: "Please enter your name." }, 400);
      if (!normPh(phone)) return send({ error: "bad", message: "Please enter a phone number we can reach you on." }, 400);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send({ error: "bad", message: "That email address does not look right." }, 400);

      // no more than 8 bookings in ten minutes from one connection
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown", key = "book:" + site + ":" + ip;
      const bl = await db.rpc("pr_pin_blocked", { p_key: key, p_max: 8 });
      if (bl.data === true) return send({ error: "busy", message: "Too many bookings from this connection. Please wait ten minutes or contact us directly." }, 429);

      for (let tryN = 0; tryN < 5; tryN++) {
        if (tryN) { row = await load(); if (!row || !row.data) break; R = rules(row.data, today, nowMin); o = R.OB(); }
        const S = row!.data, parties: Any[] = Array.isArray(S.parties) ? S.parties : [];
        // pressed twice: the same phone at the same time is the booking they already have
        const same = parties.find((p) => p.date === date && p.time === time && normPh(p.phone) === normPh(phone) && p.status === "booked");
        if (same) return send({ ok: true, ref: String(same.id).slice(0, 6).toUpperCase(), confirm: o.confirm, name, date, time, size: same.size });
        const r = R.availSlots(date, size), slot = r.slots.find((s) => s.t === time);
        if (!slot || !slot.ok || !slot.unit) return send({ error: "gone", message: guestWhy(r, o) || "Sorry, that time has just been taken. Please choose another time." }, 409);
        const u = slot.unit, ask = o.confirm === "request";
        const p: Any = { id: uid(), name: gname, phone, size, date, time, dur: R.durFor(size), table: u.ids[0], status: "booked", notes: (ask ? "Online request: please confirm with the guest. " : "") + notes, email, src: "Website", tags: [], web: Date.now() };
        if (u.ids.length > 1) p.join = u.ids.slice(1);
        if (u.part != null) p.part = u.part;
        if (ask) p.req = 1;
        const ops: Any[] = [{ k: "parties", up: [p] }];
        parties.push(p); S.parties = parties;
        if (b.mk === false) { // did not tick "offers by email": keep them off the marketing list
          const k = gkeyOf(phone, gname); if (!S.mkoff || typeof S.mkoff !== "object" || Array.isArray(S.mkoff)) S.mkoff = {};
          S.mkoff[k] = true; ops.push({ k: "mkoff", mp: { [k]: true } });
        }
        const c = await db.rpc("pr_state_commit", { p_site: site, p_rev: row!.rev, p_data: S, p_ops: ops });
        if (c.error) throw c.error;
        if (c.data != null) {
          await db.rpc("pr_pin_failed", { p_key: key });
          return send({ ok: true, ref: p.id.slice(0, 6).toUpperCase(), confirm: o.confirm, name, date, time, size });
        }
        // someone else saved in between: read again and re-check the time
      }
      return send({ error: "busy", message: "We could not save your booking just now. Please try again." }, 503);
    }
    return send({ error: "bad" }, 400);
  } catch (e) {
    console.error(e);
    return send({ error: "server", message: "Something went wrong. Please try again." }, 500);
  }
});
