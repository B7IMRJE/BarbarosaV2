-- Add an item-scoped Catalog -> Quote proposal workflow without changing the
-- installed HomeOS item until the accepted job is fully closed.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.company_catalog_offerings') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_estimate_option_sessions') is null
       or to_regclass('public.company_estimate_options') is null
       or to_regclass('public.company_job_workflows') is null then
        raise exception 'HomeOS items, catalog offerings, estimates, and job workflows are required.';
    end if;
    if to_regprocedure('public.company_catalog_variant_is_entitled(uuid,uuid)') is null
       or to_regprocedure('public.company_estimate_options_can_use(uuid)') is null
       or to_regprocedure('public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.upsert_estimate_option_session_for_draft(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text)') is null
       or to_regprocedure('public.apply_company_job_homeos_closeout(uuid)') is null then
        raise exception 'Catalog entitlement, estimate authorization, and HomeOS closeout helpers are required.';
    end if;
end;
$$;

create table if not exists public.home_item_catalog_proposals (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    estimate_session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    estimate_option_id uuid references public.company_estimate_options(id) on delete set null,
    company_catalog_product_id uuid not null references public.company_approved_products(id) on delete restrict,
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete restrict,
    source_choice_id text not null,
    status text not null default 'proposed' check (status in ('proposed', 'published')),
    publication_review jsonb,
    publication_reviewed_at timestamptz,
    publication_reviewed_by_user_id uuid,
    published_home_item_id uuid references public.home_items(id) on delete set null,
    published_at timestamptz,
    created_by_user_id uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (estimate_session_id, home_item_id, company_catalog_product_id)
);

create index if not exists home_item_catalog_proposals_item_status_idx
    on public.home_item_catalog_proposals(home_item_id, status, updated_at desc);
create index if not exists home_item_catalog_proposals_session_idx
    on public.home_item_catalog_proposals(estimate_session_id, company_catalog_product_id);

alter table public.home_item_catalog_proposals enable row level security;
revoke all on table public.home_item_catalog_proposals from public, anon, authenticated;

