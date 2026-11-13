-- =====================================================================
--  PROVIEW RESERVATIONS: Supabase setup (businesses, locations, licences, logins,
--  shared staff data, licence portal link, "Sign in with Proview account").
--  Modelled on Proview Bookings (bk_*). Every object here starts with pr_
--  (plus hub_private.*, hub_call, hub_plans and sso_* which the licence
--  portal expects under those names). Safe to run more than once.
--
--  How the data is protected
--  • Each location's working data (bookings, guests, floor plan, staff,
--    punches) is one JSON document in pr_site_state. Nobody reads or writes
--    that table from a browser: only the res-api edge function does (service
--    role). A Staff login never receives pay rates, labour and sales figures
--    or the manager PIN; they are sent only after the server has checked the
--    manager PIN, or to an Owner / Admin / Manager login.
--  • Logins are Supabase email accounts. pr_business_members says which
--    login may open which business and location.
--  • A location needs a licence (set in the licence portal) to be used.
-- =====================================================================

create schema if not exists hub_private;
revoke all on schema hub_private from public, anon, authenticated;

-- 1. Tables ---------------------------------------------------------------
create table if not exists public.pr_master_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
-- Emails that become a Proview master the moment their login is created.
create table if not exists public.pr_master_emails (
  email text primary key check (email = lower(email))
);

