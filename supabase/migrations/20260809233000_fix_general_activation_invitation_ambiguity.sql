begin;
create or replace function public.general_create_activation_invitation(
    p_target_email text,
    p_intended_surface text,
    p_intended_role text,
    p_code text,
    p_company_id uuid default null,
    p_expires_at timestamptz default (now() + interval '30 minutes')
)
returns table (invitation_id uuid, target_user_id uuid, target_email text, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_target auth.users%rowtype;
    v_profile jsonb;
    v_invitation public.general_activation_invitations%rowtype;
    v_surface text := lower(btrim(coalesce(p_intended_surface, '')));
    v_role text := upper(btrim(coalesce(p_intended_role, '')));
    v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
    if v_actor is null or not public.homeos_is_platform_admin() then raise exception 'Platform Administration access is required.'; end if;
    if v_surface not in ('administration', 'techos', 'homeos') then raise exception 'Unsupported General surface.'; end if;
    if v_surface='administration' and v_role not in ('SUPER_ADMIN','ADMINISTRATION','MANAGEMENT') then raise exception 'Administration invitations must name an established Administration role.'; end if;
    if v_surface='techos' and v_role not in ('TECHNICIAN','TECH','MANAGER','ADMIN','OWNER','DISPATCHER','DISPATCH') then raise exception 'Unsupported TechOS or management role.'; end if;
    if v_code !~ '^\d{6}$' then raise exception 'Activation code must contain six digits.'; end if;
    if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Activation expiry must be within the next 24 hours.'; end if;

    select * into v_target from auth.users where lower(email) = lower(btrim(p_target_email)) limit 1;
    if not found then raise exception 'The intended account must already exist in the established authentication channel.'; end if;
    select to_jsonb(profile) into v_profile from public.profiles profile where profile.id = v_target.id;

    if v_surface = 'administration' and not (
        upper(coalesce(v_profile->>'role', '')) = 'SUPER_ADMIN'
        or lower(coalesce(v_profile->>'is_platform_admin', 'false')) in ('true','1','yes')
    ) then raise exception 'The intended account is not already authorized for platform Administration.'; end if;

    if v_surface = 'techos' and not exists (
        select 1 from public.company_users cu where cu.auth_user_id = v_target.id and cu.company_id = p_company_id
          and lower(coalesce(cu.status, '')) in ('active', 'accepted', 'approved')
    ) then raise exception 'The intended account does not have active access to this company.'; end if;

    update public.general_activation_invitations as invitation
       set revoked_at = now()
     where invitation.target_user_id = v_target.id
       and invitation.redeemed_at is null
       and invitation.revoked_at is null;

    insert into public.general_activation_invitations (
        target_user_id, target_email, intended_surface, intended_role, company_id,
        code_hash, code_last4, expires_at, created_by_user_id
    ) values (
        v_target.id, lower(v_target.email), v_surface, v_role, p_company_id,
        extensions.crypt(v_code, extensions.gen_salt('bf', 12)), right(v_code, 4), p_expires_at, v_actor
    ) returning * into v_invitation;

    return query select v_invitation.id, v_invitation.target_user_id, v_invitation.target_email, v_invitation.expires_at;
end;
$$;
revoke all on function public.general_create_activation_invitation(text, text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.general_create_activation_invitation(text, text, text, text, uuid, timestamptz) to authenticated;
commit;
