# Stress test report: Proview Bookings v190 (10 Nov 2026)

**Status: bugs 1 to 4 below were fixed in v191 (same day).** Retest: busy Saturday now has 0 double-seated tables, all 56 attending parties were served.

200 bookings created through the real booking form for 10 Nov to 9 Dec, plus a 61-booking busy Saturday run through the whole day, 800 random edits, odd inputs, and four screen sizes. Nothing was changed in the app.

## What broke (in order of importance)

1. **HIGH: a table can be given to a second party while the first is still sitting there.**
   Repro: book Guest A 19:00 for 90 min on a table. Seat them. At 20:45 they are still there (stay was 105 min). Seat Guest B (booked 20:45) on the same table. Both show as Seated on the same table.
   Cause: the app decides a table is free from the booked time + stay length only. It ignores that the table is actually still seated. In the busy Saturday run this happened 14 times.
2. **MEDIUM: one guest, many profiles.** The same phone number typed as `07700 900123`, `07700900123`, `+44 7700 900123`, `+447700900123`, `07700-900-123` became 6 different guests. Visit counts, loyalty, no-show history would be split. "abc" and "123" are accepted as phone numbers. 13 of 200 test bookings had no phone, so guests are matched by name only.
3. **MEDIUM: no duplicate warning.** The same guest, same date and time can be saved twice, and the same guest can hold overlapping bookings on one day.
4. **LOW: the staff form accepts odd things without a warning:** dates in the past, 03:00 and 23:45 (outside opening hours), 2.5 guests, a 10 hour stay, a party of 30 (saved with no table).
5. **LOW / by design:** parties of 10 and 12 are saved with no table because there are no table combinations in the sample data. On the overloaded Saturday 41 of 61 bookings had no table (the venue was genuinely full); they only show a short message when saved.

## What passed

- 200 bookings made in about 2 seconds, no page errors on any screen.
- No table double-booked at booking time, no party on a table too small, no online-rule bookings outside hours.
- Day headers (parties / covers) match the data for all 30 days.
- 800 random edits (guests +/-, time, stay, move table, cancel, reopen, delete, unseat): zero errors, nothing beyond the 30 minute allowed overlap.
- Busy Saturday: 56 attended and finished, 3 no-shows, 2 cancels, all handled.
- Script or HTML typed into a name is shown as plain text (safe).
- All 9 screens at computer, iPad landscape, iPad portrait and phone: no sideways scrolling.
- Online booking page: 2,325 time slots checked, none offered without a free table.
- Reminder count and guest count match the data. Storage: 93 KB for 200 bookings.
- Speed: Flow, Tables, Bookings under 80 ms; Guests, Reports, Activity, Settings about 300 ms.

## Not tested

Real devices, WhatsApp replies (not connected yet), the shared online database (does not exist yet), loyalty rewards over many visits.

## Round 2 (v193, 10 Nov 2026)

- Second 200-booking run through the real form: 192 saved (8 held back by the duplicate warning), 0 overlaps, 0 parties on a table too small, 0 outside opening hours, 0 phone variants. 4 parties of 10 or 12 had no table (no combinations in the sample data, by design).
- Table split on 14 Feb 2027 (16 seat table as 4+4+4+2+2) with 200 bookings, 80 of them on that day: 0 overlaps, 0 oversize, no parts used on other days, 22 bookings placed on the split table across all 5 parts.
- Editing a split (to 8+8) and removing it re-fits bookings; those that no longer fit lose their table and the user is told how many.
- Busy Saturday: 0 double-seated tables. Valentine's day seating sim (59 seated): 0 double-seated.
- Also found and fixed: walk-in could seat onto an occupied table; iPad buttons under 44px.

## Round 3: 500-scenario mixed run (v199 -> v200), 10 Nov 2026
25 themes x 20 variants: normal flow, partial arrival, partial seating, seating part of a party from booked, partial then no-show/cancel, special occasions with pre-ordered dessert, late/overdue, no-show + reopen, cancel + rebook, walk-ins, all tables full, big joined parties, manual 16-seat split override, live "split now", moving tables, editing size/time/stay, unseat/left/done sequences, invalid input, opening hours, duplicate guests, odd names/HTML injection, random monkey (70 random actions), past midnight, waitlist, other-day bookings. Each scenario also renders every page and checks for NaN/undefined/[object Object], plus invariants (no two seated parties on one table or table part, seated parties have tables, seatN/arrN sane, sizes/durations in range).
First run (v199): 18 of 500 scenarios failed, all the same root problem: two parties seated on one table.
 1. Moving a seated party onto a table another party was sitting at, then confirming "Overbook anyway" (12 of 20 "move table" scenarios).
 2. Seating an early arrival whose booking time is later than now onto a table that is occupied right now (table looked free at the booking time).
 3. Hardening: Seat now ignores bookings that are cancelled/no-show/done and bookings for another day.
Fixed in v200. Re-run of the same 500: 0 violations. A second 500 with different random seeds: 0 violations.
Not covered: real devices, real clock progression across a full service (earlier 200-booking day sims cover that), multi-user sync (no server yet).
