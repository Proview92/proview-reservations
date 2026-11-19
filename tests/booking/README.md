Checks that the booking page offers exactly the times the app's "Try it" box shows.

1. `python3 gen.py` opens app.src.html, builds 40 random venues (opening hours, special days, joined and
   split tables, online rules, bookings) and saves the app's own answer for 560 date and party-size checks.
2. Copy the `rules` function out of supabase/functions/res-book/index.ts into rules.ts (see gen notes), then
   `node --experimental-strip-types cmp.mts` runs the server's rules on the same venues and counts differences.
   Expected: `different: 0`.
