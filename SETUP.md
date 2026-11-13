# Proview Reservations: how the cloud side is set up

| Part | Where |
|---|---|
| The app | GitHub Pages, from this repository (`index.html`) |
| Logins | Supabase Auth (email and password) in the `proview-reservations` project, London |
| Businesses, locations, licences, who may open what | Tables `pr_businesses`, `pr_sites`, `pr_business_members` (`supabase/schema.sql`) |
| Each business's working data | One document per location in `pr_site_state`, reached only through the `res-api` function |
| Licence portal link | `hub_call` / `hub_plans` (same actions as Bookings) |
| Sign in with Proview account | `sso-login` function (audience `reservations`) |

## Logins
- The owner signs in with their email. The first sign-in to a new business creates its starting data: the sample floor plan, and no bookings, guests, staff or history.
- More logins are added under **Settings > Logins** (owner or admin): Staff, Manager or Admin. The person then chooses "First time? Create your account" with that email.
- **Owner, Admin and Manager logins** receive everything. The manager PIN works on their devices as a screen lock, as before.
- **A Staff login** (good for a shared tablet) never receives pay rates, labour and sales settings, sales and labour history or the manager PIN, and cannot change staff records, the rota or what staff may do. When a manager types the PIN on that device, the server checks it and sends those parts until the device locks again (10 minutes of no use, or Lock now).

## Licences
A location works only while it has a licence (7 days of grace after a paid licence ends, none after a trial), exactly as in Bookings. New businesses start with no licence.

## Rebuilding the database from scratch
Run `supabase/schema.sql` in the SQL editor, put the master email in section 11, then deploy the two functions:

    supabase functions deploy res-api
    supabase functions deploy sso-login --no-verify-jwt