create or replace function public.home_item_catalog_fact_is_meaningful(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select nullif(btrim(coalesce(p_value, '')), '') is not null
       and lower(btrim(p_value)) not in (
           'unknown', 'missing information', 'not specified', 'none', 'n/a', 'na'
       );
$$;

revoke all on function public.home_item_catalog_fact_is_meaningful(text) from public, anon, authenticated;

create or replace function public.company_job_selected_catalog_product_id(p_workflow_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_product_id uuid;
begin
    select workflow.* into v_workflow
    from public.company_job_workflows workflow
    where workflow.id = p_workflow_id;
    if not found then return null; end if;

    begin
        select nullif(option_value->'productIds'->>0, '')::uuid
        into v_product_id
        from jsonb_array_elements(
            case
                when jsonb_typeof(v_workflow.selected_options_snapshot) = 'array' then v_workflow.selected_options_snapshot
                when v_workflow.selected_option_snapshot is not null then jsonb_build_array(v_workflow.selected_option_snapshot)
                else '[]'::jsonb
            end
        ) option(option_value)
        where jsonb_array_length(coalesce(option_value->'productIds', '[]'::jsonb)) > 0
        limit 1;
    exception when invalid_text_representation then
        v_product_id := null;
    end;

    return v_product_id;
end;
$$;

revoke all on function public.company_job_selected_catalog_product_id(uuid) from public, anon, authenticated;

create or replace function public.get_home_item_catalog_proposals(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null
       or not public.company_product_catalog_can_view(p_company_id) then
        raise exception 'Company catalog access is required.';
    end if;
    if not exists (
        select 1 from public.home_items item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then
        raise exception 'The HomeOS item is unavailable.';
    end if;
    if not coalesce(public.homeos_is_platform_admin(), false)
       and not public.homeos_can_read_provider_assigned_items(
           p_company_id,
           p_property_id,
           p_service_request_id,
           p_schedule_slot_id,
           p_job_id
       ) then
        raise exception 'An assigned request, visit, or job is required to view item quote proposals.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', proposal.id,
        'estimate_session_id', proposal.estimate_session_id,
        'quote_number', session.quote_number,
        'company_catalog_product_id', proposal.company_catalog_product_id,
        'product_variant_id', proposal.product_variant_id,
        'product_name', coalesce(nullif(btrim(product.product_name), ''), concat_ws(' ', product.brand, product.model)),
        'category', product.category,
        'brand', product.brand,
        'model', product.model,
        'primary_image_url', (
            select asset.source_url
            from public.catalog_source_assets asset
            where asset.product_variant_id = proposal.product_variant_id
              and asset.asset_type = 'image'
              and asset.active
            order by asset.is_primary desc, asset.created_at
            limit 1
        ),
        'status', proposal.status,
        'created_at', proposal.created_at,
        'published_at', proposal.published_at
    ) order by proposal.updated_at desc), '[]'::jsonb)
    into v_result
    from public.home_item_catalog_proposals proposal
    join public.company_estimate_option_sessions session on session.id = proposal.estimate_session_id
    join public.company_approved_products product on product.id = proposal.company_catalog_product_id
    where proposal.company_id = p_company_id
      and proposal.property_id = p_property_id
      and proposal.home_item_id = p_home_item_id
      and proposal.status = 'proposed'
      and session.status in ('draft', 'technician_review', 'presentation_ready', 'presented')
      and exists (
          select 1
          from public.company_estimate_options option_row
          where option_row.session_id = proposal.estimate_session_id
            and (
                proposal.company_catalog_product_id = any(option_row.approved_product_ids)
                or coalesce(option_row.choice_snapshot->'productIds', '[]'::jsonb)
                    @> jsonb_build_array(proposal.company_catalog_product_id::text)
            )
      );

    return v_result;
end;
$$;

revoke all on function public.get_home_item_catalog_proposals(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.get_home_item_catalog_proposals(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.add_home_item_catalog_product_to_quote(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_product_variant_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_estimate_category text default 'faucet_replacement',
    p_source text default 'provider_mode'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_offering public.company_catalog_offerings%rowtype;
    v_product public.company_approved_products%rowtype;
    v_session public.company_estimate_option_sessions%rowtype;
    v_session_id uuid;
    v_option public.company_estimate_options%rowtype;
    v_proposal public.home_item_catalog_proposals%rowtype;
    v_total numeric(12,2);
    v_cost numeric(12,2);
    v_margin numeric(12,2);
    v_source_choice_id text;
    v_display_order integer;
    v_choice jsonb;
    v_source text := lower(btrim(coalesce(p_source, 'provider_mode')));
    v_primary_image_url text;
begin
    if auth.uid() is null or not public.company_estimate_options_can_use(p_company_id) then
        raise exception 'This work account is not authorized to create estimates for this company.';
    end if;
    if not coalesce(public.homeos_is_platform_admin(), false)
       and not public.homeos_can_read_provider_assigned_items(
           p_company_id,
           p_property_id,
           p_service_request_id,
           p_schedule_slot_id,
           p_job_id
       ) then
        raise exception 'An assigned request, visit, or job is required to add this product to a quote.';
    end if;
    if not exists (
        select 1 from public.home_items item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then
        raise exception 'The HomeOS item is unavailable.';
    end if;
    if not public.company_catalog_variant_is_entitled(p_company_id, p_product_variant_id) then
        raise exception 'This product is not included in the company catalog package.';
    end if;

    select offering.* into v_offering
    from public.company_catalog_offerings offering
    where offering.company_id = p_company_id
      and offering.product_variant_id = p_product_variant_id
      and offering.active
    for update;
    if not found or v_offering.company_catalog_product_id is null then
        raise exception 'This product does not have an active company offering.';
    end if;

    select product.* into v_product
    from public.company_approved_products product
    where product.id = v_offering.company_catalog_product_id
      and product.company_id = p_company_id
      and product.approved
      and product.active
      and product.catalog_status = 'approved';
    if not found then
        raise exception 'The company product is not approved for estimates.';
    end if;

    v_total := coalesce(v_offering.installed_price, v_product.approved_selling_price);
    if v_total is null or v_total < 0 then
        raise exception 'Management must add an installed price before this product can be quoted.';
    end if;
    v_cost := greatest(coalesce(v_offering.material_cost, v_product.internal_product_cost, 0), 0);
    v_margin := case when v_total > 0 then round(((v_total - v_cost) / v_total) * 100, 2) else null end;
    v_source_choice_id := 'catalog-product-' || v_product.id::text;
    if v_source not in ('provider_mode', 'management', 'techos') then v_source := 'provider_mode'; end if;

    select session_row.id into v_session_id
    from public.upsert_estimate_option_session_for_draft(
        null,
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_job_id,
        p_schedule_slot_id,
        p_home_item_id,
        coalesce(nullif(btrim(p_estimate_category), ''), 'faucet_replacement'),
        v_source
    ) session_row
    limit 1;

    if v_session_id is null then raise exception 'The quote session could not be opened.'; end if;
    select session.* into v_session
    from public.company_estimate_option_sessions session
    where session.id = v_session_id
    for update;

    select coalesce(max(option_row.display_order), 0) + 1
    into v_display_order
    from public.company_estimate_options option_row
    where option_row.session_id = v_session.id;

    v_choice := jsonb_build_object(
        'id', v_source_choice_id,
        'kind', 'individual',
        'title', coalesce(nullif(btrim(v_product.product_name), ''), concat_ws(' ', v_product.brand, v_product.model)),
        'shortSummary', 'Proposed company catalog product for ' || coalesce(nullif(btrim(v_product.category), ''), 'this HomeOS item'),
        'homeownerExplanation', 'This product is proposed for the approved work. The installed HomeOS item will update only after the completed job is closed.',
        'keyBenefits', jsonb_build_array('Company-approved product', 'Linked to the source HomeOS item'),
        'whyItDiffers', 'Selected from the company catalog for this specific HomeOS item.',
        'recommendedReason', null,
        'productIds', jsonb_build_array(v_product.id::text),
        'scopeIds', '[]'::jsonb,
        'warrantyIds', '[]'::jsonb,
        'inclusionIds', '[]'::jsonb,
        'exclusionIds', '[]'::jsonb,
        'pricingResult', jsonb_build_object(
            'id', 'catalog-price-' || v_product.id::text,
            'lineItems', jsonb_build_array(jsonb_build_object(
                'id', 'catalog-line-' || v_product.id::text,
                'priceBookEntryId', coalesce(v_product.price_book_item_id::text, ''),
                'code', 'CATALOG-PRODUCT',
                'name', coalesce(nullif(btrim(v_product.product_name), ''), concat_ws(' ', v_product.brand, v_product.model)),
                'quantity', 1,
                'unitAmount', v_total,
                'totalAmount', v_total,
                'cost', v_cost,
                'grossMargin', v_margin,
                'required', true,
                'source', 'product'
            )),
            'totalAmount', v_total,
            'totalCost', v_cost,
            'grossMargin', v_margin,
            'minimumAllowedTotal', v_product.minimum_selling_price,
            'recommendedTotal', v_total,
            'maximumAllowedTotal', v_product.maximum_selling_price,
            'priceBookVersion', 'company-catalog',
            'priceBookSnapshot', '[]'::jsonb,
            'warnings', '[]'::jsonb,
            'missingPricingInputs', '[]'::jsonb,
            'requiredManagementApproval', false
        ),
        'recommended', false,
        'displayOrder', v_display_order,
        'priceAdjustmentPercentage', 0,
        'priceAdjustmentLabel', null,
        'linePriceAdjustments', '{}'::jsonb,
        'pricingSource', 'price_book'
    );

    insert into public.company_estimate_options(
        session_id, company_id, source_choice_id, kind, title, short_summary,
        homeowner_explanation, key_benefits, why_it_differs, recommended_reason,
        deterministic_total, price_book_snapshot, approved_product_ids,
        inclusion_ids, exclusion_ids, display_order, recommended,
        technician_approved, choice_snapshot, price_adjustment_percentage,
        selected_for_presentation, updated_at
    ) values (
        v_session.id, p_company_id, v_source_choice_id, 'individual',
        v_choice->>'title', v_choice->>'shortSummary', v_choice->>'homeownerExplanation',
        v_choice->'keyBenefits', v_choice->>'whyItDiffers', null, v_total, '[]'::jsonb,
        array[v_product.id], array[]::text[], array[]::text[], v_display_order,
        false, false, v_choice, 0, false, now()
    )
    on conflict (session_id, source_choice_id) where source_choice_id is not null
    do update set
        title = excluded.title,
        short_summary = excluded.short_summary,
        homeowner_explanation = excluded.homeowner_explanation,
        key_benefits = excluded.key_benefits,
        why_it_differs = excluded.why_it_differs,
        deterministic_total = excluded.deterministic_total,
        approved_product_ids = excluded.approved_product_ids,
        technician_approved = false,
        choice_snapshot = excluded.choice_snapshot,
        selected_for_presentation = false,
        updated_at = now()
    returning * into v_option;

    update public.company_estimate_options
    set technician_approved = false, updated_at = now()
    where session_id = v_session.id;

    update public.company_estimate_option_sessions
    set status = 'technician_review',
        current_builder_step = 'review',
        technician_approved_at = null,
        updated_at = now()
    where id = v_session.id;

    insert into public.home_item_catalog_proposals(
        company_id, property_id, home_item_id, estimate_session_id,
        estimate_option_id, company_catalog_product_id, product_variant_id,
        source_choice_id, status, created_by_user_id, updated_at
    ) values (
        p_company_id, p_property_id, p_home_item_id, v_session.id,
        v_option.id, v_product.id, p_product_variant_id,
        v_source_choice_id, 'proposed', auth.uid(), now()
    )
    on conflict (estimate_session_id, home_item_id, company_catalog_product_id)
    do update set
        estimate_option_id = excluded.estimate_option_id,
        product_variant_id = excluded.product_variant_id,
        source_choice_id = excluded.source_choice_id,
        status = 'proposed',
        publication_review = null,
        publication_reviewed_at = null,
        publication_reviewed_by_user_id = null,
        published_home_item_id = null,
        published_at = null,
        updated_at = now()
    returning * into v_proposal;

    select asset.source_url into v_primary_image_url
    from public.catalog_source_assets asset
    where asset.product_variant_id = p_product_variant_id
      and asset.asset_type = 'image'
      and asset.active
    order by asset.is_primary desc, asset.created_at
    limit 1;

    return jsonb_build_object(
        'estimate_option_id', v_option.id,
        'proposal', jsonb_build_object(
            'id', v_proposal.id,
            'estimate_session_id', v_session.id,
            'quote_number', v_session.quote_number,
            'company_catalog_product_id', v_product.id,
            'product_variant_id', p_product_variant_id,
            'product_name', v_choice->>'title',
            'category', v_product.category,
            'brand', v_product.brand,
            'model', v_product.model,
            'primary_image_url', v_primary_image_url,
            'status', v_proposal.status,
            'created_at', v_proposal.created_at,
            'published_at', v_proposal.published_at
        )
    );
end;
$$;

revoke all on function public.add_home_item_catalog_product_to_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.add_home_item_catalog_product_to_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.build_company_job_catalog_publication_review(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_item public.home_items%rowtype;
    v_product public.company_approved_products%rowtype;
    v_variant public.catalog_product_variants%rowtype;
    v_family public.catalog_product_families%rowtype;
    v_proposal public.home_item_catalog_proposals%rowtype;
    v_product_id uuid;
    v_existing_facts jsonb;
    v_catalog_facts jsonb;
    v_conflicts jsonb;
begin
    select workflow.* into v_workflow
    from public.company_job_workflows workflow
    where workflow.id = p_workflow_id;
    if not found or v_workflow.home_item_id is null then return null; end if;

    v_product_id := public.company_job_selected_catalog_product_id(v_workflow.id);
    if v_product_id is null then return null; end if;

    select proposal.* into v_proposal
    from public.home_item_catalog_proposals proposal
    where proposal.estimate_session_id = v_workflow.estimate_session_id
      and proposal.home_item_id = v_workflow.home_item_id
      and proposal.company_catalog_product_id = v_product_id
    order by proposal.created_at desc
    limit 1;
    if not found then return null; end if;

    select item.* into v_item
    from public.home_items item
    where item.id = v_workflow.home_item_id
      and item.property_id = v_workflow.property_id;
    if not found then return null; end if;

    select product.* into v_product
    from public.company_approved_products product
    where product.id = v_product_id
      and product.company_id = v_workflow.company_id;
    if not found then return null; end if;

    if v_product.master_product_variant_id is not null then
        select variant.* into v_variant
        from public.catalog_product_variants variant
        where variant.id = v_product.master_product_variant_id;
        if v_variant.product_family_id is not null then
            select family.* into v_family
            from public.catalog_product_families family
            where family.id = v_variant.product_family_id;
        end if;
    end if;

    v_existing_facts := jsonb_build_object(
        'brand', v_item.brand,
        'model', v_item.model,
        'part_number', v_item.part_number
    );
    v_catalog_facts := jsonb_build_object(
        'brand', coalesce(nullif(btrim(v_family.brand), ''), nullif(btrim(v_product.brand), '')),
        'model', coalesce(nullif(btrim(v_variant.model_number), ''), nullif(btrim(v_product.model), '')),
        'part_number', coalesce(nullif(btrim(v_variant.manufacturer_part_number), ''), nullif(btrim(v_product.manufacturer_part_number), '')),
        'finish', coalesce(nullif(btrim(v_variant.finish), ''), nullif(btrim(v_variant.specifications->>'finish'), '')),
        'product_type', coalesce(nullif(btrim(v_variant.specifications->>'product_type'), ''), nullif(btrim(v_variant.specifications->>'type'), ''), nullif(btrim(v_product.category), '')),
        'specifications', coalesce(v_variant.specifications, '{}'::jsonb) || coalesce(v_product.product_specifications, '{}'::jsonb),
        'product_variant_id', coalesce(v_product.master_product_variant_id, v_proposal.product_variant_id)
    );

    select coalesce(jsonb_agg(jsonb_build_object(
        'field', conflict.field_key,
        'label', conflict.field_label,
        'existing_value', conflict.existing_value,
        'catalog_value', conflict.catalog_value
    ) order by conflict.position), '[]'::jsonb)
    into v_conflicts
    from (values
        (1, 'brand', 'Brand', v_item.brand, v_catalog_facts->>'brand'),
        (2, 'model', 'Model', v_item.model, v_catalog_facts->>'model'),
        (3, 'part_number', 'Part number', v_item.part_number, v_catalog_facts->>'part_number')
    ) conflict(position, field_key, field_label, existing_value, catalog_value)
    where public.home_item_catalog_fact_is_meaningful(conflict.catalog_value)
      and public.home_item_catalog_fact_is_meaningful(conflict.existing_value)
      and lower(btrim(conflict.existing_value)) <> lower(btrim(conflict.catalog_value));

    return jsonb_build_object(
        'proposal_id', v_proposal.id,
        'reviewed_at', v_proposal.publication_reviewed_at,
        'resolutions', coalesce(v_proposal.publication_review->'resolutions', '{}'::jsonb),
        'existing_facts', v_existing_facts,
        'catalog_facts', v_catalog_facts,
        'conflicts', v_conflicts,
        'product', jsonb_build_object(
            'id', v_product.id,
            'product_name', coalesce(nullif(btrim(v_product.product_name), ''), concat_ws(' ', v_product.brand, v_product.model)),
            'category', v_product.category,
            'brand', coalesce(nullif(btrim(v_family.brand), ''), v_product.brand),
            'model', coalesce(nullif(btrim(v_variant.model_number), ''), v_product.model),
            'manufacturer_part_number', coalesce(nullif(btrim(v_variant.manufacturer_part_number), ''), v_product.manufacturer_part_number),
            'workmanship_warranty', v_product.workmanship_warranty,
            'labor_warranty', v_product.labor_warranty,
            'manufacturer_warranty', coalesce(v_product.manufacturer_warranty, v_product.warranty),
            'finish', v_catalog_facts->>'finish',
            'product_type', v_catalog_facts->>'product_type',
            'specifications', v_catalog_facts->'specifications'
        )
    );
end;
$$;

revoke all on function public.build_company_job_catalog_publication_review(uuid) from public, anon, authenticated;

create or replace function public.get_company_job_catalog_publication_review(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    select workflow.* into v_workflow
    from public.company_job_workflows workflow
    where workflow.id = p_workflow_id;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    return public.build_company_job_catalog_publication_review(p_workflow_id);
end;
$$;

revoke all on function public.get_company_job_catalog_publication_review(uuid) from public, anon;
grant execute on function public.get_company_job_catalog_publication_review(uuid) to authenticated;

create or replace function public.save_company_job_catalog_publication_review(
    p_workflow_id uuid,
    p_resolutions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_review jsonb;
    v_conflict jsonb;
    v_resolution text;
    v_proposal_id uuid;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if jsonb_typeof(coalesce(p_resolutions, '{}'::jsonb)) <> 'object' then
        raise exception 'Catalog conflict choices must be an object.';
    end if;

    select workflow.* into v_workflow
    from public.company_job_workflows workflow
    where workflow.id = p_workflow_id
    for update;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then
        raise exception 'Job workflow is unavailable.';
    end if;
    if v_workflow.status <> 'work_in_progress' then
        raise exception 'Review catalog product facts while work is in progress.';
    end if;

    v_review := public.build_company_job_catalog_publication_review(v_workflow.id);
    if v_review is null then return null; end if;

    for v_conflict in select value from jsonb_array_elements(coalesce(v_review->'conflicts', '[]'::jsonb))
    loop
        v_resolution := p_resolutions->>(v_conflict->>'field');
        if v_resolution not in ('existing', 'catalog') then
            raise exception 'Choose whether to keep the existing % or use the catalog value.', lower(v_conflict->>'label');
        end if;
    end loop;

    v_proposal_id := (v_review->>'proposal_id')::uuid;
    update public.home_item_catalog_proposals
    set publication_review = jsonb_build_object(
            'existing_facts', v_review->'existing_facts',
            'catalog_facts', v_review->'catalog_facts',
            'conflicts', v_review->'conflicts',
            'resolutions', coalesce(p_resolutions, '{}'::jsonb)
        ),
        publication_reviewed_at = now(),
        publication_reviewed_by_user_id = auth.uid(),
        updated_at = now()
    where id = v_proposal_id;

    return public.build_company_job_catalog_publication_review(v_workflow.id);
end;
$$;

revoke all on function public.save_company_job_catalog_publication_review(uuid,jsonb) from public, anon;
grant execute on function public.save_company_job_catalog_publication_review(uuid,jsonb) to authenticated;

create or replace function public.enforce_company_job_catalog_publication_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_review jsonb;
    v_stored_review jsonb;
    v_conflict jsonb;
begin
    if new.status <> 'work_complete' or old.status is not distinct from new.status then return new; end if;

    v_review := public.build_company_job_catalog_publication_review(new.id);
    if v_review is null then return new; end if;

    select proposal.publication_review into v_stored_review
    from public.home_item_catalog_proposals proposal
    where proposal.id = (v_review->>'proposal_id')::uuid;

    if v_stored_review is null then
        raise exception 'Review the proposed catalog product before completing this linked job.';
    end if;
    if v_stored_review->'existing_facts' is distinct from v_review->'existing_facts' then
        raise exception 'HomeOS item facts changed after catalog review. Reopen closeout and review the conflicts again.';
    end if;

    for v_conflict in select value from jsonb_array_elements(coalesce(v_review->'conflicts', '[]'::jsonb))
    loop
        if v_stored_review->'resolutions'->>(v_conflict->>'field') not in ('existing', 'catalog') then
            raise exception 'Resolve every catalog product conflict before completing this job.';
        end if;
    end loop;

    return new;
end;
$$;

revoke all on function public.enforce_company_job_catalog_publication_review() from public, anon, authenticated;

drop trigger if exists company_job_workflows_require_catalog_publication_review on public.company_job_workflows;
create trigger company_job_workflows_require_catalog_publication_review
before update of status on public.company_job_workflows
for each row execute function public.enforce_company_job_catalog_publication_review();

create or replace function public.publish_company_job_catalog_proposal(p_workflow_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_product_id uuid;
    v_proposal public.home_item_catalog_proposals%rowtype;
    v_target public.home_items%rowtype;
    v_facts jsonb;
    v_existing jsonb;
    v_resolutions jsonb;
    v_brand text;
    v_model text;
    v_part_number text;
begin
    select workflow.* into v_workflow
    from public.company_job_workflows workflow
    where workflow.id = p_workflow_id
    for update;
    if not found or v_workflow.status <> 'closed' then
        raise exception 'The job must be closed before the catalog product is published.';
    end if;

    v_product_id := public.company_job_selected_catalog_product_id(v_workflow.id);
    if v_product_id is null then return jsonb_build_object('published', false); end if;

    select proposal.* into v_proposal
    from public.home_item_catalog_proposals proposal
    where proposal.estimate_session_id = v_workflow.estimate_session_id
      and proposal.home_item_id = v_workflow.home_item_id
      and proposal.company_catalog_product_id = v_product_id
    order by proposal.created_at desc
    limit 1
    for update;
    if not found then return jsonb_build_object('published', false); end if;
    if v_proposal.status = 'published' then
        return jsonb_build_object('published', true, 'home_item_id', v_proposal.published_home_item_id);
    end if;
    if v_proposal.publication_review is null then
        raise exception 'Catalog publication review is required before job closeout.';
    end if;

    select item.* into v_target
    from public.home_items item
    where item.id = coalesce(v_workflow.completed_home_item_id, v_workflow.home_item_id)
      and item.property_id = v_workflow.property_id
    for update;
    if not found then raise exception 'The completed HomeOS item is unavailable.'; end if;

    v_facts := coalesce(v_proposal.publication_review->'catalog_facts', '{}'::jsonb);
    v_existing := coalesce(v_proposal.publication_review->'existing_facts', '{}'::jsonb);
    v_resolutions := coalesce(v_proposal.publication_review->'resolutions', '{}'::jsonb);

    v_brand := case
        when not public.home_item_catalog_fact_is_meaningful(v_facts->>'brand') then v_target.brand
        when not public.home_item_catalog_fact_is_meaningful(v_target.brand) then v_facts->>'brand'
        when v_resolutions->>'brand' = 'catalog' then v_facts->>'brand'
        when v_resolutions->>'brand' = 'existing' then v_existing->>'brand'
        else v_target.brand
    end;
    v_model := case
        when not public.home_item_catalog_fact_is_meaningful(v_facts->>'model') then v_target.model
        when not public.home_item_catalog_fact_is_meaningful(v_target.model) then v_facts->>'model'
        when v_resolutions->>'model' = 'catalog' then v_facts->>'model'
        when v_resolutions->>'model' = 'existing' then v_existing->>'model'
        else v_target.model
    end;
    v_part_number := case
        when not public.home_item_catalog_fact_is_meaningful(v_facts->>'part_number') then v_target.part_number
        when not public.home_item_catalog_fact_is_meaningful(v_target.part_number) then v_facts->>'part_number'
        when v_resolutions->>'part_number' = 'catalog' then v_facts->>'part_number'
        when v_resolutions->>'part_number' = 'existing' then v_existing->>'part_number'
        else v_target.part_number
    end;

    update public.home_items
    set brand = v_brand,
        model = v_model,
        part_number = v_part_number,
        catalog_product_id = v_proposal.company_catalog_product_id,
        master_product_variant_id = v_proposal.product_variant_id
    where id = v_target.id;

    update public.home_item_service_history
    set brand = v_brand,
        model = v_model,
        part_number = v_part_number,
        catalog_product_id = v_proposal.company_catalog_product_id,
        updated_at = now()
    where workflow_id = v_workflow.id
      and home_item_id = v_target.id;

    update public.home_item_catalog_proposals
    set status = 'published',
        published_home_item_id = v_target.id,
        published_at = now(),
        updated_at = now()
    where id = v_proposal.id;

    return jsonb_build_object(
        'published', true,
        'proposal_id', v_proposal.id,
        'home_item_id', v_target.id,
        'catalog_product_id', v_proposal.company_catalog_product_id,
        'product_variant_id', v_proposal.product_variant_id
    );
end;
$$;

revoke all on function public.publish_company_job_catalog_proposal(uuid) from public, anon, authenticated;

-- Preserve the established HomeOS closeout/history behavior. Existing catalog
-- choices still link at work completion; only the new item proposal path is
-- deferred until the job reaches closed.
create or replace function public.sync_company_job_homeos_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
    v_catalog_id uuid;
    v_completed_item_id uuid;
    v_has_proposal boolean := false;
begin
    if new.status = 'work_complete' and old.status is distinct from new.status and new.home_item_id is not null then
        v_result := public.apply_company_job_homeos_closeout(new.id);
        v_catalog_id := public.company_job_selected_catalog_product_id(new.id);
        begin
            v_completed_item_id := nullif(v_result->>'home_item_id', '')::uuid;
        exception when invalid_text_representation then
            v_completed_item_id := null;
        end;

        if v_catalog_id is not null then
            select exists (
                select 1 from public.home_item_catalog_proposals proposal
                where proposal.estimate_session_id = new.estimate_session_id
                  and proposal.home_item_id = new.home_item_id
                  and proposal.company_catalog_product_id = v_catalog_id
            ) into v_has_proposal;
        end if;

        if v_catalog_id is not null and v_completed_item_id is not null and not v_has_proposal then
            update public.home_items set catalog_product_id = v_catalog_id where id = v_completed_item_id;
            update public.home_item_service_history set catalog_product_id = v_catalog_id where workflow_id = new.id and home_item_id = v_completed_item_id;
        end if;
    end if;

    if new.completion_accepted_at is distinct from old.completion_accepted_at and new.completion_accepted_at is not null then
        update public.home_item_service_history
        set completion_homeowner_name = new.completion_homeowner_name,
            completion_accepted_at = new.completion_accepted_at,
            customer_signature_recorded = new.completion_homeowner_signature is not null,
            updated_at = now()
        where workflow_id = new.id;
    end if;

    if new.invoice_sent_at is distinct from old.invoice_sent_at and new.invoice_sent_at is not null then
        update public.home_item_service_history
        set invoice_reference = coalesce(invoice_reference, new.id::text), updated_at = now()
        where workflow_id = new.id;
    end if;

    if new.status = 'closed' and old.status is distinct from new.status then
        perform public.publish_company_job_catalog_proposal(new.id);
    end if;

    return new;
end;
$$;

commit;