create table if not exists public.pr_businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  phone         text,
  notes         text,
  self_signup   boolean not null default false,
  suspended     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.pr_sites (
  id                 text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  business_id        uuid references public.pr_businesses(id) on delete cascade,
  name               text not null,
  license_type       text check (license_type is null or license_type in ('trial','m1','m3','m6','m12','m24','m36','lifetime','custom')),
  license_starts_at  timestamptz,
  license_expires_at timestamptz,          -- null = lifetime
  license_notes      text,
  license_updated_at timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists pr_sites_business on public.pr_sites(business_id);

-- One row per person per business, keyed by email and linked to the login.
--   Owner / Admin   every location of the business
--   Manager / Staff only the locations in site_ids
create table if not exists public.pr_business_members (
  business_id uuid not null references public.pr_businesses(id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id     uuid references auth.users(id) on delete set null,
  name        text,
  role        text not null default 'Staff' check (role in ('Owner','Admin','Manager','Staff')),
  site_ids    text[] not null default '{}',
  via         text not null default 'manual' check (via in ('manual','people')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (business_id, email)
);
create index if not exists pr_business_members_user on public.pr_business_members(user_id);

-- The working data of each location. res-api only.
create table if not exists public.pr_site_state (
  id         text primary key references public.pr_sites(id) on delete cascade,
  rev        bigint not null default 1,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
-- Recent changes, so phones fetch small patches instead of the whole document.
create table if not exists public.pr_site_log (
  site text not null references public.pr_sites(id) on delete cascade,
  rev  bigint not null,
  ops  jsonb not null,
  at   timestamptz not null default now(),
  primary key (site, rev)
);
-- "Something changed" signal that phones listen to (no data in it).
create table if not exists public.pr_site_ping (
  id  text primary key references public.pr_sites(id) on delete cascade,
  rev bigint not null default 0,
  at  timestamptz not null default now()
);
-- PIN sign-ins on a shared device (only the token's hash is kept).
create table if not exists public.pr_site_sessions (
  token_sha256 text primary key,
  site         text not null references public.pr_sites(id) on delete cascade,
  pid          text not null,
  user_id      uuid,
  exp          timestamptz not null
);
create index if not exists pr_site_sessions_site on public.pr_site_sessions(site);
-- Wrong-PIN counter (slows down guessing).
create table if not exists public.pr_pin_fails (
  key text primary key,
  n   int not null default 0,
  t   timestamptz not null default now()
);

-- "Sign in with Proview account": one-time assertion log (sso-login edge function only).
create table if not exists public.sso_used (
  jti   text primary key,
  email text,
  at    timestamptz not null default now()
);

-- Licence portal link: only the hash of the hub's token lives here.
create table if not exists hub_private.config (
  id           int primary key default 1 check (id = 1),
  token_sha256 text,
  plans        jsonb not null default '{}'::jsonb
);
insert into hub_private.config (id) values (1) on conflict do nothing;

create table if not exists hub_private.pr_location_moves (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  action       text not null check (action in ('link', 'unlink')),
  from_account uuid not null,
  into_account uuid not null,
  site         text,
  sites        text[] not null default '{}',
  details      jsonb not null default '{}'::jsonb
);

-- 2. Who is who -----------------------------------------------------------
create or replace function public.pr_is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pr_master_admins where user_id = auth.uid())
$$;

create or replace function public.pr_role_rank(r text) returns int language sql immutable set search_path = public as $$
  select case r when 'Owner' then 4 when 'Admin' then 3 when 'Manager' then 2 when 'Staff' then 1 else 0 end $$;

-- The role of login p_user at location p_site, or null (master is handled by callers).
create or replace function public.pr_access_of(p_user uuid, p_site text) returns text
language sql stable security definer set search_path = public as $$
  select m.role
    from public.pr_sites s
    join public.pr_business_members m on m.business_id = s.business_id and m.user_id = p_user
   where s.id = p_site and p_user is not null and (m.role in ('Owner','Admin') or p_site = any(m.site_ids))
$$;
create or replace function public.pr_access(p_site text) returns text
language sql stable security definer set search_path = public as $$
  select public.pr_access_of(auth.uid(), p_site) $$;
create or replace function public.pr_is_member(p_site text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pr_is_master() or public.pr_access(p_site) is not null $$;

create or replace function public.pr_business_role(b uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  if public.pr_is_master() then return 'Master'; end if;
  select role into r from public.pr_business_members where business_id = b and user_id = auth.uid();
  return r;
end $$;

-- 3. Licences (same rules as Bookings) ---------------------------------------
-- Grace period: 7 days for paid licences (keep in step with LIC_GRACE in the app); none for trials.
create or replace function public.pr_license_ok(p_type text, p_expires timestamptz) returns boolean
language sql stable set search_path = public as $$
  select p_type is not null
     and (p_type = 'lifetime' or p_expires is null
          or p_expires + case when p_type = 'trial' then interval '0' else interval '7 days' end > now())
$$;
create or replace function public.pr_license_interval(p_type text) returns interval
language sql immutable set search_path = public as $$
  select case p_type
    when 'trial' then interval '3 days'
    when 'm1'  then interval '1 month'   when 'm3'  then interval '3 months'
    when 'm6'  then interval '6 months'  when 'm12' then interval '12 months'
    when 'm24' then interval '24 months' when 'm36' then interval '36 months'
  end
$$;
-- Is this location allowed to work? (licensed and its business not paused)
create or replace function public.pr_site_ok(p_site text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pr_sites s left join public.pr_businesses b on b.id = s.business_id
                  where s.id = p_site and not coalesce(b.suspended, false) and public.pr_license_ok(s.license_type, s.license_expires_at))
$$;

-- Licence fields change only through the licence portal (hub_call) or SQL run by Proview.
create or replace function public.pr_sites_licence_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'INSERT' then
    if new.license_type is not null or new.license_expires_at is not null or new.license_starts_at is not null then
      raise exception 'Licences are managed at license.proviewcrm.co.uk';
    end if;
  elsif new.license_type is distinct from old.license_type
     or new.license_starts_at is distinct from old.license_starts_at
     or new.license_expires_at is distinct from old.license_expires_at
     or new.license_notes is distinct from old.license_notes
     or new.license_updated_at is distinct from old.license_updated_at then
    raise exception 'Licences are managed at license.proviewcrm.co.uk';
  end if;
  return new;
end $$;
drop trigger if exists pr_sites_licence_guard on public.pr_sites;
create trigger pr_sites_licence_guard before insert or update on public.pr_sites
  for each row execute function public.pr_sites_licence_guard();

-- 4. Logins ---------------------------------------------------------------
create or replace function public.pr_members_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email order by created_at limit 1;
  end if;
  if new.role in ('Owner','Admin') then new.site_ids := '{}'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pr_members_before on public.pr_business_members;
create trigger pr_members_before before insert or update on public.pr_business_members
  for each row execute function public.pr_members_before();

-- A new login picks up its memberships (and master rights, for Proview's own emails).
create or replace function public.pr_claim_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then return new; end if;
  update public.pr_business_members set user_id = new.id where email = lower(new.email) and user_id is null;
  insert into public.pr_master_admins (user_id, email)
  select new.id, lower(new.email) from public.pr_master_emails e where e.email = lower(new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists pr_on_auth_user_created on auth.users;
create trigger pr_on_auth_user_created after insert on auth.users
  for each row execute function public.pr_claim_login();

-- Deleting a location takes it off everyone's list.
create or replace function public.pr_site_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.pr_business_members set site_ids = array_remove(site_ids, old.id) where old.id = any(site_ids);
  return old;
end $$;
drop trigger if exists pr_on_site_delete on public.pr_sites;
create trigger pr_on_site_delete after delete on public.pr_sites
  for each row execute function public.pr_site_deleted();

-- A URL-safe, unique location ID from a name, e.g. "Bella Pizza" → bella-pizza, bella-pizza-2 …
create or replace function public.pr_new_site_id(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare base text; cand text; n int := 1;
begin
  base := trim(both '-' from regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'g'));
  base := left(case when length(base) < 2 then 'venue' else base end, 50);
  cand := base;
  while exists (select 1 from public.pr_sites where id = cand) loop
    n := n + 1; cand := base || '-' || n;
  end loop;
  return cand;
end $$;

-- Who am I, and which locations can I open?
create or replace function public.pr_whoami() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare is_m boolean := public.pr_is_master();
begin
  if auth.uid() is null then return null; end if;
  return jsonb_build_object(
    'user_id', auth.uid(),
    'email', lower(auth.jwt() ->> 'email'),
    'is_master', is_m,
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'business_id', s.business_id, 'business', b.name,
               'role', case when is_m then coalesce(x.r, 'Owner') else x.r end,
               'license_type', s.license_type, 'license_expires_at', s.license_expires_at,
               'suspended', coalesce(b.suspended, false),
               'ok', public.pr_site_ok(s.id),
               'has_data', exists (select 1 from public.pr_site_state st where st.id = s.id))
             order by lower(b.name), lower(s.name))
        from public.pr_sites s
        left join public.pr_businesses b on b.id = s.business_id
        cross join lateral (select public.pr_access(s.id) r) x
       where is_m or x.r is not null), '[]'::jsonb));
end $$;

-- Online sign-up: a new account creates its business with one location. No licence until one is bought
-- (or Proview starts a trial), exactly as in Bookings.
create or replace function public.pr_create_my_business(p_business text, p_phone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare bid uuid; sid text; em text := lower(auth.jwt() ->> 'email');
        bn text := left(trim(coalesce(p_business,'')), 80);
begin
  if auth.uid() is null or coalesce(em, '') = '' then raise exception 'Please sign in first.'; end if;
  if length(bn) < 2 then raise exception 'Please enter your business name.'; end if;
  if exists (select 1 from public.pr_business_members where user_id = auth.uid() or email = em) then
    raise exception 'Your account already belongs to a business.';
  end if;
  insert into public.pr_businesses (name, contact_email, phone, self_signup, notes)
  values (bn, em, nullif(left(trim(coalesce(p_phone,'')), 30), ''), true, 'Signed up online')
  returning id into bid;
  sid := public.pr_new_site_id(bn);
  insert into public.pr_sites (id, business_id, name) values (sid, bid, bn);
  insert into public.pr_business_members (business_id, email, user_id, role) values (bid, em, auth.uid(), 'Owner');
  return sid;
end $$;

-- The master's "Add business": the business, one location (no licence) and its owner login.
-- A new email gets a ready-to-use login (confirmed, password set, no email sent); an existing login is not touched.
create or replace function public.pr_add_business(p_business text, p_name text, p_email text, p_mobile text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  bn  text := left(trim(coalesce(p_business, '')), 80);
  nm  text := nullif(left(trim(coalesce(p_name, '')), 80), '');
  em  text := lower(trim(coalesce(p_email, '')));
  mob text := nullif(left(trim(coalesce(p_mobile, '')), 30), '');
  bid uuid; sid text; uid uuid; existing boolean := false;
begin
  if auth.uid() is null or not public.pr_is_master() then
    raise exception 'Only the Proview administrator can add businesses.';
  end if;
  if length(bn) < 2 then raise exception 'Enter the business name.'; end if;
  if length(coalesce(nm, '')) < 2 then raise exception 'Enter the owner''s name.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;

  insert into public.pr_businesses (name, contact_email, phone, self_signup, notes)
  values (bn, em, mob, false, 'Added by Proview')
  returning id into bid;
  sid := public.pr_new_site_id(bn);
  insert into public.pr_sites (id, business_id, name) values (sid, bid, bn);

  select id into uid from auth.users where lower(email) = em and not coalesce(is_anonymous, false) order by created_at limit 1;
  if uid is not null then
    existing := true;
  else
    if length(coalesce(p_password, '')) < 6 then raise exception 'The password needs at least 6 characters.'; end if;
    uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_strip_nulls(jsonb_build_object('full_name', nm, 'mobile', mob)), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email',
            jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true, 'phone_verified', false), now(), now(), now());
  end if;

  insert into public.pr_business_members (business_id, email, user_id, name, role) values (bid, em, uid, nm, 'Owner');
  return jsonb_build_object('business_id', bid, 'site_id', sid, 'user_id', uid, 'email', em, 'existing', existing);
end $$;

-- The master can start a 3-day trial for a business that has no licence yet.
create or replace function public.pr_master_trial(p_business uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e timestamptz := now() + public.pr_license_interval('trial'); n int;
begin
  if auth.uid() is null or not public.pr_is_master() then
    raise exception 'Only the Proview administrator can start a trial.';
  end if;
  if not exists (select 1 from public.pr_businesses where id = p_business) then raise exception 'Business not found.'; end if;
  update public.pr_sites
     set license_type = 'trial', license_starts_at = now(), license_expires_at = e, license_updated_at = now(),
         license_notes = '3-day trial started by Proview'
   where business_id = p_business and license_type is null and license_expires_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('applied', n > 0, 'expires_at', case when n > 0 then e end, 'sites', n);
end $$;

-- 5. res-api helpers (service role only) -----------------------------------
-- May this login open this location, and is the location allowed to work?
create or replace function public.pr_gate(p_user uuid, p_site text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exists', s.id is not null,
    'site_name', s.name, 'business_id', s.business_id, 'business', b.name,
    'master', exists (select 1 from public.pr_master_admins m where m.user_id = p_user),
    'role', public.pr_access_of(p_user, p_site),
    'ok', s.id is not null and not coalesce(b.suspended, false) and public.pr_license_ok(s.license_type, s.license_expires_at),
    'suspended', coalesce(b.suspended, false))
    from (select 1) x
    left join public.pr_sites s on s.id = p_site
    left join public.pr_businesses b on b.id = s.business_id
$$;

-- Save a location's document only if nobody else saved in between. Returns the new revision, or null.
create or replace function public.pr_state_commit(p_site text, p_rev bigint, p_data jsonb, p_ops jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare nr bigint;
begin
  if p_rev = 0 then
    insert into public.pr_site_state (id, rev, data) values (p_site, 1, p_data) on conflict (id) do nothing returning rev into nr;
  else
    update public.pr_site_state set data = p_data, rev = rev + 1, updated_at = now()
     where id = p_site and rev = p_rev returning rev into nr;
    if nr is not null and p_ops is not null then
      insert into public.pr_site_log (site, rev, ops) values (p_site, nr, p_ops);
      delete from public.pr_site_log where site = p_site and rev <= nr - 1000;
    end if;
  end if;
  if nr is null then return null; end if;
  insert into public.pr_site_ping (id, rev, at) values (p_site, nr, now())
  on conflict (id) do update set rev = excluded.rev, at = excluded.at;
  return nr;
end $$;

-- Wrong-PIN counting: returns true when this key is blocked (p_max wrong tries in 10 minutes).
create or replace function public.pr_pin_blocked(p_key text, p_max int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pr_pin_fails where key = p_key and n >= p_max and t > now() - interval '10 minutes') $$;
create or replace function public.pr_pin_failed(p_key text) returns void
language sql security definer set search_path = public as $$
  insert into public.pr_pin_fails as f (key, n, t) values (p_key, 1, now())
  on conflict (key) do update set n = case when f.t > now() - interval '10 minutes' then f.n + 1 else 1 end, t = now();
  delete from public.pr_pin_fails where t < now() - interval '1 day';
$$;

-- 5b. Logins of a business (Settings > Logins in the app; RPC only) -------------
create or replace function public.pr_list_members(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.pr_business_role(p_business);
begin
  if r is null or r not in ('Master','Owner','Admin') then raise exception 'Only owners and admins can manage logins.'; end if;
  return jsonb_build_object('my_role', r,
    'members', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name, 'role', m.role,
                                  'joined', m.user_id is not null, 'me', m.user_id = auth.uid())
                                order by public.pr_role_rank(m.role) desc, m.email)
                         from public.pr_business_members m where m.business_id = p_business), '[]'::jsonb));
end $$;

create or replace function public.pr_save_member(p_business uuid, p_email text, p_role text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text := public.pr_business_role(p_business); em text := lower(trim(coalesce(p_email,'')));
        t public.pr_business_members; o public.pr_business_members;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if r is null or r not in ('Master','Owner','Admin') then raise exception 'Only owners and admins can manage logins.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if p_role not in ('Owner','Admin','Manager','Staff') then raise exception 'Choose a role.'; end if;
  select * into t from public.pr_business_members where business_id = p_business and email = em;
  if r <> 'Master' and (em = lower(coalesce(auth.jwt() ->> 'email', '')) or t.user_id = auth.uid()) then
    raise exception 'You can''t change your own access. Ask another owner or admin.';
  end if;
  if r = 'Admin' and (p_role = 'Owner' or t.role = 'Owner') then raise exception 'Only an owner can add or change owners.'; end if;
  insert into public.pr_business_members as m (business_id, email, name, role, site_ids, updated_by)
  values (p_business, em, nullif(left(trim(coalesce(p_name,'')), 80), ''), p_role,
          coalesce((select array_agg(id) from public.pr_sites where business_id = p_business), '{}'), auth.uid())
  on conflict (business_id, email) do update
    set name = coalesce(excluded.name, m.name), role = excluded.role, site_ids = excluded.site_ids, updated_by = excluded.updated_by
  returning * into o;
  return jsonb_build_object('email', o.email, 'role', o.role, 'joined', o.user_id is not null);
end $$;

create or replace function public.pr_remove_member(p_business uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare r text := public.pr_business_role(p_business); em text := lower(trim(coalesce(p_email,''))); t public.pr_business_members;
begin
  if r is null or r not in ('Master','Owner','Admin') then raise exception 'Only owners and admins can manage logins.'; end if;
  select * into t from public.pr_business_members where business_id = p_business and email = em;
  if not found then return; end if;
  if r <> 'Master' and (t.user_id = auth.uid() or em = lower(coalesce(auth.jwt() ->> 'email', ''))) then raise exception 'You can''t remove yourself.'; end if;
  if r = 'Admin' and t.role = 'Owner' then raise exception 'Only an owner can remove an owner.'; end if;
  delete from public.pr_business_members where business_id = p_business and email = em;
end $$;


-- 6. "Sign in with Proview account" ----------------------------------------
-- Masters and Owner / Admin / Manager members may arrive from dashboard.proviewcrm.co.uk; staff keep their own login.
create or replace function public.sso_entitled(p_email text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  select id into uid from auth.users where lower(email) = em order by created_at limit 1;
  if uid is not null and exists (select 1 from public.pr_master_admins where user_id = uid) then
    return jsonb_build_object('ok', true, 'user_id', uid);
  end if;
  if exists (select 1 from public.pr_business_members where email = em and role in ('Owner','Admin','Manager')) then
    return jsonb_build_object('ok', true, 'user_id', uid, 'create', uid is null);
  end if;
  if exists (select 1 from public.pr_business_members where email = em) then
    return jsonb_build_object('ok', false, 'reason', 'This is a staff login in Proview Reservations. Sign in there with your email and password.');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'No Proview Reservations account for this email.');
end $$;

-- 7. Licence portal (license.proviewcrm.co.uk → licence-hub → hub_call) ------
create or replace function hub_private.pr_check(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_token is null or encode(extensions.digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from hub_private.config where id = 1) then
    raise exception 'not authorised';
  end if;
end $$;

create or replace function hub_private.pr_link_businesses(p_into uuid, p_from uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.pr_businesses; b public.pr_businesses; lg hub_private.pr_location_moves;
  a_sites text[]; b_sites text[]; all_sites text[]; m public.pr_business_members; ex public.pr_business_members;
  nr text; ns text[];
begin
  if p_into = p_from then raise exception 'An account can''t be linked to itself.'; end if;
  select * into a from public.pr_businesses where id = p_into for update;
  if not found then raise exception 'Account not found: %', p_into; end if;
  select * into b from public.pr_businesses where id = p_from for update;
  if not found then
    select * into lg from hub_private.pr_location_moves where action = 'link' and from_account = p_from order by id desc limit 1;
    if lg.id is null then raise exception 'Account not found: %', p_from; end if;
    if lg.into_account <> p_into then raise exception '% was already linked into %, not %.', p_from, lg.into_account, p_into; end if;
    return jsonb_build_object('ok', true, 'account', p_into::text, 'from', p_from::text, 'already', true,
                              'moved_sites', to_jsonb(lg.sites), 'renamed_units', '[]'::jsonb);
  end if;
  select coalesce(array_agg(id order by created_at, id), '{}') into a_sites from public.pr_sites where business_id = a.id;
  select coalesce(array_agg(id order by created_at, id), '{}') into b_sites from public.pr_sites where business_id = b.id;
  all_sites := a_sites || b_sites;
  update public.pr_sites set business_id = a.id where business_id = b.id;
  -- people: B's join A; someone in both keeps the higher role; managers get every location
  for m in select * from public.pr_business_members where business_id = b.id loop
    select * into ex from public.pr_business_members where business_id = a.id and email = m.email;
    ns := array(select distinct x from unnest(coalesce(ex.site_ids, '{}') || coalesce(m.site_ids, '{}')) x);
    nr := case when ex.email is null or public.pr_role_rank(m.role) > public.pr_role_rank(ex.role) then m.role else ex.role end;
    if nr in ('Owner', 'Admin') then ns := '{}'; elsif nr = 'Manager' then ns := all_sites; end if;
    insert into public.pr_business_members (business_id, email, user_id, name, role, site_ids, via, created_at)
    values (a.id, m.email, coalesce(ex.user_id, m.user_id), coalesce(ex.name, m.name), nr, ns, coalesce(ex.via, m.via),
            coalesce(least(ex.created_at, m.created_at), m.created_at))
    on conflict (business_id, email) do update
      set role = excluded.role, site_ids = excluded.site_ids,
          user_id = coalesce(public.pr_business_members.user_id, excluded.user_id),
          name = coalesce(public.pr_business_members.name, excluded.name);
  end loop;
  update public.pr_business_members set site_ids = all_sites where business_id = a.id and role = 'Manager' and site_ids is distinct from all_sites;
  insert into hub_private.pr_location_moves (action, from_account, into_account, sites, details)
  values ('link', b.id, a.id, b_sites, jsonb_build_object('from_name', b.name, 'into_name', a.name,
          'from_contact_email', b.contact_email, 'from_phone', b.phone));
  delete from public.pr_businesses where id = b.id;
  return jsonb_build_object('ok', true, 'account', a.id::text, 'from', b.id::text, 'already', false,
                            'moved_sites', to_jsonb(b_sites), 'renamed_units', '[]'::jsonb);
end $$;

create or replace function hub_private.pr_unlink_site(p_account uuid, p_site text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a public.pr_businesses; si public.pr_sites; n_id uuid; lg hub_private.pr_location_moves; nsites int;
begin
  select * into si from public.pr_sites where id = p_site for update;
  if not found then raise exception 'Location not found: %', p_site; end if;
  select * into a from public.pr_businesses where id = p_account for update;
  if si.business_id is distinct from p_account then
    select * into lg from hub_private.pr_location_moves where action = 'unlink' and from_account = p_account and site = p_site
     order by id desc limit 1;
    if lg.id is not null and lg.into_account = si.business_id then
      return jsonb_build_object('ok', true, 'account', si.business_id::text, 'from', p_account::text, 'site', si.id,
                                'already', true, 'renamed_units', '[]'::jsonb);
    end if;
    if a.id is null then raise exception 'Account not found: %', p_account; end if;
    raise exception 'That location is not in account %.', p_account;
  end if;
  select count(*) into nsites from public.pr_sites where business_id = a.id;
  if nsites <= 1 then raise exception '% has only that one location, so there is nothing to unlink.', a.name; end if;
  insert into public.pr_businesses (name, contact_email, phone, notes, self_signup)
  values (si.name, a.contact_email, a.phone, concat_ws(E'\n', 'Unlinked from ' || a.name || ' in the licence portal', nullif(a.notes, '')), false)
  returning id into n_id;
  update public.pr_sites set business_id = n_id where id = si.id;
  -- the people who can see it are copied (A keeps them)
  insert into public.pr_business_members (business_id, email, user_id, name, role, site_ids, via, created_at)
    select n_id, m.email, m.user_id, m.name, m.role,
           case when m.role in ('Owner', 'Admin') then '{}'::text[] else array[si.id] end, m.via, m.created_at
      from public.pr_business_members m
     where m.business_id = a.id and (m.role in ('Owner', 'Admin') or si.id = any(m.site_ids));
  update public.pr_business_members set site_ids = array_remove(site_ids, si.id) where business_id = a.id and si.id = any(site_ids);
  insert into hub_private.pr_location_moves (action, from_account, into_account, site, sites, details)
  values ('unlink', a.id, n_id, si.id, array[si.id], jsonb_build_object('from_name', a.name, 'site_name', si.name));
  return jsonb_build_object('ok', true, 'account', n_id::text, 'from', a.id::text, 'site', si.id,
                            'already', false, 'renamed_units', '[]'::jsonb);
end $$;

-- hub_call(token, action, args): the same actions and answers as Bookings' hub_call.
--   list            → { accounts: [...], units: [...] }       (a unit = a location and its licence)
--   set             { unit, type, extend?, expires?, notes? }  set, extend or clear a location's licence
--   add_business    { business, name, email, mobile, password, contact_email? }
--   suspend         { account_id, suspended }                  pause / resume a business
--   delete_account  { account_id }                             delete a business and everything kept for it (logins stay)
--   link / unlink   { into, from } / { account, site }         merge two businesses / move a location out
create or replace function public.hub_call(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.pr_sites; b public.pr_businesses; base timestamptz; new_exp timestamptz; r jsonb;
  t text := nullif(p_args->>'type', '');
  ext boolean := coalesce((p_args->>'extend')::boolean, false);
  cust timestamptz := nullif(p_args->>'expires', '')::timestamptz;
  nt text := p_args->>'notes';
  ce text := nullif(lower(trim(coalesce(p_args->>'contact_email', ''))), '');
  mu uuid; me text; a uuid; a2 uuid; sid text; flag boolean;
  c_claims text := current_setting('request.jwt.claims', true);
  c_sub    text := current_setting('request.jwt.claim.sub', true);
begin
  perform hub_private.pr_check(p_token);

  if p_action = 'list' then
    return jsonb_build_object(
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'contact_email', x.contact_email,
                    'phone', x.phone, 'created_at', x.created_at, 'self_signup', x.self_signup, 'suspended', x.suspended) order by lower(x.name))
                  from public.pr_businesses x), '[]'::jsonb),
      'units', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'account_id', st.business_id,
                    'name', st.name, 'detail', st.id,
                    'license_type', st.license_type, 'starts_at', st.license_starts_at, 'expires_at', st.license_expires_at,
                    'notes', st.license_notes) order by st.name)
                  from public.pr_sites st), '[]'::jsonb));

  elsif p_action = 'set' then
    select * into s from public.pr_sites where id = p_args->>'unit' for update;
    if not found then raise exception 'Site not found'; end if;
    if t is null then
      update public.pr_sites set license_type = null, license_starts_at = null, license_expires_at = null,
             license_updated_at = now(), license_notes = coalesce(nullif(trim(nt), ''), license_notes)
       where id = s.id returning * into s;
    else
      if t = 'lifetime' then new_exp := null;
      elsif t = 'custom' then
        if cust is null then raise exception 'Choose an end date.'; end if;
        new_exp := cust;
      elsif public.pr_license_interval(t) is not null then
        base := case when ext and coalesce(s.license_type, '') <> 'lifetime' and s.license_expires_at is not null and s.license_expires_at > now()
                     then s.license_expires_at else now() end;
        new_exp := base + public.pr_license_interval(t);
      else raise exception 'Unknown licence type %', t;
      end if;
      update public.pr_sites
         set license_type = t,
             license_starts_at = case when ext and s.license_starts_at is not null then s.license_starts_at else now() end,
             license_expires_at = new_exp,
             license_notes = coalesce(nullif(trim(nt), ''), license_notes),
             license_updated_at = now()
       where id = s.id returning * into s;
    end if;
    return jsonb_build_object('id', s.id, 'license_type', s.license_type, 'starts_at', s.license_starts_at,
                              'expires_at', s.license_expires_at, 'notes', s.license_notes);

  elsif p_action = 'add_business' then
    if ce is not null and ce !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid contact email, or leave it empty.'; end if;
    -- the master's own Add business, run as the master for this one call
    select m.user_id, lower(u.email) into mu, me from public.pr_master_admins m join auth.users u on u.id = m.user_id
     order by u.created_at limit 1;
    if mu is null then raise exception 'This app has no Proview master account to add the business with.'; end if;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', mu, 'email', me, 'role', 'authenticated',
                       'aud', 'authenticated', 'is_anonymous', false)::text, true);
    perform set_config('request.jwt.claim.sub', mu::text, true);
    r := public.pr_add_business(p_args->>'business', p_args->>'name', p_args->>'email', p_args->>'mobile', p_args->>'password');
    perform set_config('request.jwt.claims', coalesce(c_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(c_sub, ''), true);
    if ce is not null then update public.pr_businesses set contact_email = ce where id = (r->>'business_id')::uuid; end if;
    return r || jsonb_build_object('account_id', r->>'business_id');

  elsif p_action in ('suspend', 'delete_account') then
    begin a := (p_args->>'account_id')::uuid; exception when others then raise exception 'Business not found.'; end;
    select * into b from public.pr_businesses where id = a;
    if p_action = 'suspend' then
      if b.id is null then raise exception 'Business not found.'; end if;
      flag := coalesce((p_args->>'suspended')::boolean, true);
      update public.pr_businesses set suspended = flag where id = b.id;
      return jsonb_build_object('ok', true, 'account_id', b.id, 'suspended', flag);
    end if;
    if b.id is null then return jsonb_build_object('ok', true, 'account_id', a, 'deleted', true, 'already', true); end if;
    delete from public.pr_businesses where id = b.id;   -- locations, their data, sessions and members cascade
    return jsonb_build_object('ok', true, 'account_id', b.id, 'deleted', true);

  elsif p_action = 'link' then
    if nullif(trim(coalesce(p_args->>'into', '')), '') is null or nullif(trim(coalesce(p_args->>'from', '')), '') is null then
      raise exception 'Say which accounts to link (into and from).';
    end if;
    begin a := trim(p_args->>'into')::uuid; exception when others then raise exception 'Account not found: %', p_args->>'into'; end;
    begin a2 := trim(p_args->>'from')::uuid; exception when others then raise exception 'Account not found: %', p_args->>'from'; end;
    return hub_private.pr_link_businesses(a, a2);

  elsif p_action = 'unlink' then
    sid := trim(coalesce(p_args->>'site', ''));
    if sid like 'loc/%' then sid := substr(sid, 5); end if;
    if nullif(trim(coalesce(p_args->>'account', '')), '') is null or sid = '' then
      raise exception 'Say which account and location to unlink.';
    end if;
    begin a := trim(p_args->>'account')::uuid; exception when others then raise exception 'Account not found: %', p_args->>'account'; end;
    return hub_private.pr_unlink_site(a, sid);
  end if;
  raise exception 'unknown action %', p_action;
end $$;

create or replace function public.hub_plans(p_token text, p_plans jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform hub_private.pr_check(p_token);
  update hub_private.config set plans = coalesce(p_plans, '{}'::jsonb) where id = 1;
  return jsonb_build_object('ok', true, 'plans', (select count(*) from jsonb_object_keys(coalesce(p_plans, '{}'::jsonb))));
end $$;

-- The "buy a licence" links the portal published (shown on the app's no-licence screen).
create or replace function public.pr_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '{}'::jsonb else coalesce((select plans from hub_private.config where id = 1), '{}'::jsonb) end $$;

-- 8. Row level security -----------------------------------------------------
alter table public.pr_master_admins    enable row level security;
alter table public.pr_master_emails    enable row level security;
alter table public.pr_businesses       enable row level security;
alter table public.pr_sites            enable row level security;
alter table public.pr_business_members enable row level security;
alter table public.pr_site_state       enable row level security;
alter table public.pr_site_log         enable row level security;
alter table public.pr_site_ping        enable row level security;
alter table public.pr_site_sessions    enable row level security;
alter table public.pr_pin_fails        enable row level security;
alter table public.sso_used            enable row level security;
alter table hub_private.config             enable row level security;
alter table hub_private.pr_location_moves  enable row level security;

drop policy if exists "pt master reads masters" on public.pr_master_admins;
create policy "pt master reads masters" on public.pr_master_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.pr_is_master()));

drop policy if exists "pt read businesses" on public.pr_businesses;
create policy "pt read businesses" on public.pr_businesses for select to authenticated
  using ((select public.pr_is_master()) or public.pr_business_role(id) is not null);
drop policy if exists "pt master updates businesses" on public.pr_businesses;
create policy "pt master updates businesses" on public.pr_businesses for update to authenticated
  using ((select public.pr_is_master())) with check ((select public.pr_is_master()));

drop policy if exists "pt read sites" on public.pr_sites;
create policy "pt read sites" on public.pr_sites for select to authenticated using (public.pr_is_member(id));
drop policy if exists "pt master updates sites" on public.pr_sites;
create policy "pt master updates sites" on public.pr_sites for update to authenticated
  using ((select public.pr_is_master())) with check ((select public.pr_is_master()));

drop policy if exists "pt members read" on public.pr_business_members;
create policy "pt members read" on public.pr_business_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.pr_is_master()) or public.pr_business_role(business_id) in ('Owner','Admin'));

