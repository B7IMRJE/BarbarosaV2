begin;
-- Technician-facing profile fields are self-managed through a narrow RPC. Privileged
-- designations such as lead technician remain server/admin controlled.
revoke insert, update, delete on public.general_technician_profiles from authenticated;
create or replace function public.general_save_technician_profile(
    p_company_user_id uuid,
    p_company_id uuid,
    p_display_name text,
    p_professional_bio text default null,
    p_years_experience integer default null,
    p_trade text default 'general',
    p_skills text[] default array[]::text[],
    p_certifications jsonb default '[]'::jsonb,
    p_licenses jsonb default '[]'::jsonb,
    p_profile_photo_url text default null,
    p_mark_complete boolean default true
)
returns public.general_technician_profiles
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_policy public.general_company_policies%rowtype;
    v_existing public.general_technician_profiles%rowtype;
    v_saved public.general_technician_profiles%rowtype;
    v_trade text := lower(btrim(coalesce(p_trade,'general')));
    v_name text := nullif(btrim(coalesce(p_display_name,'')),'');
    v_bio text := nullif(btrim(coalesce(p_professional_bio,'')),'');
    v_photo text := nullif(btrim(coalesce(p_profile_photo_url,'')),'');
begin
    if v_actor is null or not exists (
        select 1 from public.company_users cu
         where cu.id=p_company_user_id and cu.company_id=p_company_id and cu.auth_user_id=v_actor
           and lower(btrim(coalesce(cu.status,'')))='active'
           and lower(btrim(coalesce(cu.role,''))) in ('technician','tech','field_tech','field-tech','field technician')
    ) then raise exception 'An active technician profile is required.'; end if;
    if v_name is null then raise exception 'Display name is required.'; end if;
    if p_years_experience is not null and p_years_experience not between 0 and 80 then raise exception 'Years of experience must be from 0 to 80.'; end if;
    if v_trade not in ('general','plumbing','electrical','hvac') then raise exception 'Unsupported trade.'; end if;
    if jsonb_typeof(coalesce(p_certifications,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_licenses,'[]'::jsonb))<>'array' then raise exception 'Credentials must be lists.'; end if;
    if v_photo is not null and v_photo !~* '^https://[^[:space:]]+$' then raise exception 'Profile photo must use an HTTPS display URL.'; end if;

    select * into v_policy from public.general_company_policies where company_id=p_company_id;
    if found and v_policy.onboarding_mode='production' then
        if 'display_name'=any(v_policy.required_profile_fields) and v_name is null then raise exception 'Display name is required by company policy.'; end if;
        if 'professional_bio'=any(v_policy.required_profile_fields) and v_bio is null then raise exception 'Professional bio is required by company policy.'; end if;
        if 'years_experience'=any(v_policy.required_profile_fields) and p_years_experience is null then raise exception 'Years of experience are required by company policy.'; end if;
        if 'trade'=any(v_policy.required_profile_fields) and v_trade='general' then raise exception 'Trade is required by company policy.'; end if;
        if 'skills'=any(v_policy.required_profile_fields) and cardinality(coalesce(p_skills,array[]::text[]))=0 then raise exception 'Skills are required by company policy.'; end if;
        if 'certifications'=any(v_policy.required_profile_fields) and jsonb_array_length(coalesce(p_certifications,'[]'::jsonb))=0 then raise exception 'Certifications are required by company policy.'; end if;
        if 'licenses'=any(v_policy.required_profile_fields) and jsonb_array_length(coalesce(p_licenses,'[]'::jsonb))=0 then raise exception 'Licenses are required by company policy.'; end if;
    end if;

    select * into v_existing from public.general_technician_profiles where company_user_id=p_company_user_id;
    insert into public.general_technician_profiles(
        company_user_id,company_id,display_name,professional_bio,years_experience,trade,skills,
        certifications,licenses,profile_photo_url,lead_technician,homeowner_visible,completed_at,updated_at
    ) values (
        p_company_user_id,p_company_id,left(v_name,120),left(v_bio,1000),p_years_experience,v_trade,
        coalesce(p_skills,array[]::text[]),coalesce(p_certifications,'[]'::jsonb),coalesce(p_licenses,'[]'::jsonb),
        v_photo,coalesce(v_existing.lead_technician,false),coalesce(v_existing.homeowner_visible,true),
        case when p_mark_complete then now() else v_existing.completed_at end,now()
    )
    on conflict (company_user_id) do update set
        display_name=excluded.display_name, professional_bio=excluded.professional_bio,
        years_experience=excluded.years_experience, trade=excluded.trade, skills=excluded.skills,
        certifications=excluded.certifications, licenses=excluded.licenses,
        profile_photo_url=excluded.profile_photo_url, completed_at=excluded.completed_at, updated_at=now()
    returning * into v_saved;
    return v_saved;
