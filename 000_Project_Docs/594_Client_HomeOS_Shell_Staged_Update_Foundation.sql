-- 594_Client_HomeOS_Shell_Staged_Update_Foundation.sql
-- Review-only proposal. Do not run until reviewed and adapted in Supabase.
--
-- Goal:
-- - Support ManagementOS / TechOS staged updates to a homeowner-owned HomeOS record.
-- - Company work notes, findings, photos, estimate references, and item updates are
--   company-owned drafts until an explicit publish action copies approved data into
--   homeowner HomeOS tables.
-- - Do not expose or mutate private homeowner photos, documents, or history just
--   because a company has an active client relationship.

do $$
begin
    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before installing client HomeOS staged updates.';
    end if;

    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before installing client HomeOS staged updates.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before installing client HomeOS staged updates.';
    end if;
end $$;

create table if not exists public.company_homeos_update_batches (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    company_property_client_id uuid null references public.company_property_clients(id) on delete set null,
    source_job_id uuid null,
    source_estimate_id uuid null,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_by_company_user_id uuid null references public.company_users(id) on delete set null,
    status text not null default 'draft'
        check (lower(btrim(status)) in ('draft', 'submitted', 'published', 'rejected', 'cancelled')),
    summary text null,
    submitted_at timestamptz null,
    published_at timestamptz null,
    rejected_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.company_homeos_update_items (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.company_homeos_update_batches(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    target_home_item_id uuid null references public.home_items(id) on delete set null,
    target_item_slug text null,
    target_system text null,
    target_location text null,
    target_parent_area text null,
    update_type text not null
        check (lower(btrim(update_type)) in (
            'work_note',
            'job_photo',
            'finding',
            'estimate_item',
            'item_status_update',
            'item_detail_update',
            'maintenance_recommendation'
        )),
    proposed_payload jsonb not null default '{}'::jsonb,
    status text not null default 'draft'
        check (lower(btrim(status)) in ('draft', 'submitted', 'published', 'rejected', 'cancelled')),
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_by_company_user_id uuid null references public.company_users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists company_homeos_update_batches_company_property_idx
    on public.company_homeos_update_batches (company_id, property_id, status);

create index if not exists company_homeos_update_items_batch_idx
    on public.company_homeos_update_items (batch_id);

create index if not exists company_homeos_update_items_target_item_idx
    on public.company_homeos_update_items (target_home_item_id);

-- RLS/RPC notes for review:
-- 1. Enable RLS on both tables.
-- 2. Company owner/admin/manager/technician with active company_users membership
--    and an active company_property_clients relationship may create draft rows.
-- 3. Homeowners should not read company draft rows until a company submits or
--    publishes a homeowner-visible update.
-- 4. Publish must be a SECURITY DEFINER RPC that verifies:
--    - auth.uid() is active company staff for the company
--    - company_property_clients is active for company_id + property_id
--    - target_home_item_id belongs to the same property
--    - update payload contains only allowlisted HomeOS fields
--    - private HomeOS documents/photos/history are not read by the publish process
-- 5. The publish RPC should copy approved changes into the appropriate HomeOS
--    table and mark batch/items as published in a single transaction.

-- Suggested future RPC signatures:
--
-- create_company_homeos_update_batch(
--   p_company_id uuid,
--   p_property_id uuid,
--   p_summary text default null
-- )
--
-- add_company_homeos_update_item(
--   p_batch_id uuid,
--   p_target_home_item_id uuid,
--   p_update_type text,
--   p_proposed_payload jsonb
-- )
--
-- publish_company_homeos_update_batch(
--   p_batch_id uuid
-- )
--
-- get_company_homeos_update_batches(
--   p_company_id uuid,
--   p_property_id uuid
-- )
