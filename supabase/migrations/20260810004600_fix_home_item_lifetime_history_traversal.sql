-- Repair bidirectional replacement-history traversal. PostgreSQL permits one
-- recursive reference per recursive term, so normalize replacement links into
-- an edge list before walking the item family.

create or replace function public.get_home_item_lifetime_history(
    p_home_item_id uuid,
    p_company_id uuid default null,
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
    v_property_id uuid;
    v_allowed boolean := false;
    v_entries jsonb := '[]'::jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select item.property_id into v_property_id
    from public.home_items as item
    where item.id = p_home_item_id;

    if v_property_id is null then raise exception 'HomeOS item not found.'; end if;

    v_allowed := public.homeos_can_read_property_record(v_property_id)
        or (
            p_company_id is not null
            and public.homeos_can_read_company_construction_history(
                p_company_id, v_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
            )
        )
        or (
            p_company_id is not null
            and public.homeos_can_read_provider_assigned_items(
                p_company_id, v_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
            )
        );

    if not v_allowed then
        raise exception 'Not authorized to view this item history.' using errcode = '42501';
    end if;

    with recursive
    item_edges(source_id, target_id) as (
        select replacement.old_home_item_id, replacement.new_home_item_id
        from public.home_item_replacements as replacement
        union all
        select replacement.new_home_item_id, replacement.old_home_item_id
        from public.home_item_replacements as replacement
    ),
    item_family(id) as (
        select p_home_item_id
        union
        select edge.target_id
        from item_family as family
        join item_edges as edge on edge.source_id = family.id
    )
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', history.id,
            'home_item_id', history.home_item_id,
            'previous_home_item_id', history.previous_home_item_id,
            'entry_type', history.entry_type,
            'completion_date', history.completion_date,
            'company_name', history.company_name,
            'technician_name', history.technician_name,
            'original_problem', history.original_problem,
            'findings', history.findings,
            'recommended_work', history.recommended_work,
            'approved_scope', history.approved_scope,
            'work_performed', history.work_performed,
            'installation_notes', history.installation_notes,
            'brand', history.brand,
            'model', history.model,
            'serial_number', history.serial_number,
            'part_number', history.part_number,
            'estimate_reference', history.estimate_reference,
            'invoice_reference', history.invoice_reference,
            'completion_homeowner_name', history.completion_homeowner_name,
            'completion_accepted_at', history.completion_accepted_at,
            'customer_signature_recorded', history.customer_signature_recorded,
            'warranties', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', warranty.id,
                    'warranty_type', warranty.warranty_type,
                    'coverage_kind', warranty.coverage_kind,
                    'custom_label', warranty.custom_label,
                    'start_date', warranty.start_date,
                    'expiration_date', warranty.expiration_date,
                    'notes', warranty.notes,
                    'verification_status', warranty.verification_status
                ) order by warranty.warranty_type)
                from public.home_item_warranties as warranty
                where warranty.service_history_id = history.id
            ), '[]'::jsonb),
            'media', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', attachment.id,
                    'stage', history_attachment.media_role,
                    'bucket', attachment.bucket,
                    'storage_path', attachment.storage_path,
                    'file_name', attachment.file_name,
                    'mime_type', attachment.mime_type,
                    'caption', attachment.caption,
                    'created_at', attachment.created_at
                ) order by attachment.created_at)
                from public.home_item_service_history_attachments as history_attachment
                join public.company_job_workflow_attachments as attachment
                  on attachment.id = history_attachment.workflow_attachment_id
                where history_attachment.service_history_id = history.id
            ), '[]'::jsonb)
        ) order by history.completion_date desc, history.created_at desc), '[]'::jsonb)
    into v_entries
    from public.home_item_service_history as history
    where history.home_item_id in (select family.id from item_family as family);

    return jsonb_build_object('item_id', p_home_item_id, 'entries', v_entries);
end;
$$;

revoke all on function public.get_home_item_lifetime_history(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_home_item_lifetime_history(uuid, uuid, uuid, uuid, uuid) to authenticated;
