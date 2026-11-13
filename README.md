# Proview Reservations

Restaurant bookings, table plan, waitlist, guests, loyalty and staff punch-in by Proview Tech (the customer app, v222).
Set up the same way as Proview Bookings and Proview Team: a single-page app on GitHub Pages, with logins and shared data in Supabase.

- **App:** `index.html`, built by `python3 build.py` from `app.src.html` (the app as exported) and `cloud.js` (sign-in and shared data)
- **Cloud:** `cloud.json` points the app at the `proview-reservations` Supabase project. See [SETUP.md](SETUP.md).
- **Database:** `supabase/schema.sql`
- **Functions:** `supabase/functions/res-api` (shared data; keeps pay and sales figures away from Staff logins) and `supabase/functions/sso-login` ("Sign in with Proview account")
- **Notes and tests:** `docs/`, `tests/`

Pushing to `main` redeploys through GitHub Pages. Without `cloud.json` the app runs on each device on its own.
