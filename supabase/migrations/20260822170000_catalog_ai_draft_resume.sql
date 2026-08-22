-- Lightweight discovery for open AI Catalog Builder drafts. Full payloads remain
-- behind get_catalog_ai_draft(uuid), and every path stays platform-admin only.

begin;

create or replace function public.list_open_catalog_ai_drafts(p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
    v_result jsonb;
begin
    perform public.catalog_factory_require_admin();

    select coalesce(jsonb_agg(to_jsonb(summary) order by summary.updated_at desc), '[]'::jsonb)
    into v_result
    from (
        select
            draft.id,
            draft.status,
            draft.category_template_id,
            template.category_name,
            nullif(btrim(coalesce(draft.draft_payload->>'manufacturer', '')), '') as manufacturer,
            nullif(btrim(coalesce(draft.draft_payload->>'product_name', '')), '') as product_name,
            nullif(btrim(coalesce(draft.draft_payload->>'family_name', '')), '') as family_name,
            nullif(btrim(coalesce(draft.draft_payload->>'model_number', '')), '') as model_number,
            nullif(btrim(coalesce(draft.draft_payload->>'subtype', '')), '') as subtype,
            (
                select candidate.image_url
                from public.catalog_ai_image_candidates candidate
                where candidate.catalog_ai_draft_id = draft.id
                  and candidate.selection_status = 'selected'
                  and candidate.is_primary
                order by candidate.updated_at desc
                limit 1
            ) as primary_image_url,
            draft.created_by_user_id,
            draft.updated_by_user_id,
            draft.created_at,
            draft.updated_at
        from public.catalog_ai_drafts draft
        left join public.catalog_category_templates template on template.id = draft.category_template_id
        where draft.status = 'draft'
        order by draft.updated_at desc
        limit v_limit
    ) summary;

    return v_result;
end;
$$;

revoke all on function public.list_open_catalog_ai_drafts(integer) from public, anon;
grant execute on function public.list_open_catalog_ai_drafts(integer) to authenticated;

commit;
