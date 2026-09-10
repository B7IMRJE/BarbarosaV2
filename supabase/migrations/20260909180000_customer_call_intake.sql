-- Company call intake exists before a homeowner/property, then becomes exactly one request.
create table public.company_customer_intakes (
 id uuid primary key default gen_random_uuid(),
 display_number bigint generated always as identity unique,
 company_id uuid not null references public.companies(id),
 invitation_id uuid not null unique references public.company_customer_invitations(id),
 creation_key text not null,
 customer_kind text not null check (customer_kind in ('new','existing')),
 service_reason text not null check (service_reason in ('setup','repair','warranty','maintenance')),
 urgency text not null check (urgency in ('regular','emergency')),
 customer_summary text not null default '',
 address_hint text not null default '',
 previous_work_reference text not null default '',
 suggested_property_id uuid references public.properties(id),
 property_id uuid references public.properties(id),
 service_request_id uuid unique references public.service_requests(id),
 confirmed_contact jsonb,
 customer_draft jsonb not null default '{}',
 started_at timestamptz,
 contact_confirmed_at timestamptz,
 submitted_at timestamptz,
 media_completed_at timestamptz,
 phone_handoff_ids uuid[] not null default '{}',
 cancelled_at timestamptz,
 created_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,creation_key),
 check (service_reason <> 'setup' or urgency = 'regular')
);
create index company_customer_intakes_pending_idx on public.company_customer_intakes(company_id,created_at) where submitted_at is null and cancelled_at is null;
alter table public.company_customer_intakes enable row level security;
revoke all on public.company_customer_intakes from anon, authenticated;
grant select on public.company_customer_intakes to authenticated;
create policy company_intake_office_read on public.company_customer_intakes for select to authenticated
 using (public.can_dispatch_company(company_id) or public.can_create_company_customer_invites(company_id));

