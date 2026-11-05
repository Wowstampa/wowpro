-- Phone / WhatsApp number shown to clients on the Supporto page.
alter table public.profiles add column if not exists phone text check (char_length(phone) <= 40);
