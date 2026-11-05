-- Dedicated graphic designer for each client company.
alter table public.companies
  add column if not exists designer_id uuid references public.profiles(id) on delete set null;
