-- Quote and order requests for WowStampa products, answered with a Shopify draft order the client pays online.

do $$ begin
  create type public.quote_status as enum ('new', 'in_review', 'quoted', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'quote' check (kind in ('quote', 'order')),
  status public.quote_status not null default 'new',
  items jsonb not null default '[]'::jsonb,
  notes text not null default '' check (char_length(notes) <= 4000),
  needed_by date,
  offer jsonb,
  draft_order_id text,
  invoice_url text,
  quote_total numeric(12, 2),
  currency text not null default 'EUR',
  quoted_at timestamptz,
  paid_at timestamptz,
  order_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_requests_company_idx on public.quote_requests(company_id, created_at desc);
create index if not exists quote_requests_status_idx on public.quote_requests(status, created_at desc);

create table if not exists public.quote_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quote_requests(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'event')),
  body text not null default '' check (char_length(body) <= 4000),
  file_path text,
  file_name text,
  file_size bigint check (file_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists quote_messages_quote_idx on public.quote_messages(quote_id, created_at);

-- All access goes through trusted server routes using the service role.
alter table public.quote_requests enable row level security;
alter table public.quote_messages enable row level security;
