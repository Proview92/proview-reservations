import { readFileSync } from "node:fs";
import { rules } from "./rules.ts";
const cases = JSON.parse(readFileSync("cases.json", "utf8"));
let n = 0, bad = 0, okSlots = 0, slots = 0;
for (const c of cases) {
  const R = rules(c.S, c.today, c.nowMin);
  for (const r of c.res) {
    const a = R.availSlots(r.d, r.n); n++;
    const x = JSON.stringify({ why: a.why, slots: a.slots.map((s: any) => ({ t: s.t, ok: s.ok, why: s.why })) });
    const y = JSON.stringify({ why: r.why, slots: r.slots });
    slots += r.slots.length; okSlots += r.slots.filter((s: any) => s.ok).length;
    if (x !== y) { bad++; if (bad < 4) console.log("DIFF", r.d, r.n, "\n app", y.slice(0, 300), "\n srv", x.slice(0, 300)); }
    // every offered time must come with a table that fits and is free
    for (const s of a.slots) if (s.ok && !s.unit) { bad++; console.log("NO UNIT", r.d, r.n, s.t); }
  }
}
console.log({ checks: n, different: bad, slots, okSlots });
