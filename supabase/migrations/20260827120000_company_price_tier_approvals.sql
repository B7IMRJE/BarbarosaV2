create table if not exists public.company_price_tier_approvals (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    price_key text not null,
    tier text not null check (tier in ('normal', 'mid', 'high')),
    amount numeric(12,2) not null check (amount >= 0),
    approved_by uuid not null default auth.uid() references auth.users(id),
    approved_at timestamptz not null default now()
);

create index if not exists company_price_tier_approvals_company_item_idx
    on public.company_price_tier_approvals(company_id, price_key, approved_at desc);

alter table public.company_price_tier_approvals enable row level security;

drop policy if exists company_price_tier_approvals_read on public.company_price_tier_approvals;
create policy company_price_tier_approvals_read on public.company_price_tier_approvals
    for select to authenticated
    using (public.shared_core_company_can_read(company_id));

drop policy if exists company_price_tier_approvals_insert on public.company_price_tier_approvals;
create policy company_price_tier_approvals_insert on public.company_price_tier_approvals
    for insert to authenticated
    with check (public.shared_core_current_user_can_manage_company(company_id));

revoke all on table public.company_price_tier_approvals from anon;
grant select, insert on table public.company_price_tier_approvals to authenticated;
