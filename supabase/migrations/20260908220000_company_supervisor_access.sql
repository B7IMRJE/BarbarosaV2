-- Company-scoped supervisor profiles, invitation overrides, and main-management controls.
begin;

alter table public.company_users drop constraint if exists company_users_role_check;
alter table public.company_users add constraint company_users_role_check check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'field_supervisor', 'office_supervisor', 'sales', 'technician'));

alter table public.company_user_invitations drop constraint if exists company_user_invitations_role_check;
alter table public.company_user_invitations add constraint company_user_invitations_role_check check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'field_supervisor', 'office_supervisor', 'sales', 'technician'));

alter table public.company_role_permission_profiles drop constraint if exists company_role_permission_profiles_role_check;
alter table public.company_role_permission_profiles add constraint company_role_permission_profiles_role_check check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'field_supervisor', 'office_supervisor', 'sales', 'technician'));

update public.company_users set role = 'field_supervisor', permissions = '{}'::jsonb where role = 'supervisor';

update public.company_user_invitations set role = 'field_supervisor', permissions = '{}'::jsonb where role = 'supervisor';

create or replace function public.company_permissions_are_valid(
    p_permissions jsonb
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select
        jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) = 'object'
        and not exists (
            select 1
            from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) as permission_entry
            where permission_entry.key not in (
                'can_view_techos',
                'can_create_estimates',
                'can_add_item_to_estimate',
                'can_manage_price_book',
                'can_view_customers',
                'can_view_jobs',
                'can_manage_company_users',
                'can_manage_company_profile', 'can_access_management', 'can_dispatch', 'can_manage_catalog', 'can_view_all_job_messages'
            )
              or jsonb_typeof(permission_entry.value) <> 'boolean'
        );
$$;

create or replace function public.company_role_default_permissions(p_role text)
returns jsonb language sql stable set search_path = pg_catalog, public, pg_temp as $$
 select jsonb_object_agg(k, case
 when lower(btrim(p_role)) in ('owner','admin','manager') then true
 when k = 'can_view_techos' then lower(btrim(p_role)) in ('technician','tech','sales','field_supervisor','supervisor','office','dispatcher','office_supervisor')
 when k = 'can_view_jobs' then lower(btrim(p_role)) in ('technician','tech','sales','field_supervisor','supervisor','office','dispatcher','office_supervisor')
 when k in ('can_create_estimates','can_add_item_to_estimate') then lower(btrim(p_role)) in ('sales','technician','tech')
 when k in ('can_access_management','can_dispatch','can_view_customers') then lower(btrim(p_role)) in ('office','dispatcher','office_supervisor')
 when k = 'can_view_all_job_messages' then lower(btrim(p_role)) in ('office','dispatcher','office_supervisor')
 else false end)
 from unnest(array['can_view_techos', 'can_create_estimates', 'can_add_item_to_estimate', 'can_manage_price_book', 'can_view_customers', 'can_view_jobs', 'can_manage_company_users', 'can_manage_company_profile', 'can_access_management', 'can_dispatch', 'can_manage_catalog', 'can_view_all_job_messages']) k;
$$;

