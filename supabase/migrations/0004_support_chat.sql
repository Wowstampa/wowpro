-- Private support chat between each client company and its account manager.

alter table public.companies
  add column if not exists account_manager_id uuid references public.profiles(id) on delete set null;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null default '' check (char_length(body) <= 4000),
  file_path text,
  file_name text,
  file_size bigint check (file_size >= 0),
  created_at timestamptz not null default now(),
  constraint support_messages_not_empty check (char_length(body) > 0 or file_path is not null)
);

create index if not exists support_messages_company_idx on public.support_messages(company_id, created_at desc);

-- One row per (conversation, person): read position and email throttling.
create table if not exists public.support_reads (
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch',
  last_emailed_at timestamptz,
  primary key (company_id, profile_id)
);

-- All access goes through trusted server routes using the service role.
alter table public.support_messages enable row level security;
alter table public.support_reads enable row level security;
