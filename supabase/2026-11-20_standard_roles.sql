-- Standard roles (owner, 20 Nov 2026): the standard Proview roles and sign-in check, the same in every Proview app.
--   Roles of a business: Admin, Manager, Staff (nothing else). The Proview master stays the master (pr_master_admins /
--   pr_master_emails). "Owner" is gone: every Owner becomes Admin, and an Admin can do everything an Owner could
--   (manage logins, admins, licences). Done by rewriting each function and policy that knew 'Owner' so it reads 'Admin',
--   and by a CHECK on pr_business_members.role.
--   Sign-in check (sso_entitled), as Proview WiFi's rules, with account wording:
--     on hold -> "This Proview Reservations account is on hold. Contact Proview."
--     master, or anyone in a business (any role, staff too) -> let in (a missing login is made and claimed by its member)
--     anyone else -> "No Proview Reservations account for this email."
-- Safe to run more than once.

-- 1) data
update public.pr_business_members set role = 'Admin' where role = 'Owner';

-- 2) only Admin / Manager / Staff
do $c$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.pr_business_members'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) ~ 'Owner|Admin' loop
    execute format('alter table public.pr_business_members drop constraint %I', r.conname);
  end loop;
  alter table public.pr_business_members add constraint pr_business_members_role_check check (role in ('Admin', 'Manager', 'Staff'));
end $c$;

-- 3) policies that knew 'Owner'
do $p$
declare r record; q text; w text;
begin
  for r in select * from pg_policies where schemaname = 'public' and coalesce(qual, '') || coalesce(with_check, '') ~ 'Owner' loop
    q := replace(r.qual, '''Owner''::text, ', ''); w := replace(r.with_check, '''Owner''::text, ', '');
    q := replace(q, '''Owner''', '''Admin'''); w := replace(w, '''Owner''', '''Admin''');
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    execute format('create policy %I on %I.%I as %s for %s to %s', r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
                   array_to_string(r.roles, ', '))
            || case when q is not null then format(' using (%s)', q) else '' end
            || case when w is not null then format(' with check (%s)', w) else '' end;
  end loop;
end $p$;

-- 4) every function that knew 'Owner' now reads 'Admin' (texts reworded), same signatures, grants and owners
do $f$
declare r record; d text; n text;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname in ('public', 'hub_private') and p.prokind = 'f' and p.prosrc ~* 'owner' and p.proname <> 'sso_entitled' loop
    d := pg_get_functiondef(r.oid); n := d;
    n := replace(n, '{"value": "Owner", "label": "Owner"}, ', '');
    n := replace(n, 'lower(m.role) = ''owner''', 'lower(m.role) = ''admin''');
    n := replace(n, 'This is the only owner of the business. Add another owner first.', 'This is the only admin of the business. Add another admin first.');
    n := replace(n, 'Only owners and admins can manage logins.', 'Only admins can manage logins.');
    n := replace(n, 'Ask another owner or admin.', 'Ask another admin.');
    n := replace(n, 'Only an owner can remove an owner.', 'Only an admin can remove an admin.');
    n := replace(n, 'Only an owner can add or change owners.', 'Only an admin can add or change admins.');
    n := replace(n, 'Enter the owner''''s name.', 'Enter the admin''''s name.');
    n := replace(n, '''Owner''', '''Admin''');
    if n <> d then execute n; end if;
  end loop;
end $f$;

-- 5) the standard sign-in check
create or replace function public.sso_entitled(p_email text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid; ban timestamptz; em text := lower(trim(p_email));
begin
  select id, banned_until into uid, ban from auth.users
   where lower(email) = em and not coalesce(is_anonymous, false) order by created_at limit 1;
  if ban > now() then return jsonb_build_object('ok', false, 'reason', 'This Proview Reservations account is on hold. Contact Proview.'); end if;
  if (uid is not null and exists (select 1 from public.pr_master_admins where user_id = uid))
     or exists (select 1 from public.pr_master_emails where email = em)
     or exists (select 1 from public.pr_business_members where email = em or (uid is not null and user_id = uid)) then
    return jsonb_build_object('ok', true, 'user_id', uid, 'create', uid is null);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'No Proview Reservations account for this email.');
end $$;
revoke execute on function public.sso_entitled(text) from public, anon, authenticated;
grant execute on function public.sso_entitled(text) to service_role;