create or replace function public.resolve_company_user_permissions_for_company(
    p_company_id uuid,
    p_role text,
    p_status text,
    p_user_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    with resolved as (
        select case
            when lower(btrim(coalesce(p_status, ''))) <> 'active' then
                public.company_role_default_permissions('')
            when lower(btrim(coalesce(p_role, ''))) = 'owner' then
                public.company_role_default_permissions('owner')
            else
                public.company_role_default_permissions(p_role)
                || coalesce((
                    select profile.permissions
                    from public.company_role_permission_profiles profile
                    where profile.company_id = p_company_id
                      and profile.role = lower(btrim(coalesce(p_role, '')))
                    limit 1
                ), '{}'::jsonb)
                || coalesce(nullif(p_user_permissions, 'null'::jsonb), '{}'::jsonb)
        end as permissions
    )
    select case
        when lower(btrim(coalesce(p_role, ''))) = 'sales'
          and lower(btrim(coalesce(p_status, ''))) = 'active' then
            resolved.permissions || jsonb_build_object(
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_manage_price_book', false,
                'can_view_customers', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false, 'can_access_management',false,'can_dispatch',false,'can_manage_catalog',false,'can_view_all_job_messages',false
            )
        when lower(btrim(coalesce(p_role, ''))) in ('field_supervisor','supervisor') then
            resolved.permissions || jsonb_build_object('can_access_management',false,'can_dispatch',false,'can_manage_catalog',false,'can_manage_price_book',false,'can_view_customers',false,'can_manage_company_users',false,'can_manage_company_profile',false)
        when lower(btrim(coalesce(p_role, ''))) not in ('owner','admin','manager') then
            resolved.permissions || jsonb_build_object('can_manage_company_users',false)
        else resolved.permissions
    end
    from resolved;
$$;

create or replace function public.company_user_has_permission(
    p_company_id uuid,
    p_permission text
)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_permission text := lower(btrim(coalesce(p_permission, '')));
    v_permissions jsonb;
begin
    if auth.uid() is null or p_company_id is null then
        return false;
    end if;

    if v_permission not in (
        'can_view_techos',
        'can_create_estimates',
        'can_add_item_to_estimate',
        'can_manage_price_book',
        'can_view_customers',
        'can_view_jobs',
        'can_manage_company_users',
        'can_manage_company_profile', 'can_access_management', 'can_dispatch', 'can_manage_catalog', 'can_view_all_job_messages'
    ) then
        return false;
    end if;

    select public.resolve_company_user_permissions_for_company(
        company_user.company_id,
        company_user.role,
        company_user.status,
        company_user.permissions
    )
    into v_permissions
    from public.company_users as company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc
    limit 1;

    return coalesce((v_permissions ->> v_permission)::boolean, false);
end;
$$;

create or replace function public.can_manage_company_users(p_company_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
 select auth.uid() is not null and (public.is_platform_admin() or (
 public.shared_core_current_company_role(p_company_id) in ('owner','admin','manager')
 and public.company_user_has_permission(p_company_id,'can_manage_company_users')));
$$;
create or replace function public.can_dispatch_company_operations(p_company_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
 select auth.uid() is not null and (public.is_platform_admin() or public.company_user_has_permission(p_company_id,'can_dispatch'));
$$;
create or replace function public.company_operations_can_manage(p_company_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
 select public.can_dispatch_company(p_company_id);
$$;
create or replace function public.shared_core_current_user_is_internal(p_company_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
 select public.company_user_has_permission(p_company_id,'can_view_customers');
$$;

-- Leadership assignment is controlled by the company's active owner, not platform role.
create or replace function public.company_current_user_is_owner(p_company_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.company_users u
 where u.company_id=p_company_id and u.auth_user_id=auth.uid() and u.role='owner' and u.status='active');
$$;
revoke all on function public.company_current_user_is_owner(uuid) from public,anon;
grant execute on function public.company_current_user_is_owner(uuid) to authenticated;

do $$ declare f regprocedure; d text; begin
 foreach f in array array[
 'public.create_company_user_invitation(uuid,text,text,text)'::regprocedure,
 'public.accept_company_user_invitation(uuid)'::regprocedure,
 'public.update_company_user_role(uuid,text)'::regprocedure
 ] loop
 d := pg_get_functiondef(f);
 if position('''supervisor''' in d) = 0 then raise exception 'Expected role list missing: %', f; end if;
 execute replace(d, '''supervisor''', '''supervisor'', ''field_supervisor'', ''office_supervisor''');
 end loop;
 end $$;

create or replace function public.company_can_invite_owner(p_company_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and (public.company_current_user_is_owner(p_company_id) or
 (public.is_platform_admin() and not exists(select 1 from public.company_users u where u.company_id=p_company_id and u.role='owner')));
$$;
revoke all on function public.company_can_invite_owner(uuid) from public,anon;
grant execute on function public.company_can_invite_owner(uuid) to authenticated;

-- Keep existing rate limits and verified-email acceptance; protect old clients as well.
do $$ declare d text; anchor text; begin
 d:=pg_get_functiondef('public.create_company_user_invitation(uuid,text,text,text)'::regprocedure);
 anchor:='    if v_email = '''' then';
 if position(anchor in d)=0 then raise exception 'Invitation authorization anchor missing'; end if;
 d:=replace(d,anchor,$guard$    if v_role = 'manager' and not public.company_current_user_is_owner(p_company_id) then
        raise exception 'Only the company owner can appoint a General Manager.';
    end if;
    if v_role = 'owner' and not public.company_current_user_is_owner(p_company_id)
       and not (public.is_platform_admin() and not exists(select 1 from public.company_users u where u.company_id=p_company_id and u.role='owner')) then
        raise exception 'Only the company owner can invite another owner.';
    end if;
$guard$||anchor);
 execute d;
 d:=pg_get_functiondef('public.update_company_user_role(uuid,text)'::regprocedure);
 anchor:='    update public.company_users company_user';
 if position(anchor in d)=0 then raise exception 'Role authorization anchor missing'; end if;
 execute replace(d,anchor,$guard$    if (v_role='manager' or v_member.role='manager') and not public.company_current_user_is_owner(v_member.company_id) then
        raise exception 'Only the company owner can appoint or change a General Manager.';
    end if;
$guard$||anchor);
 d:=pg_get_functiondef('public.accept_company_user_invitation(uuid)'::regprocedure);
 anchor:='    insert into public.company_users (';
 if position(anchor in d)=0 then raise exception 'Acceptance authorization anchor missing'; end if;
 execute replace(d,anchor,$guard$    if v_invitation.role='manager' and not exists(select 1 from public.company_users u
        where u.company_id=v_invitation.company_id and u.auth_user_id=v_invitation.invited_by_user_id and u.role='owner' and u.status='active') then
        raise exception 'The company owner must authorize this General Manager invitation.';
    end if;
$guard$||anchor);
 end $$;

create or replace function public.set_company_role_permission_profile(
    p_company_id uuid,
    p_role text,
    p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_role text := lower(btrim(coalesce(p_role, '')));
    v_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null then raise exception 'company_id is required'; end if;
    if v_role not in ('admin', 'manager', 'office', 'dispatcher', 'supervisor','field_supervisor','office_supervisor', 'sales', 'technician') then
        raise exception 'This role cannot be customized.';
    end if;
    if not public.company_permissions_are_valid(v_permissions) then
        raise exception 'Permissions must contain only supported boolean values.';
    end if;
    if not public.can_manage_company_users(p_company_id) then raise exception 'Only main management can change permissions.'; end if;
    if v_role='manager' and not public.company_current_user_is_owner(p_company_id) then raise exception 'Only the company owner can change General Manager permissions.'; end if;

    if v_role = 'sales' then
        v_permissions := v_permissions || jsonb_build_object(
            'can_create_estimates', true,
            'can_add_item_to_estimate', true,
            'can_manage_price_book', false,
            'can_view_customers', false,
            'can_manage_company_users', false,
            'can_manage_company_profile', false
        );
    end if;

    insert into public.company_role_permission_profiles(
        company_id, role, permissions, updated_by_user_id, updated_at
    ) values (
        p_company_id, v_role, v_permissions, auth.uid(), now()
    )
    on conflict (company_id, role) do update
    set permissions = excluded.permissions,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();

    return public.resolve_company_user_permissions_for_company(
        p_company_id, v_role, 'active', '{}'::jsonb
    );
end;
$$;

create or replace function public.set_company_member_permissions(p_company_user_id uuid, p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
 declare m public.company_users%rowtype; begin
 select * into m from public.company_users where id=p_company_user_id for update;
 if not found or not public.can_manage_company_users(m.company_id) then raise exception 'Only main management can change permissions.'; end if;
 if m.role='manager' and not public.company_current_user_is_owner(m.company_id) then raise exception 'Only the company owner can change General Manager permissions.'; end if;
 if m.role='owner' then raise exception 'Owner permissions require ownership transfer.'; end if;
 if not public.company_permissions_are_valid(p_permissions) then raise exception 'Invalid permissions.'; end if;
 if m.auth_user_id = auth.uid() then raise exception 'Another main manager must change your own permissions.'; end if;
 update public.company_users set permissions=p_permissions,updated_at=now() where id=m.id;
 return public.resolve_company_user_permissions_for_company(m.company_id,m.role,m.status,p_permissions);
 end $$;
create or replace function public.set_company_invitation_access(p_invitation_id uuid, p_role text, p_permissions jsonb)
returns public.company_user_invitations language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
 declare i public.company_user_invitations%rowtype; begin
 select * into i from public.company_user_invitations where id=p_invitation_id for update;
 if not found or not public.can_manage_company_users(i.company_id) then raise exception 'Only main management can change invitations.'; end if;
 if (lower(btrim(p_role))='manager' or i.role='manager') and not public.company_current_user_is_owner(i.company_id) then raise exception 'Only the company owner can change leadership invitations.'; end if;
 if (lower(btrim(p_role))='owner' or i.role='owner') and not public.company_can_invite_owner(i.company_id) then raise exception 'Only the company owner can change ownership invitations.'; end if;
 if i.status <> 'pending' or i.expires_at <= now() then raise exception 'Invitation is no longer pending.'; end if;
 if not public.company_permissions_are_valid(p_permissions) then raise exception 'Invalid permissions.'; end if;
 if p_role='owner' and i.role <> 'owner' then raise exception 'Use the ownership invitation workflow.'; end if;
 update public.company_user_invitations set role=lower(btrim(p_role)),permissions=p_permissions,invited_by_user_id=case when lower(btrim(p_role))='manager' then auth.uid() else invited_by_user_id end,updated_at=now() where id=i.id returning * into i;
 return i;
 end $$;
-- Atomic invitation creation: the code cannot be issued before overrides are saved.
create or replace function public.create_company_invitation_with_access(p_company_id uuid,p_email text,p_full_name text,p_role text,p_permissions jsonb)
returns public.company_user_invitations language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
 declare i public.company_user_invitations%rowtype; begin
 if not public.company_permissions_are_valid(p_permissions) then raise exception 'Invalid permissions.'; end if;
 i := public.create_company_user_invitation(p_company_id,p_email,p_full_name,p_role);
 update public.company_user_invitations set permissions=p_permissions where id=i.id returning * into i;
 return i;
 end $$;
-- Preserve invited overrides atomically when the verified acceptance function creates its membership.
create or replace function public.apply_accepted_invitation_permissions()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
 begin
 if new.status='accepted' and old.status is distinct from 'accepted' then
 update public.company_users set permissions=new.permissions where company_id=new.company_id and auth_user_id=new.accepted_by_user_id;
 end if;
 return new;
 end $$;
drop trigger if exists apply_accepted_invitation_permissions on public.company_user_invitations;
create trigger apply_accepted_invitation_permissions after update on public.company_user_invitations for each row execute function public.apply_accepted_invitation_permissions();
revoke all on function public.apply_accepted_invitation_permissions() from public,anon,authenticated;
revoke all on function public.set_company_member_permissions(uuid,jsonb), public.set_company_invitation_access(uuid,text,jsonb),public.create_company_invitation_with_access(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.set_company_member_permissions(uuid,jsonb), public.set_company_invitation_access(uuid,text,jsonb),public.create_company_invitation_with_access(uuid,text,text,text,jsonb) to authenticated;
create or replace function public.get_company_role_permission_profiles(p_company_id uuid)
returns table(role text, permissions jsonb, is_custom boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.can_manage_company_users(p_company_id) then raise exception 'Only main management can review permission profiles.'; end if;
 return query select r.role,public.resolve_company_user_permissions_for_company(p_company_id,r.role,'active','{}'),p.id is not null,p.updated_at
 from (values ('admin'),('manager'),('office'),('dispatcher'),('field_supervisor'),('office_supervisor'),('sales'),('technician')) r(role)
 left join public.company_role_permission_profiles p on p.company_id=p_company_id and p.role=r.role;
 end $$;
create or replace function public.can_manage_company_schedule(p_company_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select public.can_dispatch_company(p_company_id);
$$;
create or replace function public.company_product_catalog_can_manage(p_company_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and (public.homeos_is_platform_admin() or (
 public.company_user_has_permission(p_company_id,'can_manage_catalog')
 and not public.company_current_user_is_sales_tech(p_company_id)
 and exists(select 1 from public.company_catalog_entitlements e where e.company_id=p_company_id and e.active and e.package_tier='full')));
$$;

-- Before this release technician estimate execution ignored these legacy flags.
-- Preserve effective existing access once; subsequent explicit removals are authoritative.
update public.company_users set permissions=permissions||'{"can_create_estimates":true,"can_add_item_to_estimate":true}'::jsonb where role='technician';
update public.company_user_invitations set permissions=permissions||'{"can_create_estimates":true,"can_add_item_to_estimate":true}'::jsonb where role='technician' and status='pending';
update public.company_role_permission_profiles set permissions=permissions||'{"can_create_estimates":true,"can_add_item_to_estimate":true}'::jsonb where role='technician';
create or replace function public.company_estimate_options_can_use(p_company_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and (public.homeos_is_platform_admin() or (
 public.company_user_has_permission(p_company_id,'can_create_estimates')
 and public.company_user_has_permission(p_company_id,'can_add_item_to_estimate')));
$$;

-- The legacy roster omits overrides; use a guarded companion so editing preserves them.
create or replace function public.get_company_member_access(p_company_id uuid)
returns table(id uuid,permissions jsonb) language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 begin
 if not public.can_manage_company_users(p_company_id) then raise exception 'Only main management can review individual access.'; end if;
 return query select u.id,u.permissions from public.company_users u where u.company_id=p_company_id;
 end $$;
revoke all on function public.get_company_member_access(uuid) from public,anon;
grant execute on function public.get_company_member_access(uuid) to authenticated;

commit;
