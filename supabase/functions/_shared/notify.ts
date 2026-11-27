// Proview Reservations: text message and WhatsApp messages to guests (through Twilio).
// Used by res-book (online bookings and guest changes) and res-api (staff bookings and changes, reminders, test message).
//
// A venue switches this on in Settings, "Texts and WhatsApp to guests" (venue.msg):
//   { wa: true|false, sms: true|false, rem: true|false, staff: true|false, name: "BELLAPIZZA" }
// If WhatsApp is on it is tried first; a text is sent only if WhatsApp is off or fails. So a guest gets one message, not two.
//
// Secrets (nothing is sent until they are set):
//   RES_TWILIO_ACCOUNT_SID, RES_TWILIO_AUTH_TOKEN
//   RES_TWILIO_FROM       the number (or Messaging Service SID, MG…) texts are sent from
//   RES_TWILIO_WA_FROM    the approved WhatsApp sender, for example whatsapp:+447700900000
//   RES_WA_TPL_NEW, RES_WA_TPL_REQUEST, RES_WA_TPL_CHANGED, RES_WA_TPL_CANCELLED, RES_WA_TPL_REMIND
//                         Content SIDs (HX…) of the Meta-approved WhatsApp templates. Variables in every template:
//                         {{1}} venue name, {{2}} day and time, {{3}} guests, {{4}} booking reference.
//                         WhatsApp only delivers approved templates to a guest who has not written first, so a kind
//                         without a template falls back to a text message.
// deno-lint-ignore no-explicit-any
type Any = any;
export type Kind = "new" | "request" | "changed" | "cancelled" | "remind";
export type MsgCfg = { wa: boolean; sms: boolean; rem: boolean; staff: boolean; name: string };

const env = (k: string) => Deno.env.get(k) || "";
const TPL: Record<Kind, string> = { new: "RES_WA_TPL_NEW", request: "RES_WA_TPL_REQUEST", changed: "RES_WA_TPL_CHANGED", cancelled: "RES_WA_TPL_CANCELLED", remind: "RES_WA_TPL_REMIND" };

// What the server is able to send (whether the keys are in).
export function msgReady() {
  const base = !!(env("RES_TWILIO_ACCOUNT_SID") && env("RES_TWILIO_AUTH_TOKEN"));
  return { sms: base && !!env("RES_TWILIO_FROM"), wa: base && !!env("RES_TWILIO_WA_FROM"), tpl: (Object.keys(TPL) as Kind[]).filter((k) => !!env(TPL[k])) };
}
// The venue's own choices.
export function msgCfg(S: Any): MsgCfg {
  const m = (S && S.venue && S.venue.msg) || {};
  return { wa: m.wa === true, sms: m.sms === true, rem: m.rem === true, staff: m.staff === true, name: String(m.name || "").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 11) };
}
// A phone number as Twilio wants it (+44…). UK numbers typed the usual way are understood; other countries need their code.
export function e164(x: unknown): string {
  let s = String(x == null ? "" : x).trim().replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) { s = "+" + s.slice(1).replace(/\+/g, ""); if (s.startsWith("+440")) s = "+44" + s.slice(4); }
  else if (s.startsWith("0")) s = "+44" + s.slice(1);
  else if (s.startsWith("44") && s.length >= 12) s = "+" + s;
  else if (s.startsWith("7") && s.length === 10) s = "+44" + s;
  else return "";
  return /^\+[1-9]\d{8,14}$/.test(s) ? s : "";
}
const t12 = (t: string) => { const h = +t.slice(0, 2); return ((h + 11) % 12 + 1) + ":" + t.slice(3) + (h < 12 ? "am" : "pm"); };
const dayShort = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const refOf = (p: Any) => String(p.id).slice(0, 6).toUpperCase();
const plain = (s: unknown, n: number) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// The words of each message. Kept short: one text message is 160 characters.
export function msgText(kind: Kind, venue: string, site: string, p: Any) {
  const v = plain(venue, 60), when = dayShort(p.date) + " at " + t12(p.time), who = p.size + (p.size === 1 ? " guest" : " guests"), ref = refOf(p);
  // the guest manages a booking with its reference and the email it was made with, so the link only helps if there is an email
  const link = p.email ? " Change or cancel: " + (env("RES_APP_URL") || "https://reservations.proviewcrm.co.uk") + "/book/?v=" + encodeURIComponent(site) + "&ref=" + ref : "";
  const body = kind === "cancelled" ? `${v}: your booking on ${when} is cancelled. We hope to see you another time.`
    : kind === "changed" ? `${v}: your booking is now ${when}, ${who}. Ref ${ref}.${link}`
    : kind === "request" ? `${v}: we have your request for ${when}, ${who}. We will confirm shortly. Ref ${ref}.`
    : kind === "remind" ? `${v}: a reminder of your table on ${when} for ${who}. Ref ${ref}.${link}`
    : `${v}: your table is booked for ${when}, ${who}. Ref ${ref}.${link}`;
  return { body, vars: { "1": v, "2": when, "3": who, "4": ref } };
}

