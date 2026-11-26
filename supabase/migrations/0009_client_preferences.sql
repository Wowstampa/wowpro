-- Email notification preferences chosen by each client user, and proof of acceptance of the WOWPRO terms.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text check (char_length(terms_version) <= 40);