create function public.create_company_customer_intake(p_company_id uuid, p_creation_key text, p_details jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_inv record; v_intake public.company_customer_intakes%rowtype;
 v_reason text := coalesce(p_details->>'serviceReason','setup');
 v_kind text := coalesce(p_details->>'customerKind','new');
 v_urgency text := coalesce(p_details->>'urgency','regular');
 v_property uuid := nullif(p_details->>'knownPropertyId','')::uuid;
begin
 if auth.uid() is null or not public.can_create_company_customer_invites(p_company_id) then raise exception 'Not authorized to invite customers for this company'; end if;
 if length(coalesce(p_creation_key,'')) not between 8 and 150 then raise exception 'Invitation request reference is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || p_creation_key,0));
 select * into v_intake from public.company_customer_intakes where company_id=p_company_id and creation_key=p_creation_key;
 if found then
  select * into v_inv from public.company_customer_invitations where id=v_intake.invitation_id;
  return jsonb_build_object('invitation_id',v_inv.id,'invited_email',v_inv.invited_email,'invited_name',v_inv.invited_name,'invited_phone',v_inv.invited_phone,'intake_id',v_intake.id);
 end if;
 if v_reason not in ('setup','repair','warranty','maintenance') or v_kind not in ('new','existing') or v_urgency not in ('regular','emergency') then raise exception 'Choose a customer type, service reason and urgency'; end if;
 if v_reason='setup' then v_urgency:='regular'; end if;
 if nullif(trim(p_details->>'invitedName'),'') is null or nullif(trim(p_details->>'invitedPhone'),'') is null or coalesce(p_details->>'invitedEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Customer name, email and phone are required'; end if;
 if length(p_details::text)>12000 then raise exception 'Invitation details are too long'; end if;
 if v_property is not null and not exists(select 1 from public.company_property_clients where company_id=p_company_id and property_id=v_property and status='active') then raise exception 'Choose an existing customer of this company'; end if;
 select * into v_inv from public.create_company_customer_invite(p_company_id,lower(trim(p_details->>'invitedEmail')),trim(p_details->>'invitedPhone'),trim(p_details->>'invitedName'),nullif(trim(p_details->>'note'),''));
 insert into public.company_customer_intakes(company_id,invitation_id,creation_key,customer_kind,service_reason,urgency,customer_summary,address_hint,previous_work_reference,suggested_property_id,created_by_user_id)
 values(p_company_id,v_inv.invitation_id,p_creation_key,v_kind,v_reason,v_urgency,coalesce(p_details->>'customerSummary',''),coalesce(p_details->>'addressHint',''),coalesce(p_details->>'previousWorkReference',''),v_property,auth.uid()) returning * into v_intake;
 return to_jsonb(v_inv) || jsonb_build_object('intake_id',v_intake.id);
end $$;

-- Only the invited, authenticated account can read customer intake. Never return office notes.
create function public.get_my_customer_intake(p_invite_code text default null,p_intake_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.company_customer_intakes%rowtype; i public.company_customer_invitations%rowtype; v_company text;
begin
 if auth.uid() is null then raise exception 'Sign in using your company invitation'; end if;
 select intake.* into v from public.company_customer_intakes intake join public.company_customer_invitations inv on inv.id=intake.invitation_id
 where (p_intake_id is not null and intake.id=p_intake_id) or (p_invite_code is not null and inv.invite_code=trim(p_invite_code)) limit 1;
 if not found then return null; end if;
 select * into i from public.company_customer_invitations where id=v.invitation_id;
 if lower(trim(i.invited_email)) is distinct from lower(trim(coalesce(auth.jwt()->>'email',''))) or (i.accepted_by_user_id is not null and i.accepted_by_user_id<>auth.uid()) then raise exception 'Use the email account that received this invitation'; end if;
 if i.revoked_at is not null or i.status not in ('pending','accepted') or (i.status='pending' and i.expires_at<=now()) or v.cancelled_at is not null then raise exception 'This invitation is no longer active. Contact the company for help'; end if;
 update public.company_customer_intakes set started_at=coalesce(started_at,now()) where id=v.id;
 select coalesce(public_name,dba_name,name) into v_company from public.companies where id=v.company_id;
 return (to_jsonb(v)-'creation_key'-'created_by_user_id'-'suggested_property_id') || jsonb_build_object('company_name',v_company,'invited_name',i.invited_name,'invited_email',i.invited_email,'invited_phone',i.invited_phone,'invite_code',i.invite_code,'property_id',coalesce(v.property_id,i.accepted_property_id),'suggested_property_id',case when public.homeos_can_read_property_record(v.suggested_property_id) then v.suggested_property_id else null end);
end $$;

create function public.save_my_customer_intake(p_intake_id uuid,p_contact jsonb default null,p_property_id uuid default null,p_draft jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.company_customer_intakes%rowtype; v_access jsonb; v_connection record;
begin
 v_access:=public.get_my_customer_intake(null,p_intake_id);
 if v_access is null then raise exception 'Invitation not found'; end if;
 select * into v from public.company_customer_intakes where id=p_intake_id for update;
 if v.submitted_at is not null then return v_access; end if;
 if p_contact is not null and (length(p_contact::text)>2000 or nullif(trim(p_contact->>'name'),'') is null or nullif(trim(p_contact->>'phone'),'') is null or coalesce(p_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Confirm your name, email and phone'; end if;
 if p_draft is not null and length(p_draft::text)>10000 then raise exception 'Request details are too long'; end if;
 if p_property_id is not null then
  if v.property_id is not null and v.property_id<>p_property_id then raise exception 'This call is already linked to a different home'; end if;
  if v.suggested_property_id is not null and v.suggested_property_id<>p_property_id then raise exception 'This invitation is for a different service address. Contact the company to correct it'; end if;
  select * into v_connection from public.accept_customer_invite_by_code(v_access->>'invite_code',p_property_id);
 end if;
 update public.company_customer_intakes set confirmed_contact=coalesce(p_contact,confirmed_contact),contact_confirmed_at=case when p_contact is null then contact_confirmed_at else now() end,property_id=coalesce(p_property_id,property_id),customer_draft=coalesce(p_draft,customer_draft),updated_at=now() where id=p_intake_id;
 return public.get_my_customer_intake(null,p_intake_id);
end $$;

create function public.submit_my_customer_intake(p_intake_id uuid,p_issue_summary text,p_request_type text,p_access_instructions text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.company_customer_intakes%rowtype; v_access jsonb; r record; label text;
begin
 v_access:=public.get_my_customer_intake(null,p_intake_id);
 if v_access is null then raise exception 'Invitation not found'; end if;
 select * into v from public.company_customer_intakes where id=p_intake_id for update;
 if v.service_reason='setup' then raise exception 'This invitation is for home setup only'; end if;
 if v.service_request_id is not null then
  select * into r from public.service_requests where id=v.service_request_id;
  return to_jsonb(r) || jsonb_build_object('service_request_id',r.id);
 end if;
 if v.property_id is null or v.contact_confirmed_at is null then raise exception 'Confirm your contact information and service address first'; end if;
 if nullif(trim(p_issue_summary),'') is null then raise exception 'Describe what needs service'; end if;
 if p_request_type not in ('regular','emergency') then raise exception 'Choose regular or emergency service'; end if;
 -- Preserve the urgent office report; the homeowner can escalate, but cannot silently downgrade it.
 if v.urgency='emergency' then p_request_type:='emergency'; end if;
 label:=case v.service_reason when 'warranty' then 'Warranty review requested' when 'maintenance' then 'Maintenance request' else 'Service request' end;
 select * into r from public.create_homeowner_service_request_with_access(v.property_id,v.company_id,p_request_type,label || ': ' || trim(p_issue_summary),case when p_request_type='emergency' then 'emergency' else 'normal' end,p_access_instructions);
 update public.company_customer_intakes set service_request_id=r.service_request_id,submitted_at=now(),updated_at=now(),urgency=p_request_type where id=p_intake_id;
 return to_jsonb(r);
end $$;

create function public.get_company_customer_intakes(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not (public.can_dispatch_company(p_company_id) or public.can_create_company_customer_invites(p_company_id)) then raise exception 'Not authorized to view this company intake queue'; end if;
 return coalesce((select jsonb_agg(to_jsonb(intake)-'creation_key' || jsonb_build_object('invited_name',inv.invited_name,'invited_email',inv.invited_email,'invited_phone',inv.invited_phone,'office_note',inv.note,'invitation_status',case when inv.status='pending' and inv.expires_at<=now() then 'expired' else inv.status end) order by intake.created_at desc)
 from public.company_customer_intakes intake join public.company_customer_invitations inv on inv.id=intake.invitation_id where intake.company_id=p_company_id and intake.service_reason<>'setup' and intake.submitted_at is null and intake.cancelled_at is null),'[]'::jsonb);
end $$;

create function public.cancel_company_customer_intake(p_intake_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v public.company_customer_intakes%rowtype;
begin
 select * into v from public.company_customer_intakes where id=p_intake_id for update;
 if not found or auth.uid() is null or not public.can_dispatch_company(v.company_id) then raise exception 'Not authorized to close this call'; end if;
 if v.service_request_id is not null then raise exception 'This call already has a service request. Use dispatch to update it'; end if;
 update public.company_customer_intakes set cancelled_at=now(),updated_at=now() where id=p_intake_id;
end $$;

revoke all on function public.create_company_customer_intake(uuid,text,jsonb),public.get_my_customer_intake(text,uuid),public.save_my_customer_intake(uuid,jsonb,uuid,jsonb),public.submit_my_customer_intake(uuid,text,text,text),public.get_company_customer_intakes(uuid),public.cancel_company_customer_intake(uuid) from public,anon;
grant execute on function public.create_company_customer_intake(uuid,text,jsonb),public.get_my_customer_intake(text,uuid),public.save_my_customer_intake(uuid,jsonb,uuid,jsonb),public.submit_my_customer_intake(uuid,text,text,text),public.get_company_customer_intakes(uuid),public.cancel_company_customer_intake(uuid) to authenticated;

create or replace function public.get_customer_invite_by_code(p_invite_code text)
returns table (
    invitation_id uuid,
    company_id uuid,
    company_name text,
    invited_email text,
    invited_phone text,
    invited_name text,
    note text,
    status text,
    expires_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if nullif(btrim(coalesce(p_invite_code, '')), '') is null then
        raise exception 'Invite code is required.';
    end if;

    return query
    select
        invitation.id,
        invitation.company_id,
        coalesce(company.public_name, company.dba_name, company.name)::text as company_name,
        invitation.invited_email,
        invitation.invited_phone,
        invitation.invited_name,
        null::text as note,
        case
            when lower(btrim(coalesce(invitation.status, ''))) = 'pending'
             and invitation.expires_at < now()
                then 'expired'
            else invitation.status
        end as status,
        invitation.expires_at,
        invitation.created_at
    from public.company_customer_invitations invitation
    join public.companies company on company.id = invitation.company_id
    where invitation.invite_code = btrim(p_invite_code)
    limit 1;
end;
$$;


create function public.create_my_customer_intake_home(p_intake_id uuid,p_home jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare v jsonb; h record;
begin
 v:=public.get_my_customer_intake(null,p_intake_id);
 if v is null then raise exception 'Invitation not found'; end if;
 if v->>'property_id' is not null then return (v->>'property_id')::uuid; end if;
 -- A confirmed existing home must be selected, never duplicated from an office hint.
 if exists(select 1 from public.property_memberships where user_id=auth.uid() and status='active') then
  raise exception 'Choose your existing service address';
 end if;
 select * into h from public.create_invited_homeowner_first_property(p_home,v->>'invite_code');
 perform public.save_my_customer_intake(p_intake_id,null,h.property_id,null);
 return h.property_id;
end $$;
revoke all on function public.create_my_customer_intake_home(uuid,jsonb) from public,anon;
grant execute on function public.create_my_customer_intake_home(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

create function public.link_my_customer_intake_phone(p_intake_id uuid,p_handoff_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v jsonb;
begin
 v:=public.get_my_customer_intake(null,p_intake_id);
 if v is null or not exists(select 1 from public.service_request_media_handoffs where id=p_handoff_id and created_by_user_id=auth.uid() and property_id=(v->>'property_id')::uuid and closed_at is null and expires_at>now()) then raise exception 'This phone link is not available to this request'; end if;
 update public.company_customer_intakes set phone_handoff_ids=array(select distinct unnest(phone_handoff_ids || array[p_handoff_id])) where id=p_intake_id;
end $$;
create function public.finish_my_customer_intake(p_intake_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v jsonb;
begin
 v:=public.get_my_customer_intake(null,p_intake_id);
 if v is null or v->>'service_request_id' is null then raise exception 'Submit your request first'; end if;
 update public.company_customer_intakes set media_completed_at=coalesce(media_completed_at,now()) where id=p_intake_id;
end $$;
revoke all on function public.link_my_customer_intake_phone(uuid,uuid),public.finish_my_customer_intake(uuid) from public,anon;
grant execute on function public.link_my_customer_intake_phone(uuid,uuid),public.finish_my_customer_intake(uuid) to authenticated;
notify pgrst,'reload schema';