async function twilio(form: Record<string, string>) {
  const sid = env("RES_TWILIO_ACCOUNT_SID");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + env("RES_TWILIO_AUTH_TOKEN")), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  if (!r.ok) console.error("twilio failed", form.From, r.status, (await r.text()).slice(0, 300));
  return r.ok;
}
// One text message. The venue's own sender name is tried first when it has one (UK networks show it instead of a number).
export async function sendSms(to: string, body: string, name = ""): Promise<boolean> {
  const from = env("RES_TWILIO_FROM"); if (!to || !from || !msgReady().sms) return false;
  const via = (f: string) => twilio(f.startsWith("MG") ? { To: to, MessagingServiceSid: f, Body: body.slice(0, 640) } : { To: to, From: f, Body: body.slice(0, 640) });
  const nm = name.replace(/\s+/g, "");
  try {
    if (/^(?=.*[A-Za-z])[A-Za-z0-9]{3,11}$/.test(nm) && !from.startsWith("MG") && await via(nm)) return true;
    return await via(from);
  } catch (e) { console.error("sms error", e); return false; }
}
// One WhatsApp message: the approved template for this kind of message.
export async function sendWa(to: string, kind: Kind, vars: Record<string, string>): Promise<boolean> {
  const from = env("RES_TWILIO_WA_FROM"), tpl = env(TPL[kind]); if (!to || !from || !tpl || !msgReady().wa) return false;
  try { return await twilio({ To: "whatsapp:" + to, From: from.startsWith("whatsapp:") ? from : "whatsapp:" + from, ContentSid: tpl, ContentVariables: JSON.stringify(vars) }); }
  catch (e) { console.error("whatsapp error", e); return false; }
}
// Sends one message about a booking, the way the venue has chosen. Returns "wa", "sms" or false.
export async function guestMsg(kind: Kind, S: Any, site: string, p: Any): Promise<false | "wa" | "sms"> {
  const c = msgCfg(S), to = e164(p && p.phone); if (!to || p.anon || (!c.wa && !c.sms)) return false;
  const venue = (S && S.venue && S.venue.name) || "", m = msgText(kind, venue, site, p);
  if (c.wa && await sendWa(to, kind, m.vars)) return "wa";
  if (c.sms && await sendSms(to, m.body, c.name)) return "sms";
  return false;
}

// ---------- reminders: the day before, from 10 in the morning (UK time) ----------
const TZ = "Europe/London";
export function ukNow() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const q: Record<string, string> = {}; f.formatToParts(new Date()).forEach((x) => { q[x.type] = x.value; });
  const today = `${q.year}-${q.month}-${q.day}`, t = new Date(today + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + 1);
  return { today, tomorrow: t.toISOString().slice(0, 10), hour: +q.hour };
}
// Bookings due a reminder now: tomorrow's, still booked, with a phone, not reminded or confirmed yet, and not made in the last 12 hours.
export function remindersDue(S: Any, max = 10): Any[] {
  const c = msgCfg(S); if (!c.rem || (!c.wa && !c.sms)) return [];
  const { tomorrow, hour } = ukNow(); if (hour < 10 || hour >= 21) return [];
  return (Array.isArray(S.parties) ? S.parties : []).filter((p: Any) => p && p.date === tomorrow && p.status === "booked" && !p.rem && !p.remFail && !p.conf && !p.anon && e164(p.phone) && !(p.web && Date.now() - p.web < 432e5)).slice(0, max);
}

// ---------- changes staff make in the app (only when the venue has switched "staff" on) ----------
// Given the bookings before a save and the bookings in the save, says which guests should hear about it.
// Nothing is sent for big batches (imports, demo data) or past dates. Walk-ins are seated, not booked, so they get nothing.
export function staffChanges(before: Any[], ups: Any[], today: string): { kind: Kind; p: Any }[] {
  if (!Array.isArray(ups) || !ups.length || ups.length > 3) return [];
  const out: { kind: Kind; p: Any }[] = [];
  for (const p of ups) {
    if (!p || !p.id || p.anon || !e164(p.phone) || !(p.date >= today)) continue;
    const old = (before || []).find((x: Any) => x && x.id === p.id);
    if (!old) { if (p.status === "booked") out.push({ kind: "new", p }); continue; }
    if (old.status === "booked" && p.status === "cancelled") out.push({ kind: "cancelled", p });
    else if (old.status === "booked" && p.status === "booked" && (old.date !== p.date || old.time !== p.time || old.size !== p.size)) out.push({ kind: "changed", p });
  }
  return out;
}