drop policy if exists "pt members hear changes" on public.pr_site_ping;
create policy "pt members hear changes" on public.pr_site_ping for select to authenticated using (public.pr_is_member(id));

-- 9. Access ---------------------------------------------------------------
revoke all on public.pr_master_admins, public.pr_master_emails, public.pr_businesses, public.pr_sites, public.pr_business_members,
              public.pr_site_state, public.pr_site_log, public.pr_site_ping, public.pr_site_sessions, public.pr_pin_fails, public.sso_used
  from public, anon, authenticated;
grant select on public.pr_master_admins, public.pr_business_members, public.pr_site_ping to authenticated;
grant select, update (name, contact_email, phone, notes) on public.pr_businesses to authenticated;
grant select, update (name) on public.pr_sites to authenticated;
grant all on public.pr_master_admins, public.pr_master_emails, public.pr_businesses, public.pr_sites, public.pr_business_members,
             public.pr_site_state, public.pr_site_log, public.pr_site_ping, public.pr_site_sessions, public.pr_pin_fails, public.sso_used
  to service_role;

do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname like 'pt\_%' or p.proname in ('hub_call','hub_plans','sso_entitled')))
               or n.nspname = 'hub_private'
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;
end $$;
grant execute on function public.pr_is_master(), public.pr_access(text), public.pr_is_member(text), public.pr_business_role(uuid),
                          public.pr_site_ok(text), public.pr_license_ok(text, timestamptz), public.pr_whoami(), public.pr_plans(),
                          public.pr_create_my_business(text, text), public.pr_add_business(text, text, text, text, text),
                          public.pr_master_trial(uuid), public.pr_list_members(uuid),
                          public.pr_save_member(uuid, text, text, text), public.pr_remove_member(uuid, text) to authenticated;
grant execute on function public.pr_gate(uuid, text), public.pr_state_commit(text, bigint, jsonb, jsonb),
                          public.pr_pin_blocked(text, int), public.pr_pin_failed(text), public.sso_entitled(text),
                          public.pr_access_of(uuid, text) to service_role;
-- the licence portal calls these two with its token (checked inside)
grant execute on function public.hub_call(text, text, jsonb), public.hub_plans(text, jsonb) to anon, authenticated;

-- 10. Live updates ----------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.pr_site_ping; exception when duplicate_object then null; end;
end $$;

-- 11. Your first login --------------------------------------------------------
-- Proview's master login: put your email here before running (it becomes master when the login is created,
-- or straight away if the login already exists).
--   insert into public.pr_master_emails (email) values ('you@yourcompany.co.uk') on conflict do nothing;
--   insert into public.pr_master_admins (user_id, email)
--   select id, lower(email) from auth.users where lower(email) = 'you@yourcompany.co.uk' on conflict do nothing;
