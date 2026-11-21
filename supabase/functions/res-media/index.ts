// Proview Reservations: pictures for a venue's booking page (logo, header photo, background).
//
// POST /res-media   headers: Authorization: Bearer <session>, x-site: <location id>
//   { kind: "logo" | "header" | "bg", data: "data:image/png|jpeg|webp;base64,…" } → { url }
//   { kind, remove: true } → { ok: true }
// Only an Admin or Manager login of that location (or the Proview master) may upload. The app shrinks the
// picture before sending it; anything over 900 KB is refused. Files live in the public bucket "pr-media"
// under <location id>/, and the app keeps the returned address in the venue's theme.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const send = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const BUCKET = "pr-media", KINDS = ["logo", "header", "bg"], EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return send({ error: "not found" }, 404);
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
    // deno-lint-ignore no-explicit-any
    const gate = g.data as any;
    if (!gate?.exists || (!gate.master && !gate.role)) return send({ error: "site" }, 403);
    if (!(gate.master || gate.role === "Admin" || gate.role === "Manager")) return send({ error: "role", message: "Only a manager can change the pictures." }, 403);

    const b = await req.json().catch(() => ({}));
    const kind = String(b.kind || "");
    if (!KINDS.includes(kind)) return send({ error: "bad", message: "Unknown picture." }, 400);
    const st = db.storage.from(BUCKET);
    const old = async (keep = "") => { const l = await st.list(site, { limit: 100 }); const rm = (l.data || []).filter((f) => f.name.startsWith(kind + "-") && f.name !== keep).map((f) => site + "/" + f.name); if (rm.length) await st.remove(rm); };
    if (b.remove) { await old(); return send({ ok: true }); }

    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ""));
    if (!m) return send({ error: "bad", message: "That file is not a picture we can use. Please use a PNG or JPG." }, 400);
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bin.length > 900 * 1024) return send({ error: "big", message: "That picture is too large." }, 413);
    // the bucket is made the first time it is needed
    const mk = await db.storage.createBucket(BUCKET, { public: true });
    if (mk.error && !/exist/i.test(mk.error.message || "")) throw mk.error;
    const name = kind + "-" + crypto.randomUUID().slice(0, 8) + "." + EXT[m[1]];
    const up = await st.upload(site + "/" + name, bin, { contentType: m[1], cacheControl: "31536000", upsert: false });
    if (up.error) throw up.error;
    await old(name);
    return send({ url: st.getPublicUrl(site + "/" + name).data.publicUrl });
  } catch (e) {
    console.error(e);
    return send({ error: "server", message: "The picture could not be saved. Please try again." }, 500);
  }
});