end;
$$;
revoke all on function public.general_save_technician_profile(uuid,uuid,text,text,integer,text,text[],jsonb,jsonb,text,boolean) from public, anon;
grant execute on function public.general_save_technician_profile(uuid,uuid,text,text,integer,text,text[],jsonb,jsonb,text,boolean) to authenticated;
insert into storage.buckets(id,name,public)
values('general-inventory-media','general-inventory-media',false)
on conflict(id) do update set public=false;
alter table public.company_inventory_media add column if not exists size_bytes bigint null;
alter table public.company_inventory_media add column if not exists duration_seconds integer null;
create or replace function public.general_inventory_storage_can_access(p_object_name text)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare v_parts text[]; v_company_id uuid; v_item_id uuid;
begin
    v_parts := storage.foldername(p_object_name);
    if coalesce(array_length(v_parts,1),0)<6 or v_parts[1]<>'companies' or v_parts[3]<>'inventory' then return false; end if;
    begin v_company_id:=v_parts[2]::uuid; v_item_id:=v_parts[4]::uuid;
    exception when invalid_text_representation then return false; end;
    return public.general_can_access_company(v_company_id)
       and exists(select 1 from public.company_inventory_items item where item.id=v_item_id and item.company_id=v_company_id and not item.archived);
end;
$$;
revoke all on function public.general_inventory_storage_can_access(text) from public, anon;
grant execute on function public.general_inventory_storage_can_access(text) to authenticated;
create or replace function public.general_inventory_storage_can_write(p_object_name text)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare v_parts text[]; v_company_id uuid; v_item_id uuid; v_preview_id uuid;
begin
    v_parts:=storage.foldername(p_object_name);
    if coalesce(array_length(v_parts,1),0)<6 or v_parts[1]<>'companies' or v_parts[3]<>'inventory' then return false; end if;
    begin v_company_id:=v_parts[2]::uuid; v_item_id:=v_parts[4]::uuid; v_preview_id:=v_parts[5]::uuid;
    exception when invalid_text_representation then return false; end;
    return exists(
        select 1 from public.general_action_previews preview
        join public.company_inventory_items item on item.id=v_item_id and item.company_id=v_company_id and not item.archived
         where preview.id=v_preview_id and preview.actor_user_id=auth.uid() and preview.company_id=v_company_id
           and preview.action_id='tech.inventory_store' and preview.status='executed'
           and item.created_by_user_id=auth.uid()
    );
end;
$$;
revoke all on function public.general_inventory_storage_can_write(text) from public, anon;
grant execute on function public.general_inventory_storage_can_write(text) to authenticated;
drop policy if exists general_inventory_media_objects_select on storage.objects;
create policy general_inventory_media_objects_select on storage.objects for select to authenticated
using(bucket_id='general-inventory-media' and public.general_inventory_storage_can_access(name));
drop policy if exists general_inventory_media_objects_insert on storage.objects;
create policy general_inventory_media_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='general-inventory-media' and public.general_inventory_storage_can_write(name));
drop policy if exists general_inventory_media_objects_delete on storage.objects;
create policy general_inventory_media_objects_delete on storage.objects for delete to authenticated
using(bucket_id='general-inventory-media' and public.general_inventory_storage_can_write(name));
create or replace function public.general_save_inventory_media(
    p_preview_id uuid,
    p_inventory_item_id uuid,
    p_media_id uuid,
    p_media_kind text,
    p_file_name text,
    p_mime_type text,
    p_size_bytes bigint,
    p_duration_seconds integer default null
)
returns public.company_inventory_media
language plpgsql security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_actor uuid:=auth.uid(); v_preview public.general_action_previews%rowtype;
    v_item public.company_inventory_items%rowtype; v_saved public.company_inventory_media%rowtype;
    v_kind text:=lower(btrim(coalesce(p_media_kind,''))); v_mime text:=lower(btrim(coalesce(p_mime_type,'')));
    v_file text; v_path text;
