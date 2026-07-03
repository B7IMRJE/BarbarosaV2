-- 588_Estimate_Draft_Foundation.sql
-- REVIEW ONLY - do not run automatically.
--
-- Goal:
--   Durable company estimate draft foundation for HomeOS item -> TechOS/ManagementOS
--   estimate workflows.
--
-- Product rules:
--   - Homeowners do not see company estimate tools by default.
--   - Active company users need can_add_item_to_estimate before adding a HomeOS item.
--   - No price book or fake pricing is created in this foundation.
--   - HomeOS private photos/docs/history are not exposed just because an item is added.

do $$
begin
    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before estimate drafts can be installed.';
    end if;

    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before estimate drafts can be installed.';
    end if;

    if to_regprocedure('public.company_user_has_permission(uuid,text)') is null then
        raise exception 'public.company_user_has_permission(uuid,text) is required before estimate drafts can be installed.';
    end if;
end $$;

create table if not exists public.company_estimate_drafts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    created_by_company_user_id uuid not null references public.company_users(id) on delete restrict,
    status text not null default 'draft'
        check (lower(btrim(status)) in ('draft', 'ready_for_review', 'sent', 'accepted', 'declined', 'archived')),
    findings text,
    recommended_work text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.company_estimate_draft_items (
    id uuid primary key default gen_random_uuid(),
    estimate_draft_id uuid not null references public.company_estimate_drafts(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid references public.home_items(id) on delete set null,
    item_slug text,
    item_name text not null,
    system text,
    category text,
    area text,
    status text,
    install_state text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (estimate_draft_id, home_item_id)
);

create index if not exists company_estimate_drafts_company_status_idx
    on public.company_estimate_drafts(company_id, status);

create index if not exists company_estimate_drafts_property_idx
    on public.company_estimate_drafts(property_id);

create index if not exists company_estimate_draft_items_draft_idx
    on public.company_estimate_draft_items(estimate_draft_id);

create index if not exists company_estimate_draft_items_home_item_idx
    on public.company_estimate_draft_items(home_item_id);

-- RPC outline:
--   add_home_item_to_company_estimate(
--       p_company_id uuid,
--       p_property_id uuid,
--       p_home_item_id uuid
--   )
-- should:
--   1. require auth.uid()
--   2. find an active company_users row for auth.uid() and p_company_id
--   3. require public.company_user_has_permission(p_company_id, 'can_add_item_to_estimate')
--   4. verify p_home_item_id belongs to p_property_id
--   5. create or reuse an open company_estimate_drafts row
--   6. insert the safe item fields only into company_estimate_draft_items
--   7. return the draft id and draft item id
--
-- RLS outline:
--   - Company owner/admin/manager or company users with can_create_estimates /
--     can_add_item_to_estimate can read/write their company estimate drafts.
--   - Homeowners do not get read access to company draft internals until an explicit
--     customer approval/share workflow is designed.
--   - Policies must not grant access to home_item_files, HomeOS docs/photos, or
--     property history through estimate membership.
