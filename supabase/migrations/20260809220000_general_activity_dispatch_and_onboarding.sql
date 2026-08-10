begin;
create table if not exists public.general_company_policies (
    company_id uuid primary key references public.companies(id) on delete cascade,
    onboarding_mode text not null default 'test' check (onboarding_mode in ('test', 'production')),
    required_profile_fields text[] not null default array[]::text[] check (
        required_profile_fields <@ array['display_name','professional_bio','years_experience','trade','skills','certifications','licenses']::text[]
    ),
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.general_technician_profiles (
    company_user_id uuid primary key references public.company_users(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    display_name text not null,
    professional_bio text null,
    years_experience integer null check (years_experience is null or years_experience between 0 and 80),
    trade text not null default 'general' check (trade in ('general', 'plumbing', 'electrical', 'hvac')),
    skills text[] not null default array[]::text[],
    certifications jsonb not null default '[]'::jsonb check (jsonb_typeof(certifications) = 'array'),
    licenses jsonb not null default '[]'::jsonb check (jsonb_typeof(licenses) = 'array'),
    profile_photo_url text null,
    lead_technician boolean not null default false,
    homeowner_visible boolean not null default true,
    completed_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (company_id, company_user_id)
);
create table if not exists public.general_dispatch_recommendations (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete restrict,
    technician_name text not null,
    proposed_start_at timestamptz not null,
    proposed_end_at timestamptz not null,
    rationale text[] not null default array[]::text[],
    facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
    score integer not null,
    status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'executed', 'failed')),
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    decision_by_user_id uuid null references auth.users(id) on delete set null,
    decision_at timestamptz null,
    action_preview_id uuid null references public.general_action_previews(id) on delete set null,
    resulting_schedule_slot_id uuid null references public.job_schedule_slots(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (proposed_end_at > proposed_start_at)
);
create index if not exists general_dispatch_recommendations_company_idx
    on public.general_dispatch_recommendations(company_id, created_at desc);
create index if not exists general_dispatch_recommendations_request_idx
    on public.general_dispatch_recommendations(service_request_id, created_at desc);
alter table public.general_company_policies enable row level security;
alter table public.general_technician_profiles enable row level security;
alter table public.general_dispatch_recommendations enable row level security;
drop policy if exists general_company_policies_read on public.general_company_policies;
create policy general_company_policies_read on public.general_company_policies for select to authenticated
using (public.general_can_access_company(company_id));
drop policy if exists general_technician_profiles_read on public.general_technician_profiles;
create policy general_technician_profiles_read on public.general_technician_profiles for select to authenticated
using (
    public.general_can_access_company(company_id)
    or exists (
        select 1
          from public.job_schedule_slots slot
          join public.service_requests request on request.id = slot.service_request_id and request.company_id = slot.company_id
         where slot.company_id = general_technician_profiles.company_id
           and slot.technician_company_user_id = general_technician_profiles.company_user_id
           and general_technician_profiles.homeowner_visible
           and public.homeos_can_read_property_record(request.property_id)
    )
);
drop policy if exists general_technician_profiles_write_self on public.general_technician_profiles;
create policy general_technician_profiles_write_self on public.general_technician_profiles for all to authenticated
using (exists (select 1 from public.company_users cu where cu.id = company_user_id and cu.auth_user_id = auth.uid()))
with check (exists (select 1 from public.company_users cu where cu.id = company_user_id and cu.company_id = general_technician_profiles.company_id and cu.auth_user_id = auth.uid()));
drop policy if exists general_dispatch_recommendations_read on public.general_dispatch_recommendations;
create policy general_dispatch_recommendations_read on public.general_dispatch_recommendations for select to authenticated
using (
    created_by_user_id=auth.uid()
    or public.homeos_is_platform_admin()
    or public.can_dispatch_company(company_id)
);
revoke insert, update, delete on public.general_company_policies from public, anon, authenticated;
revoke insert, update, delete on public.general_dispatch_recommendations from public, anon, authenticated;
grant select on public.general_company_policies, public.general_technician_profiles, public.general_dispatch_recommendations to authenticated;
grant insert, update on public.general_technician_profiles to authenticated;
create or replace function public.general_get_activity_board(
    p_surface text,
    p_company_id uuid default null,
    p_property_id uuid default null,
    p_company_user_id uuid default null
)
returns table (
    category text, count integer, label text, icon text, tone text,
    explanation text, suggested_request text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_surface text := lower(btrim(coalesce(p_surface, '')));
    v_emergency integer := 0;
    v_decision integer := 0;
    v_message integer := 0;
    v_assignment integer := 0;
    v_healthy integer := 0;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if v_surface not in ('administration','techos','homeos') then raise exception 'Unsupported operating surface.'; end if;

    if v_surface = 'administration' then
        if p_company_id is not null and not (public.homeos_is_platform_admin() or public.can_dispatch_company(p_company_id)) then raise exception 'Administration or dispatch access is required.'; end if;
        if p_company_id is null and not public.homeos_is_platform_admin() then raise exception 'Choose an authorized company.'; end if;
        select count(*)::integer into v_emergency from public.service_requests request
         where (p_company_id is null or request.company_id = p_company_id)
           and (p_company_id is not null or public.homeos_is_platform_admin())
           and lower(coalesce(request.priority,'')) in ('emergency','urgent')
           and lower(coalesce(request.status,'')) not in ('completed','complete','closed','cancelled','canceled','archived');
        select count(*)::integer into v_message from public.service_request_dispatch_messages message
         where (p_company_id is null or message.company_id = p_company_id)
           and message.sender_user_id <> auth.uid() and message.created_at >= now() - interval '7 days';
        select count(*)::integer into v_assignment from public.job_schedule_slots slot
         where (p_company_id is null or slot.company_id = p_company_id)
           and slot.start_at >= now() - interval '4 hours'
           and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived');
        select count(*)::integer into v_healthy from public.service_requests request
         where (p_company_id is null or request.company_id = p_company_id)
           and lower(coalesce(request.status,'')) in ('completed','complete','closed')
           and request.updated_at >= date_trunc('day', now());
    elsif v_surface = 'techos' then
        if p_company_id is null or p_company_user_id is null or not exists (
            select 1 from public.company_users cu
             where cu.id=p_company_user_id and cu.company_id=p_company_id and cu.auth_user_id=auth.uid()
               and lower(btrim(coalesce(cu.status,'')))='active'
               and lower(btrim(coalesce(cu.role,''))) in ('technician','tech','field_tech','field-tech','field technician')
        ) then raise exception 'Active technician access is required.'; end if;
        select count(*)::integer into v_emergency from public.job_schedule_slots slot
          join public.service_requests request on request.id=slot.service_request_id and request.company_id=slot.company_id
         where slot.company_id=p_company_id and slot.technician_company_user_id=p_company_user_id
           and lower(coalesce(request.priority,'')) in ('emergency','urgent')
           and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived');
        select count(*)::integer into v_message from public.service_request_dispatch_messages message
         where message.company_id=p_company_id and message.sender_user_id<>auth.uid()
           and message.created_at>=now()-interval '7 days'
           and exists (select 1 from public.job_schedule_slots slot where slot.service_request_id=message.service_request_id and slot.technician_company_user_id=p_company_user_id);
        select count(*)::integer into v_assignment from public.job_schedule_slots slot
         where slot.company_id=p_company_id and slot.technician_company_user_id=p_company_user_id
           and slot.start_at>=now()-interval '4 hours'
           and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived');
        select count(*)::integer into v_healthy from public.job_schedule_slots slot
         where slot.company_id=p_company_id and slot.technician_company_user_id=p_company_user_id
           and lower(coalesce(slot.status,'')) in ('completed','complete','closed') and slot.updated_at>=date_trunc('day',now());
    else
        if p_property_id is null or not public.homeos_can_read_property_record(p_property_id) then raise exception 'Home access is required.'; end if;
        select count(*)::integer into v_emergency from public.service_requests request
         where request.property_id=p_property_id and lower(coalesce(request.priority,'')) in ('emergency','urgent')
           and lower(coalesce(request.status,'')) not in ('completed','complete','closed','cancelled','canceled','archived');
        select count(*)::integer into v_message from public.service_requests request
         where request.property_id=p_property_id and request.updated_at>=now()-interval '7 days' and request.created_at<request.updated_at;
        select count(*)::integer into v_assignment from public.job_schedule_slots slot
          join public.service_requests request on request.id=slot.service_request_id
         where request.property_id=p_property_id and slot.start_at>=now()-interval '4 hours'
           and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived');
        select count(*)::integer into v_healthy from public.service_requests request
         where request.property_id=p_property_id and lower(coalesce(request.status,'')) in ('completed','complete','closed')
           and request.updated_at>=date_trunc('day',now());
    end if;

    select count(*)::integer into v_decision from public.general_action_previews preview
     where preview.actor_user_id=auth.uid() and preview.status='awaiting_confirmation' and preview.expires_at>now();

    return query values
      ('emergency', v_emergency, 'Active emergency / SOS', 'sos', 'red',
       case when v_emergency=0 then 'No active emergency or SOS records require attention.' else v_emergency::text || ' active emergency or SOS record' || case when v_emergency=1 then ' requires' else 's require' end || ' review.' end,
       'Review active emergencies'),
      ('decision', v_decision, 'Decisions / approvals', 'attention', 'amber',
       case when v_decision=0 then 'No confirmation previews are waiting for your decision.' else v_decision::text || ' safe action preview' || case when v_decision=1 then ' is' else 's are' end || ' waiting for your decision.' end,
       'Show decisions awaiting confirmation'),
      ('message', v_message, 'Messages / updates', 'message', 'blue',
       case when v_message=0 then 'No recent permission-scoped updates are waiting.' else v_message::text || ' recent message or status update' || case when v_message=1 then ' is' else 's are' end || ' available.' end,
       'Show my recent updates'),
      ('assignment', v_assignment, 'Quotes / assignments', 'quote', 'purple',
       case when v_assignment=0 then 'No active quote or assignment count is available.' else v_assignment::text || ' active assignment or scheduled item' || case when v_assignment=1 then ' is' else 's are' end || ' in scope.' end,
       'Show active assignments'),
      ('healthy', v_healthy, 'Completed / healthy', 'check', 'green',
       case when v_healthy=0 then 'No completed records were added today.' else v_healthy::text || ' record' || case when v_healthy=1 then ' was' else 's were' end || ' completed today.' end,
       'Show completed work');
end;
$$;
revoke all on function public.general_get_activity_board(text,uuid,uuid,uuid) from public, anon;
grant execute on function public.general_get_activity_board(text,uuid,uuid,uuid) to authenticated;
create or replace function public.general_create_dispatch_recommendation(
    p_company_id uuid,
    p_service_request_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz
)
returns setof public.general_dispatch_recommendations
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_candidate record;
    v_required_trade text;
    v_saved public.general_dispatch_recommendations%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if p_company_id is null or p_service_request_id is null or p_start_at is null or p_end_at is null or p_end_at<=p_start_at then
        raise exception 'Company, service request, and a valid proposed time are required.';
    end if;
    if not (public.homeos_is_platform_admin() or public.can_dispatch_company(p_company_id)) then raise exception 'Dispatch permission is required.'; end if;
    select * into v_request from public.service_requests where id=p_service_request_id and company_id=p_company_id;
    if not found then raise exception 'Service request not found for this company.'; end if;
    v_required_trade := case
        when lower(coalesce(v_request.issue_summary,'')) ~ '(electric|outlet|panel|breaker|wire)' then 'electrical'
        when lower(coalesce(v_request.issue_summary,'')) ~ '(hvac|air condition|furnace|heat pump|vent)' then 'hvac'
        when lower(coalesce(v_request.issue_summary,'')) ~ '(plumb|water|leak|flood|drain|toilet|faucet|pipe)' then 'plumbing'
        else 'general' end;

    select candidate.* into v_candidate
      from (
        select cu.id, coalesce(nullif(btrim(profile.display_name),''),nullif(btrim(cu.full_name),''),nullif(btrim(cu.email),''),'Authorized technician') technician_name,
               coalesce(profile.trade, preference.trade, 'general') technician_trade,
               coalesce(profile.skills,array[]::text[]) skills,
               coalesce(profile.certifications,'[]'::jsonb) certifications,
               coalesce(profile.licenses,'[]'::jsonb) licenses,
               coalesce(profile.lead_technician,false) lead_technician,
               (select count(*)::integer from public.job_schedule_slots slot where slot.company_id=p_company_id and slot.technician_company_user_id=cu.id
                 and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived') and slot.start_at<p_end_at and slot.end_at>p_start_at) overlap_count,
               (select count(*)::integer from public.job_schedule_slots slot where slot.company_id=p_company_id and slot.technician_company_user_id=cu.id
                 and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived') and now() between slot.start_at and slot.end_at) active_count,
               coalesce((select round(sum(extract(epoch from (coalesce(entry.clocked_out_at,now())-entry.clocked_in_at))/60.0))::integer
                   from public.company_technician_time_entries entry where entry.company_id=p_company_id and entry.technician_company_user_id=cu.id
                     and entry.clocked_in_at>=date_trunc('week',now())),0) week_minutes,
               (case when coalesce(profile.trade,preference.trade,'general')=v_required_trade then 35 when v_required_trade='general' then 15 else 0 end)
               + (case when not exists (select 1 from public.job_schedule_slots slot where slot.company_id=p_company_id and slot.technician_company_user_id=cu.id
                    and lower(coalesce(slot.status,'')) not in ('completed','closed','cancelled','canceled','archived') and slot.start_at<p_end_at and slot.end_at>p_start_at) then 45 else -100 end)
               + (case when coalesce((select sum(extract(epoch from (coalesce(entry.clocked_out_at,now())-entry.clocked_in_at))/60.0)
                    from public.company_technician_time_entries entry where entry.company_id=p_company_id and entry.technician_company_user_id=cu.id and entry.clocked_in_at>=date_trunc('week',now())),0)<2400 then 15 else -20 end)
               + (case when coalesce(profile.lead_technician,false) then 5 else 0 end) score
          from public.company_users cu
          left join public.general_technician_profiles profile on profile.company_user_id=cu.id and profile.company_id=cu.company_id
          left join public.general_user_preferences preference on preference.user_id=cu.auth_user_id
         where cu.company_id=p_company_id and lower(coalesce(cu.status,''))='active'
           and lower(coalesce(cu.role,'')) in ('technician','tech','field_tech','field-tech','field technician','manager','admin','owner')
      ) candidate
     where candidate.overlap_count=0
     order by candidate.score desc, candidate.active_count asc, candidate.week_minutes asc, candidate.technician_name, candidate.id
     limit 1;
    if not found then raise exception 'No active, conflict-free technician is available for the proposed time.'; end if;

    insert into public.general_dispatch_recommendations(
        company_id, service_request_id, technician_company_user_id, technician_name, proposed_start_at, proposed_end_at,
        rationale, facts, score, created_by_user_id
    ) values (
        p_company_id, p_service_request_id, v_candidate.id, v_candidate.technician_name, p_start_at, p_end_at,
        array[
          case when v_candidate.technician_trade=v_required_trade then 'Trade profile matches the service request.' else 'The request has no specific trade match available; human review is required.' end,
          'No conflicting assignment exists in the proposed time window.',
          case when v_candidate.week_minutes<2400 then 'Recorded weekly time is below the overtime-risk threshold.' else 'Overtime risk is elevated and requires human review.' end,
          'General has not dispatched, scheduled, or notified anyone.'
        ],
        jsonb_build_array(
          jsonb_build_object('label','Required trade','value',v_required_trade,'available',true),
          jsonb_build_object('label','Technician trade','value',v_candidate.technician_trade,'available',true),
          jsonb_build_object('label','Skills','value',case when cardinality(v_candidate.skills)>0 then array_to_string(v_candidate.skills,', ') else 'Not provided' end,'available',cardinality(v_candidate.skills)>0),
          jsonb_build_object('label','Certifications','value',case when jsonb_array_length(v_candidate.certifications)>0 then v_candidate.certifications::text else 'Not provided' end,'available',jsonb_array_length(v_candidate.certifications)>0),
          jsonb_build_object('label','Licenses','value',case when jsonb_array_length(v_candidate.licenses)>0 then v_candidate.licenses::text else 'Not provided' end,'available',jsonb_array_length(v_candidate.licenses)>0),
          jsonb_build_object('label','Current assignments','value',v_candidate.active_count::text,'available',true),
          jsonb_build_object('label','Recorded week minutes','value',v_candidate.week_minutes::text,'available',true),
          jsonb_build_object('label','Drive time / location','value','Not available to this channel','available',false)
        ),
        v_candidate.score, auth.uid()
    ) returning * into v_saved;
    return next v_saved;
end;
$$;
revoke all on function public.general_create_dispatch_recommendation(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.general_create_dispatch_recommendation(uuid,uuid,timestamptz,timestamptz) to authenticated;
create or replace function public.general_cancel_action(p_preview_id uuid, p_reason text default 'Cancelled by user')
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_action text; v_recommendation_id uuid;
begin
    update public.general_action_previews set status='cancelled', result=jsonb_build_object('decision','declined','reason',left(coalesce(p_reason,'Cancelled'),500))
     where id=p_preview_id and actor_user_id=auth.uid() and status='awaiting_confirmation'
     returning action_id, nullif(payload->>'recommendation_id','')::uuid into v_action, v_recommendation_id;
    if not found then return false; end if;
    if v_action='admin.dispatch_assign' and v_recommendation_id is not null then
        update public.general_dispatch_recommendations set status='declined', decision_by_user_id=auth.uid(), decision_at=now(), action_preview_id=p_preview_id, updated_at=now()
         where id=v_recommendation_id and created_by_user_id=auth.uid() and status='proposed';
    end if;
    return true;
end;
$$;
revoke all on function public.general_cancel_action(uuid,text) from public, anon;
grant execute on function public.general_cancel_action(uuid,text) to authenticated;
create or replace function public.general_accept_dispatch_recommendation(p_preview_id uuid, p_recommendation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_preview public.general_action_previews%rowtype; v_rec public.general_dispatch_recommendations%rowtype;
begin
    select * into v_preview from public.general_action_previews where id=p_preview_id and actor_user_id=auth.uid() and status='claimed' and action_id='admin.dispatch_assign';
    if not found then raise exception 'A claimed dispatch confirmation is required.'; end if;
    select * into v_rec from public.general_dispatch_recommendations where id=p_recommendation_id and company_id=v_preview.company_id and status='proposed' for update;
    if not found then raise exception 'The dispatch recommendation is no longer available.'; end if;
    if (v_preview.payload->>'recommendation_id')::uuid<>v_rec.id then raise exception 'The confirmed preview does not match this recommendation.'; end if;
    update public.general_dispatch_recommendations set status='accepted', decision_by_user_id=auth.uid(), decision_at=now(), action_preview_id=p_preview_id, updated_at=now() where id=v_rec.id returning * into v_rec;
    return to_jsonb(v_rec);
end;
$$;
revoke all on function public.general_accept_dispatch_recommendation(uuid,uuid) from public, anon;
grant execute on function public.general_accept_dispatch_recommendation(uuid,uuid) to authenticated;
create or replace function public.general_complete_dispatch_recommendation(p_recommendation_id uuid, p_action_preview_id uuid, p_schedule_slot_id uuid, p_succeeded boolean)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    update public.general_dispatch_recommendations set status=case when p_succeeded then 'executed' else 'failed' end,
      resulting_schedule_slot_id=case when p_succeeded then p_schedule_slot_id else null end, action_preview_id=p_action_preview_id, updated_at=now()
     where id=p_recommendation_id and action_preview_id=p_action_preview_id and status='accepted';
    return found;
end;
$$;
revoke all on function public.general_complete_dispatch_recommendation(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.general_complete_dispatch_recommendation(uuid,uuid,uuid,boolean) to service_role;
create or replace function public.general_prepare_action(
    p_action_id text, p_summary text, p_company_id uuid default null, p_property_id uuid default null,
    p_job_id uuid default null, p_context jsonb default '{}'::jsonb, p_payload jsonb default '{}'::jsonb
)
returns table (id uuid, summary text, context jsonb, payload jsonb, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor uuid := auth.uid(); v_action text := lower(btrim(coalesce(p_action_id,''))); v_risk text;
    v_row public.general_action_previews%rowtype; v_rec public.general_dispatch_recommendations%rowtype;
begin
    if v_actor is null then raise exception 'Not authenticated.'; end if;
    v_risk := case
      when v_action in ('admin.protected_change','admin.dispatch_assign') then 'protected'
      when v_action in ('tech.create_quote_draft','tech.clock_in','tech.clock_out','tech.update_job_status','tech.inventory_store','common.recording_start','common.recording_resume','home.emergency_create','home.quote_approve') then 'consequential'
      when v_action in ('common.recording_pause','common.recording_stop') then 'low' else null end;
    if v_risk is null then raise exception 'Action is not available in the controlled confirmation registry.'; end if;
    if v_action like 'admin.%' and not (public.homeos_is_platform_admin() or (p_company_id is not null and public.can_dispatch_company(p_company_id))) then raise exception 'Administration or dispatch permission is required.'; end if;
    if (v_action like 'tech.%' or v_action like 'common.recording%') and not public.general_can_access_company(p_company_id) then raise exception 'Active company access is required.'; end if;
    if v_action like 'home.%' and (p_property_id is null or not public.homeos_can_read_property_record(p_property_id)) then raise exception 'Home access is required.'; end if;
    if v_action='admin.dispatch_assign' then
       select * into v_rec from public.general_dispatch_recommendations where id=nullif(p_payload->>'recommendation_id','')::uuid and company_id=p_company_id and status='proposed';
       if not found then raise exception 'A current dispatch recommendation is required.'; end if;
    end if;
    insert into public.general_action_previews(actor_user_id,action_id,risk,summary,company_id,property_id,job_id,context,payload)
    values(v_actor,v_action,v_risk,left(btrim(coalesce(p_summary,'Review action')),500),p_company_id,p_property_id,p_job_id,coalesce(p_context,'{}'::jsonb),coalesce(p_payload,'{}'::jsonb))
    returning * into v_row;
    return query select v_row.id,v_row.summary,v_row.context,v_row.payload,v_row.expires_at;
end;
$$;
revoke all on function public.general_prepare_action(text,text,uuid,uuid,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.general_prepare_action(text,text,uuid,uuid,uuid,jsonb,jsonb) to authenticated;
comment on table public.general_dispatch_recommendations is 'Permission-scoped, read-only recommendations. A separate confirmed General action is required before the existing dispatch RPC executes.';
comment on table public.general_technician_profiles is 'Display-only technician profile details; no identity documents or biometric analysis.';
commit;