begin
    select * into v_preview from public.general_action_previews
     where id=p_preview_id and actor_user_id=v_actor and action_id='tech.inventory_store' and status='executed';
    if not found then raise exception 'An executed inventory confirmation is required before media can be attached.'; end if;
    select * into v_item from public.company_inventory_items
     where id=p_inventory_item_id and company_id=v_preview.company_id and created_by_user_id=v_actor and not archived;
    if not found then raise exception 'The confirmed inventory item was not found.'; end if;
    if v_kind not in ('photo','video','receipt','document') then raise exception 'Unsupported inventory media kind.'; end if;
    if coalesce(p_size_bytes,0)<=0 or (v_kind='video' and p_size_bytes>78643200) or (v_kind<>'video' and p_size_bytes>15728640) then raise exception 'Inventory media size is not allowed.'; end if;
    if v_kind='photo' and v_mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') then raise exception 'Unsupported inventory photo type.'; end if;
    if v_kind='video' and (v_mime not in ('video/mp4','video/quicktime','video/webm') or p_duration_seconds is null or p_duration_seconds not between 0 and 60) then raise exception 'Inventory video must be a supported format and 60 seconds or shorter.'; end if;
    if v_kind in ('receipt','document') and v_mime not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported receipt or document type.'; end if;
    v_file:=left(regexp_replace(btrim(coalesce(p_file_name,'')),'[^A-Za-z0-9_.-]+','-','g'),160);
    if v_file='' then v_file:='inventory-media'; end if;
    v_path:=concat_ws('/','companies',v_item.company_id::text,'inventory',v_item.id::text,p_preview_id::text,p_media_id::text,v_file);
    if not exists(select 1 from storage.objects object where object.bucket_id='general-inventory-media' and object.name=v_path) then raise exception 'Uploaded inventory media object was not found.'; end if;
    insert into public.company_inventory_media(id,company_id,inventory_item_id,media_kind,file_name,storage_path,mime_type,size_bytes,duration_seconds,created_by_user_id)
    values(p_media_id,v_item.company_id,v_item.id,v_kind,v_file,v_path,v_mime,p_size_bytes,p_duration_seconds,v_actor)
    returning * into v_saved;
    return v_saved;
end;
$$;
revoke all on function public.general_save_inventory_media(uuid,uuid,uuid,text,text,text,bigint,integer) from public, anon;
grant execute on function public.general_save_inventory_media(uuid,uuid,uuid,text,text,text,bigint,integer) to authenticated;
comment on function public.general_save_technician_profile is 'Allows only non-sensitive, homeowner-facing self-profile fields; privileged designations are preserved and cannot be self-granted.';
comment on function public.general_save_inventory_media is 'Attaches media only to an item created by the same actor through an executed General confirmation.';
create or replace function public.general_list_home_quotes(p_property_id uuid)
returns table(
    session_id uuid, workflow_id uuid, company_id uuid, provider_name text, quote_number text,
    status text, issue_summary text, selected_total numeric, presented_at timestamptz,
    accepted_at timestamptz, options jsonb
)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if p_property_id is null or not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Home access is required.';
    end if;
    return query
    select session.id, workflow.id, session.company_id,
           coalesce(company.public_name,company.dba_name,company.name,'Connected provider')::text,
           session.quote_number, coalesce(workflow.status,session.status)::text,
           nullif(btrim(request.issue_summary),'')::text, workflow.selected_total,
           session.presented_at, workflow.homeowner_accepted_at,
           coalesce((
               select jsonb_agg(jsonb_build_object(
                   'choice_id',option.source_choice_id,'title',option.title,
                   'total',option.deterministic_total,'selected',option.selected_for_presentation
               ) order by option.display_order)
                 from public.company_estimate_options option
                where option.session_id=session.id and option.company_id=session.company_id
                  and option.selected_for_presentation
           ),'[]'::jsonb)
      from public.company_estimate_option_sessions session
      join public.companies company on company.id=session.company_id
      left join public.company_job_workflows workflow on workflow.estimate_session_id=session.id and workflow.company_id=session.company_id
      left join public.service_requests request on request.id=session.service_request_id and request.company_id=session.company_id
     where session.property_id=p_property_id and session.status<>'archived'
       and (session.presented_at is not null or lower(coalesce(workflow.status,'')) in ('presenting','sold'))
     order by coalesce(workflow.homeowner_accepted_at,session.presented_at,session.updated_at) desc, session.id desc
     limit 50;
end;
$$;
revoke all on function public.general_list_home_quotes(uuid) from public, anon;
grant execute on function public.general_list_home_quotes(uuid) to authenticated;
commit;
