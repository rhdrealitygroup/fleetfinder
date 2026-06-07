-- 0014 — lock profiles.email + track trial use. Idempotent.

-- (1) profiles.email was user-writable (the profiles_self policy is row-scoped
-- with no column restriction, and authenticated has table-level UPDATE), so a
-- user could set their own email to a victim's address and get resolved as the
-- invitee in the team flow. Restrict UPDATE to full_name only; email stays
-- authoritative (set on signup, synced from auth.users below).
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Keep profiles.email in lockstep with auth.users when a user changes their email
-- through Supabase Auth (the proper path), since clients can no longer write it.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- (2) Stop repeatable 14-day Stripe trials via cancel -> resubscribe: track
-- whether an org has ever started a trial. Checkout only grants a trial when
-- this is false; the webhook sets it true the first time a trial/sub appears.
alter table public.organizations add column if not exists trial_used boolean not null default false;
