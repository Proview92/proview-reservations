// Proview Reservations: the public booking page's API.
//
// Guests are not signed in. This function is the only thing the booking page (book/index.html) talks to,
// and it never sends guest details, bookings or staff data back: only the venue name, its online rules and
// which times are free.
//
// Routes (all under /res-book, ?v=<location id>):
//   GET  ?v=…&a=info                       → { name, on, label, msg, maxParty, ahead, mkTick (always false: the offers box is never pre-ticked), priv, today, look }
//   GET  ?v=…&a=slots&date=YYYY-MM-DD&size=N → { date, size, why, times: ["18:00", …] }
//   POST ?v=…&a=book  { date, time, size, name, phone, email, notes, mk } → { ok, ref, confirm, name, date, time, size }
//   POST ?v=…&a=find  { ref, email }   → the guest's own booking (needs the reference AND the email it was made with)
//   POST ?v=…&a=amend { ref, email, action: "change" | "cancel", date, time, size } → the changed booking, or cancelled
//
// Emails (confirmation, change, cancel, event, table alert) go out through Resend as the venue: see "who a venue's emails come from".
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
const OBD = { on: false, step: 30, maxParty: 8, notice: 2, ahead: 60, lastBefore: 60, cap: 0, hold: 0, confirm: "auto", msg: "", label: "Book a table", rooms: null as string[] | null, pick: "" };
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
  function availSlots(date: string, size: number, room = "") {
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
        // tables ticked "Walk-in only" are never offered online
        const wo = (u: Any) => u.ids.some((id: string) => (tables.find((t) => t.id === id) || {}).wo);
        const fu = unitsFor(date).filter((u) => uFit(u, size) && uFree(u, date, x, du) && (!rs || rs.includes(u.area)) && (!room || u.area === room) && !wo(u));
        if (!fu.length) { ok = false; why = "no table"; }
        else if (o.hold > 0) { const fr = unitsFor(date).filter((u) => !u.combo && uFree(u, date, x, du) && (!rs || rs.includes(u.area)) && !wo(u)).length; if (fr - fu[0].ids.length < o.hold) { ok = false; why = "kept for walk-ins"; } }
        // the app's own choice of table for a party (auto): a table that seats them, single tables first, smallest first
        if (ok) unit = fu.slice().sort((a, b) => (+(size > a.seats) - +(size > b.seats)) || (+a.combo - +b.combo) || (a.seats - b.seats))[0];
      }
      r.slots.push({ t: hm(x), ok, why, unit });
    }
    if (!r.slots.length) { r.code = "hours"; r.why = "No times fit inside opening hours"; }
    return r;
  }
  // Rooms the guest may choose between on the booking page: only when the venue switched this on and has two or more rooms online.
  const pickRooms = () => {
    const o = OB(); if (o.pick !== "opt" && o.pick !== "must") return [] as string[];
    const out: string[] = [];
    (Array.isArray(S.rooms) ? S.rooms : []).concat(tables.map((t) => t.area || "Main room")).forEach((a: string) => { if (!out.includes(a) && tables.some((t) => (t.area || "Main room") === a && !t.wo) && (!o.rooms || o.rooms.includes(a))) out.push(a); });
    return out.length > 1 ? out : [];
  };
  const areaOf = (tid: string) => { const t = tables.find((x) => x.id === tid); return t ? t.area || "Main room" : ""; };
  return { OB, availSlots, durFor, pickRooms, areaOf };
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
// What the booking page tells guests about their details: the venue's own policy link and contact email
// (Widget page), and how long guest details are kept (Settings, 0 = until deleted).
function privOf(S: Any) {
  const v = (S && S.venue) || {}, P = (v.ob && v.ob.priv) || {}, url = clean(P.url, 300), email = clean(P.email || (v.mail && v.mail.addr) || "", 120).toLowerCase(), k = Math.round(+v.keep || 0);
  return { url: /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "", email: /^[^@\s"'<>]+@[^@\s"'<>]+\.[^@\s"'<>]+$/.test(email) ? email : "", keep: k >= 6 && k <= 120 ? k : 0 };
}
function lookOf(o: Any) {
  const L = (o && o.look) || {}, hex = (x: unknown) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : "");
  // pictures uploaded on the Widget page: only addresses in this project's own public bucket are passed on
  const pic = (x: unknown) => (typeof x === "string" && x.length < 300 && x.startsWith((Deno.env.get("SUPABASE_URL") || "") + "/storage/v1/object/public/pr-media/") && /^[\w\-./:]+$/.test(x) ? x : "");
  return { logo: pic(L.logo), header: pic(L.header), bgimg: pic(L.bgimg), addr: clean(L.addr, 160), menu: /^https:\/\/[^\s"'<>]{4,290}$/i.test(String(L.menu || "")) ? String(L.menu) : "", about: String(L.about == null ? "" : L.about).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 700), map: L.map === "off" ? "off" : "", alert: L.alert === "on" ? "on" : "", mode: L.mode === "dark" ? "dark" : "light", accent: hex(L.accent), bg: hex(L.bg), corners: L.corners === "square" || L.corners === "pill" ? L.corners : "round", style: L.style === "elegant" || L.style === "show" ? L.style : "", layout: L.layout === "wide" || L.layout === "stack" ? L.layout : "", size: L.size === "s" || L.size === "l" ? L.size : "" };
}
const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const t12 = (t: string) => { const h = +t.slice(0, 2); return ((h + 11) % 12 + 1) + ":" + t.slice(3) + (h < 12 ? "am" : "pm"); };
const dayLong = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const refOf = (p: Any) => String(p.id).slice(0, 6).toUpperCase();
// ---------- who a venue's emails come from, and where replies go ----------
// Every email to a guest carries the venue's own name, and replies go to the venue's own address (Settings, Emails to guests).
//  - If the venue's email domain has been added and verified in the Resend account, the email is sent FROM the venue's own
//    address (for example bookings@bellapizza.co.uk).
//  - Otherwise (domain not verified, or a Gmail / Outlook style address, which nobody but Google or Microsoft may send from)
//    it is sent from the shared address in RES_MAIL_FROM with the venue's name, and Reply-To is the venue's address.
// Secrets: RESEND_API_KEY and RES_MAIL_FROM (for example "Proview Reservations <bookings@proviewcrm.co.uk>").
// Without them nothing is sent and bookings work as before.
type Who = { name: string; addr: string };
const MAIL_OK = /^[^@\s"'<>,;]+@[^@\s"'<>,;]+\.[^@\s"'<>,;]+$/;
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|rocketmail|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|zoho|btinternet|btopenworld|sky|talktalk|virginmedia|ntlworld|blueyonder|tiscali|o2|orange)\.[a-z.]+$/i;
const notOurs = new Map<string, number>(); // domains Resend refused to send from, remembered for an hour
function mailWho(S: Any, fallbackName: string): Who {
  const v = (S && S.venue) || {}, a = clean((v.mail && v.mail.addr) || (v.ob && v.ob.priv && v.ob.priv.email) || "", 120).toLowerCase();
  return { name: clean(v.name || fallbackName, 80).replace(/[<>"\\,;:@]/g, " ").replace(/\s+/g, " ").trim(), addr: MAIL_OK.test(a) ? a : "" };
}
// Sends one email. Returns "own" (sent from the venue's address), "shared" (shared address, replies to the venue) or false.
async function mail(to: string, subject: string, html: string, text: string, who?: Who): Promise<false | "own" | "shared"> {
  const key = Deno.env.get("RESEND_API_KEY"), shared = Deno.env.get("RES_MAIL_FROM");
  if (!key || !shared || !to) return false;
  const sharedAddr = ((/<([^>]+)>/.exec(shared) || [])[1] || shared).trim(), nm = (who && who.name) || "", own = (who && who.addr) || "", dom = own.split("@")[1] || "";
  const post = async (from: string) => {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html, text, ...(own ? { reply_to: own } : {}) }) });
    if (!r.ok) console.error("mail failed", from, r.status, await r.text());
    return r;
  };
  try {
    if (own && !FREE_MAIL.test(own) && !((notOurs.get(dom) || 0) > Date.now())) {
      const r = await post(`${nm || "Bookings"} <${own}>`);
      if (r.ok) return "own";
      if (r.status === 429 || r.status >= 500) return false;       // Resend is busy: do not hide that behind the shared address
      notOurs.set(dom, Date.now() + 36e5);                         // the domain is not verified for sending: use the shared address
    }
    const r = await post(nm ? `${nm} <${sharedAddr}>` : shared);
    return r.ok ? "shared" : false;
  } catch (e) { console.error("mail error", e); return false; }
}
// kind: "new" | "request" | "changed" | "cancelled"
function bookingMail(kind: string, venue: string, site: string, p: Any, extra: string, area = "") {
  const ref = refOf(p), link = (Deno.env.get("RES_APP_URL") || "https://reservations.proviewcrm.co.uk") + "/book/?v=" + encodeURIComponent(site) + "&ref=" + ref;
  const head = kind === "cancelled" ? "Your booking is cancelled" : kind === "changed" ? "Your booking has been changed" : kind === "request" ? "We have your booking request" : "Your booking is confirmed";
  const when = dayLong(p.date) + " at " + t12(p.time), who = p.size + (p.size === 1 ? " guest" : " guests");
  const lines = [head + " at " + venue + ".", "", when, who, ...(area ? ["Area: " + area] : []), "Reference: " + ref, "", ...(extra ? [extra, ""] : []),
    ...(kind === "cancelled" ? ["We hope to see you another time."] : ["Need to change or cancel? Open " + link + " and use your reference " + ref + " with this email address."])];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1b;max-width:520px"><h2 style="margin:0 0 12px">${esc(head)}</h2><p style="margin:0 0 4px"><b>${esc(venue)}</b></p><p style="margin:0">${esc(when)}<br>${esc(who)}${area ? "<br>" + esc(area) : ""}</p><p style="margin:14px 0;padding:10px 14px;background:#f3eee6;border-radius:8px">Your reference: <b style="font-size:20px;letter-spacing:.1em">${ref}</b></p>${extra ? `<p style="margin:0 0 14px">${esc(extra)}</p>` : ""}${kind === "cancelled" ? "<p>We hope to see you another time.</p>" : `<p style="margin:0">Need to change or cancel? <a href="${esc(link)}">Manage your booking</a>. You will be asked for your reference and this email address.</p>`}</div>`;
  return { subject: head + " · " + venue, html, text: lines.join("\n") };
}
// ---------- events (set up on the Widget page): what guests see, and the confirmation ----------
const picUrl = (x: unknown) => (typeof x === "string" && x.length < 300 && x.startsWith((Deno.env.get("SUPABASE_URL") || "") + "/storage/v1/object/public/pr-media/") && /^[\w\-./:]+$/.test(x) ? x : "");
const evTaken = (S: Any, id: string) => (Array.isArray(S.evb) ? S.evb : []).filter((b: Any) => b && b.eid === id && b.status !== "cancelled").reduce((a: number, b: Any) => a + (+b.n || 0), 0);
const evGood = (e: Any, today: string) => e && e.id && !e.hide && isDate(String(e.date)) && e.date >= today && clean(e.title, 80);
function evPublic(S: Any, today: string) {
  return (Array.isArray(S.events) ? S.events : []).filter((e: Any) => evGood(e, today)).sort((a: Any, b: Any) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))).slice(0, 30)
    .map((e: Any) => ({ id: String(e.id), title: clean(e.title, 80), date: e.date, start: /^\d{2}:\d{2}$/.test(e.start || "") ? e.start : "", end: /^\d{2}:\d{2}$/.test(e.end || "") ? e.end : "", desc: String(e.desc == null ? "" : e.desc).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 600), price: clean(e.price, 120), img: picUrl(e.img), left: +e.places > 0 ? Math.max(0, Math.round(+e.places) - evTaken(S, e.id)) : null }));
}
function eventMail(venue: string, e: Any, b: Any) {
  const head = "Your places are booked", when = dayLong(e.date) + (e.start ? " at " + t12(e.start) + (e.end ? " to " + t12(e.end) : "") : ""), who = b.n + (b.n === 1 ? " place" : " places"), ref = refOf(b);
  const text = [head + " at " + venue + ".", "", e.title, when, who, ...(e.price ? [e.price] : []), "Reference: " + ref, "", "Need to change or cancel? Please contact " + venue + " directly and quote your reference."].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1b;max-width:520px"><h2 style="margin:0 0 12px">${esc(head)}</h2><p style="margin:0 0 4px"><b>${esc(venue)}</b></p><p style="margin:0"><b>${esc(e.title)}</b><br>${esc(when)}<br>${esc(who)}${e.price ? "<br>" + esc(e.price) : ""}</p><p style="margin:14px 0;padding:10px 14px;background:#f3eee6;border-radius:8px">Your reference: <b style="font-size:20px;letter-spacing:.1em">${ref}</b></p><p style="margin:0">Need to change or cancel? Please contact ${esc(venue)} directly and quote your reference.</p></div>`;
  return { subject: head + " \u00b7 " + e.title + " \u00b7 " + venue, html, text };
}
// "A table has come free": sent to a guest who pressed Alert me.
function alertMail(venue: string, site: string, al: Any, first: string) {
  const link = (Deno.env.get("RES_APP_URL") || "https://reservations.proviewcrm.co.uk") + "/book/?v=" + encodeURIComponent(site) + "&date=" + al.date + "&size=" + al.size;
  const head = "A table has come free", when = dayLong(al.date), who = al.size + (al.size === 1 ? " guest" : " guests");
  const text = [head + " at " + venue + ".", "", when + ", " + who + (al.room ? ", " + al.room : ""), "Earliest time free: " + t12(first), "", "Book it here before it goes: " + link, "", "Tables are first come, first served, so it may be taken by the time you look."].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1b;max-width:520px"><h2 style="margin:0 0 12px">${esc(head)}</h2><p style="margin:0 0 4px"><b>${esc(venue)}</b></p><p style="margin:0">${esc(when)}<br>${esc(who)}${al.room ? "<br>" + esc(al.room) : ""}<br>Earliest time free: <b>${esc(t12(first))}</b></p><p style="margin:16px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1b1b1b;color:#fff;text-decoration:none;font-weight:bold">Book this table</a></p><p style="margin:0;color:#555;font-size:14px">Tables are first come, first served, so it may be taken by the time you look.</p></div>`;
  return { subject: head + " \u00b7 " + venue, html, text };
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
    // Hiding the Widget page from the menu (Settings, Plan) does not stop online booking: only the "Accept online bookings" switch does.
    const on = !!o.on;

    const who = () => mailWho(row && row.data, name);

    // Guests who pressed "Alert me": when a table is free for their day and party, email them once. At most 5 emails a run.
    const runAlerts = async () => {
      for (let tryN = 0; tryN < 2; tryN++) {
        const rw = await load(); if (!rw || !rw.data) return;
        const S = rw.data, list: Any[] = Array.isArray(S.alerts) ? S.alerts : []; if (!list.length) return;
        const RR = rules(S, today, nowMin), oo = RR.OB(); if (!oo.on) return;
        const prs = RR.pickRooms(), up: Any[] = [], del: string[] = [], mails: { al: Any; first: string }[] = [];
        for (const al of list) {
          if (!al || !isDate(String(al.date)) || al.date < today) { if (al && al.id) del.push(al.id); continue; }
          if (al.sent || mails.length >= 5) continue;
          const room = prs.includes(al.room) ? al.room : "";
          const free = (room || !prs.length ? RR.availSlots(al.date, al.size, room).slots : prs.flatMap((pr) => RR.availSlots(al.date, al.size, pr).slots)).filter((x) => x.ok).map((x) => x.t).sort();
          if (free.length) { al.sent = Date.now(); up.push(al); mails.push({ al, first: free[0] }); }
        }
        if (!up.length && !del.length) return;
        S.alerts = list.filter((x) => x && !del.includes(x.id));
        const c = await db.rpc("pr_state_commit", { p_site: site, p_rev: rw.rev, p_data: S, p_ops: [{ k: "alerts", up, del }] });
        if (c.error) throw c.error;
        if (c.data != null) { for (const mm of mails) { const e = alertMail(name, site, mm.al, mm.first); await mail(mm.al.email, e.subject, e.html, e.text, who()); } return; }
      }
    };
    // the app calls this every few minutes while a guest is waiting, so a table freed by staff is noticed too
    if (a === "tick") { if (on) await runAlerts(); return send({ ok: true }); }

    if (a === "alert" && req.method === "POST") {
      if (!on) return send({ error: "off", message: "Online booking is not available at the moment. Please contact us directly." }, 403);
      const b = await req.json().catch(() => ({}));
      if (clean(b.website, 200)) return send({ ok: true });
      const date = String(b.date || ""), size = Math.round(+b.size || 0), gname = clean(b.name, 80).toUpperCase(), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30);
      if (!isDate(date) || date < today || date > addD(today, o.ahead)) return send({ error: "bad", message: "Please choose a date." }, 400);
      if (!(size >= 1 && size <= o.maxParty)) return send({ error: "bad", message: "Please choose how many guests." }, 400);
      if (gname.length < 2) return send({ error: "bad", message: "Please enter your name." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send({ error: "bad", message: "Please enter your email address so we can tell you." }, 400);
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown", key = "alert:" + site + ":" + ip;
      const bl = await db.rpc("pr_pin_blocked", { p_key: key, p_max: 6 });
      if (bl.data === true) return send({ error: "busy", message: "Too many requests from this connection. Please wait ten minutes." }, 429);
      await db.rpc("pr_pin_failed", { p_key: key });
      for (let tryN = 0; tryN < 4; tryN++) {
        const rw = await load(); if (!rw || !rw.data) break;
        const S = rw.data, list: Any[] = Array.isArray(S.alerts) ? S.alerts : [], RR = rules(S, today, nowMin), prs = RR.pickRooms(), room = prs.includes(String(b.room || "")) ? String(b.room) : "";
        if (list.some((x) => x && x.date === date && x.size === size && x.email === email && !x.sent)) return send({ ok: true });
        if (list.filter((x) => x && x.date === date).length >= 40) return send({ error: "full", message: "The alert list for that day is full. Please contact us directly." }, 409);
        const al = { id: uid(), date, size, room, name: gname, email, phone, at: Date.now() };
        list.push(al); S.alerts = list;
        const c = await db.rpc("pr_state_commit", { p_site: site, p_rev: rw.rev, p_data: S, p_ops: [{ k: "alerts", up: [al] }] });
        if (c.error) throw c.error;
        if (c.data != null) return send({ ok: true });
      }
      return send({ error: "busy", message: "We could not save that just now. Please try again." }, 503);
    }

    // a guest books places at an event
    if (a === "evbook" && req.method === "POST") {
      if (!on) return send({ error: "off", message: "Online booking is not available at the moment. Please contact us directly." }, 403);
      const b = await req.json().catch(() => ({}));
      if (clean(b.website, 200)) return send({ ok: true, ref: uid().slice(0, 6).toUpperCase() });
      const eid = clean(b.eid, 20), n = Math.round(+b.n || 0), gname = clean(b.name, 80).toUpperCase(), phone = clean(b.phone, 30), email = clean(b.email, 120).toLowerCase(), notes = clean(b.notes, 300);
      if (!(n >= 1 && n <= 20)) return send({ error: "bad", message: "Please choose how many places." }, 400);
      if (gname.length < 2) return send({ error: "bad", message: "Please enter your name." }, 400);
      if (!normPh(phone)) return send({ error: "bad", message: "Please enter a phone number we can reach you on." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send({ error: "bad", message: "Please enter your email address so we can send your confirmation." }, 400);
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown", key = "book:" + site + ":" + ip;
      const bl = await db.rpc("pr_pin_blocked", { p_key: key, p_max: 8 });
      if (bl.data === true) return send({ error: "busy", message: "Too many bookings from this connection. Please wait ten minutes or contact us directly." }, 429);
      for (let tryN = 0; tryN < 5; tryN++) {
        const rw = await load(); if (!rw || !rw.data) break;
        const S = rw.data, ev = (Array.isArray(S.events) ? S.events : []).find((e: Any) => e && String(e.id) === eid);
        if (!evGood(ev, today)) return send({ error: "gone", message: "Sorry, that event is no longer available." }, 409);
        const list: Any[] = Array.isArray(S.evb) ? S.evb : [];
        const same = list.find((x) => x && x.eid === eid && x.email === email && x.n === n && x.status !== "cancelled" && Date.now() - (+x.at || 0) < 120000);
        if (same) return send({ ok: true, ref: refOf(same), title: ev.title, date: ev.date, start: ev.start || "", n });
        if (+ev.places > 0) { const left = Math.round(+ev.places) - evTaken(S, eid); if (n > left) return send({ error: "full", message: left > 0 ? "Sorry, only " + left + (left === 1 ? " place is" : " places are") + " left." : "Sorry, this event is now fully booked." }, 409); }
        const eb: Any = { id: uid(), eid, n, name: gname, phone, email, notes, at: Date.now() };
        if (b.mk === true) { eb.mkAt = Date.now(); eb.mkBy = "web"; }
        list.push(eb); S.evb = list;
        const ops: Any[] = [{ k: "evb", up: [eb] }];
        if (b.mk === false) { const k = gkeyOf(phone, gname); if (!S.mkoff || typeof S.mkoff !== "object" || Array.isArray(S.mkoff)) S.mkoff = {}; S.mkoff[k] = true; ops.push({ k: "mkoff", mp: { [k]: true } }); }
        const c = await db.rpc("pr_state_commit", { p_site: site, p_rev: rw.rev, p_data: S, p_ops: ops });
        if (c.error) throw c.error;
        if (c.data != null) {
          await db.rpc("pr_pin_failed", { p_key: key });
          const em = eventMail(name, { ...ev, title: clean(ev.title, 80), price: clean(ev.price, 120) }, eb);
          const sent = await mail(email, em.subject, em.html, em.text, who());
          return send({ ok: true, ref: refOf(eb), title: clean(ev.title, 80), date: ev.date, start: ev.start || "", n, emailed: !!sent });
        }
      }
      return send({ error: "busy", message: "We could not save your booking just now. Please try again." }, 503);
    }

    if (a === "info") {
      if (!on) return off();
      return send({ name, on: true, label: o.label || "Book a table", msg: o.msg || "", maxParty: o.maxParty, ahead: o.ahead, confirm: o.confirm, mkTick: false, priv: privOf(row.data), today, look: lookOf(o), rooms: R.pickRooms(), pick: R.pickRooms().length ? o.pick : "", events: evPublic(row.data, today) });
    }

    if (a === "slots") {
      if (!on) return off();
      const date = String(q.get("date") || ""), size = Math.round(+(q.get("size") || 0));
      if (!isDate(date)) return send({ error: "bad", message: "Please choose a date." }, 400);
      const prs = R.pickRooms(), room = prs.includes(String(q.get("room") || "")) ? String(q.get("room")) : "";
      // all=1 (Showcase template): the free times of every area at once, so each time button can name its area
      const all = q.get("all") === "1" && prs.length > 0 && !room;
      if (prs.length && o.pick === "must" && !room && !all) return send({ date, size, times: [], why: "Please choose an area first.", room: "" });
      const r = R.availSlots(date, size, room);
      let times = r.slots.filter((s) => s.ok).map((s) => s.t);
      const byRoom: Record<string, string[]> = {};
      if (all) { prs.forEach((pr) => { byRoom[pr] = R.availSlots(date, size, pr).slots.filter((s) => s.ok).map((s) => s.t); }); times = [...new Set(prs.flatMap((pr) => byRoom[pr]))].sort(); }
      const why = guestWhy(r, o) || (times.length ? "" : "Sorry, there are no tables free online that day for " + size + (size === 1 ? " guest" : " guests") + (room ? " in " + room : "") + ". Please try another date" + (room ? ", another area" : "") + " or contact us directly.");
      return send({ date, size, times, why, room, ...(all ? { byRoom } : {}) });
    }

    if (a === "book" && req.method === "POST") {
      if (!on) return send({ error: "off", message: "Online booking is not available at the moment. Please contact us directly." }, 403);
      const b = await req.json().catch(() => ({}));
      if (clean(b.website, 200)) return send({ ok: true, ref: uid().slice(0, 6).toUpperCase() }); // a field people never see: only robots fill it in
      const date = String(b.date || ""), time = String(b.time || ""), size = Math.round(+b.size || 0);
      const gname = clean(b.name, 80).toUpperCase(), phone = clean(b.phone, 30), email = clean(b.email, 120).toLowerCase(), notes = clean(b.notes, 300);
      if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return send({ error: "bad", message: "Please choose a date and time." }, 400);
      if (gname.length < 2) return send({ error: "bad", message: "Please enter your name." }, 400);
      if (!normPh(phone)) return send({ error: "bad", message: "Please enter a phone number we can reach you on." }, 400);
      if (!email) return send({ error: "bad", message: "Please enter your email address so we can send your confirmation." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send({ error: "bad", message: "That email address does not look right." }, 400);

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
        const prs = R.pickRooms(), room = prs.includes(String(b.room || "")) ? String(b.room) : "";
        if (prs.length && o.pick === "must" && !room) return send({ error: "bad", message: "Please choose an area." }, 400);
        const r = R.availSlots(date, size, room), slot = r.slots.find((s) => s.t === time);
        if (!slot || !slot.ok || !slot.unit) return send({ error: "gone", message: guestWhy(r, o) || "Sorry, that time has just been taken. Please choose another time." }, 409);
        const u = slot.unit, ask = o.confirm === "request";
        const p: Any = { id: uid(), name: gname, phone, size, date, time, dur: R.durFor(size), table: u.ids[0], status: "booked", notes: ((ask ? "Online request: please confirm with the guest. " : "") + (room ? "Guest chose " + room + ". " : "") + notes).slice(0, 400), email, src: "Website", tags: [], web: Date.now() };
        if (u.ids.length > 1) p.join = u.ids.slice(1);
        if (u.part != null) p.part = u.part;
        if (ask) p.req = 1;
        if (b.mk === true) { p.mkAt = Date.now(); p.mkBy = "web"; }
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
          // connection addresses are only needed for ten minutes: clear yesterday's
          try { await db.from("pr_pin_fails").delete().lt("t", new Date(Date.now() - 864e5).toISOString()); } catch (_e) { /* not important */ }
          const em = bookingMail(ask ? "request" : "new", name, site, p, o.msg || "", room);
          const sent = await mail(email, em.subject, em.html, em.text, who());
          return send({ ok: true, ref: p.id.slice(0, 6).toUpperCase(), confirm: o.confirm, name, date, time, size, room, emailed: !!sent });
        }
        // someone else saved in between: read again and re-check the time
      }
      return send({ error: "busy", message: "We could not save your booking just now. Please try again." }, 503);
    }

    // ---------- the guest finds, changes or cancels their own booking: reference + the email it was made with ----------
    if ((a === "find" || a === "amend") && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const ref = clean(b.ref, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""), em = clean(b.email, 120).toLowerCase();
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown", key = "amend:" + site + ":" + ip;
      const bl = await db.rpc("pr_pin_blocked", { p_key: key, p_max: 10 });
      if (bl.data === true) return send({ error: "busy", message: "Too many tries from this connection. Please wait ten minutes or contact us directly." }, 429);
      await db.rpc("pr_pin_failed", { p_key: key }); // every try counts, so the reference cannot be guessed
      const notFound = () => send({ error: "nofind", message: "We could not find a booking with that reference and email. Please check your confirmation email." }, 404);
      if (ref.length < 4 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return notFound();
      const mine = (S: Any) => (Array.isArray(S.parties) ? S.parties : []).find((p: Any) => refOf(p) === ref && String(p.email || "").toLowerCase() === em);
      // a booking can be changed online until the minimum notice before it starts
      const lockWhy = (p: Any, oo: Any) => {
        if (p.status === "cancelled") return "This booking is already cancelled.";
        if (p.status !== "booked") return "This booking cannot be changed online. Please contact us directly.";
        const lead = p.date > today ? 1e9 : p.date < today ? -1 : m(p.time) - nowMin;
        return lead < Math.max(1, +oo.notice || 0) * 60 ? "It is too close to your booking time to change it online. Please contact " + name + " directly." : "";
      };
      const p0 = mine(row.data);
      if (!p0) return notFound();
      const mk = (p: Any) => { const pr = R.pickRooms(), ar = R.areaOf(p.table); return { ok: true, ref: refOf(p), name: p.name, date: p.date, time: p.time, size: p.size, status: p.status, room: pr.includes(ar) ? ar : "" }; };
      if (a === "find") return send({ ...mk(p0), canChange: on && !lockWhy(p0, o), why: !on ? "Online changes are not available at the moment. Please contact us directly." : lockWhy(p0, o), maxParty: o.maxParty, ahead: o.ahead, today });
      if (!on) return send({ error: "off", message: "Online changes are not available at the moment. Please contact us directly." }, 403);
      const act = b.action === "cancel" ? "cancel" : "change";
      for (let tryN = 0; tryN < 5; tryN++) {
        if (tryN) { row = await load(); if (!row || !row.data) break; }
        const S = row!.data, p = mine(S);
        if (!p) return notFound();
        R = rules(S, today, nowMin); o = R.OB();
        const lw = lockWhy(p, o); if (lw) return send({ error: "locked", message: lw }, 409);
        const was = dayLong(p.date) + " at " + t12(p.time) + " for " + p.size;
        if (act === "cancel") { p.status = "cancelled"; p.notes = ((p.notes ? p.notes + " " : "") + "Cancelled online by the guest.").slice(0, 400); }
        else {
          const date = String(b.date || ""), time = String(b.time || ""), size = Math.round(+b.size || 0);
          if (!isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return send({ error: "bad", message: "Please choose a date and time." }, 400);
          // check the new time as if this booking were not holding its own table
          const R2 = rules({ ...S, parties: (S.parties || []).filter((x: Any) => x.id !== p.id) }, today, nowMin), prs = R2.pickRooms(), room = prs.includes(String(b.room || "")) ? String(b.room) : prs.length && o.pick === "must" && prs.includes(R2.areaOf(p.table)) ? R2.areaOf(p.table) : "", r = R2.availSlots(date, size, room), slot = r.slots.find((s) => s.t === time);
          if (!slot || !slot.ok || !slot.unit) return send({ error: "gone", message: guestWhy(r, o) || "Sorry, that time is not free. Please choose another time." }, 409);
          const u = slot.unit;
          p.date = date; p.time = time; p.size = size; p.dur = R2.durFor(size); p.table = u.ids[0];
          if (u.ids.length > 1) p.join = u.ids.slice(1); else delete p.join;
          if (u.part != null) p.part = u.part; else delete p.part;
          ["rem", "remVia", "conf", "aack", "snz", "resolved", "arr", "arrN"].forEach((k) => { delete p[k]; });
          p.notes = ((p.notes ? p.notes + " " : "") + "Changed online by the guest (was " + was + ").").slice(0, 400);
        }
        const c = await db.rpc("pr_state_commit", { p_site: site, p_rev: row!.rev, p_data: S, p_ops: [{ k: "parties", up: [p] }] });
        if (c.error) throw c.error;
        if (c.data != null) {
          const e = bookingMail(act === "cancel" ? "cancelled" : "changed", name, site, p, act === "cancel" ? "" : o.msg || "", act === "cancel" ? "" : mk(p).room);
          const sent = await mail(em, e.subject, e.html, e.text, who());
          try { await runAlerts(); } catch (x) { console.error("alerts", x); }
          return send({ ...mk(p), emailed: !!sent });
        }
      }
      return send({ error: "busy", message: "We could not save the change just now. Please try again." }, 503);
    }
    return send({ error: "bad" }, 400);
  } catch (e) {
    console.error(e);
    return send({ error: "server", message: "Something went wrong. Please try again." }, 500);
  }
});
