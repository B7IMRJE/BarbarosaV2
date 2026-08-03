-- Read-only structural verification for Company Messaging checkpoint 1.
-- Run after 20260803133000_company_messaging_foundation.sql is applied in a
-- safe database environment.

begin;

do $$
declare
    v_table text;
    v_access_def text;
    v_manage_def text;
    v_post_def text;
begin
    foreach v_table in array array[
        'company_message_channels',
        'company_message_channel_members',
        'company_message_posts',
        'company_message_attachments',
        'company_message_read_states'
    ]
    loop
        if to_regclass(format('public.%I', v_table)) is null then
            raise exception 'Company Messaging table public.% is missing.', v_table;
        end if;

        if not exists (
            select 1
            from pg_class as relation
            join pg_namespace as namespace
              on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = v_table
              and relation.relrowsecurity
        ) then
            raise exception 'Company Messaging RLS is disabled for public.%', v_table;
        end if;

        if has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') then
            raise exception 'Authenticated users have an unsafe direct write privilege on public.%', v_table;
        end if;
    end loop;

    if to_regprocedure('public.company_message_can_access_channel(uuid)') is null then
        raise exception 'company_message_can_access_channel(uuid) is missing.';
    end if;

    if to_regprocedure('public.company_message_can_manage_channel(uuid)') is null then
        raise exception 'company_message_can_manage_channel(uuid) is missing.';
    end if;

    if to_regprocedure('public.company_message_can_post(uuid)') is null then
        raise exception 'company_message_can_post(uuid) is missing.';
    end if;

    v_access_def := pg_get_functiondef('public.company_message_can_access_channel(uuid)'::regprocedure);
    v_manage_def := pg_get_functiondef('public.company_message_can_manage_channel(uuid)'::regprocedure);
    v_post_def := pg_get_functiondef('public.company_message_can_post(uuid)'::regprocedure);

    if v_access_def not ilike '%security definer%'
       or v_manage_def not ilike '%security definer%'
       or v_post_def not ilike '%security definer%' then
        raise exception 'Company Messaging access helpers must remain security definer.';
    end if;

    if v_access_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp'
       or v_manage_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp'
       or v_post_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp' then
        raise exception 'Company Messaging access helpers must pin a safe search_path.';
    end if;

    if v_access_def not ilike '%membership.membership_status = ''active''%'
       or v_access_def not ilike '%company_user.auth_user_id = auth.uid()%' then
        raise exception 'Channel reads must require the authenticated user to have active membership.';
    end if;

    if v_manage_def not ilike '%company_message_can_administer_company%'
       or v_manage_def not ilike '%membership.member_role = ''admin''%' then
        raise exception 'Channel management must require company messaging administration or channel-admin membership.';
    end if;

    if v_post_def not ilike '%channel.status = ''active''%'
       or v_post_def not ilike '%channel.posting_mode%'
       or v_post_def not ilike '%membership.membership_status = ''active''%' then
        raise exception 'Message posting authorization must enforce channel and active-membership rules.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_message_posts'
          and policyname = 'company_message_posts_select'
          and qual ilike '%company_message_can_access_channel%'
    ) then
        raise exception 'Company message post RLS policy is missing or unsafe.';
    end if;

    if not exists (
        select 1
        from pg_trigger
        where tgname = 'company_message_posts_validate'
          and tgrelid = 'public.company_message_posts'::regclass
          and not tgisinternal
    ) then
        raise exception 'Company message tenant-validation trigger is missing.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.company_message_channels'::regclass
          and conname = 'company_message_channels_kind_check'
    ) then
        raise exception 'Company message channel-kind constraint is missing.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.company_message_posts'::regclass
          and conname = 'company_message_posts_type_check'
    ) then
        raise exception 'Company message post-type constraint is missing.';
    end if;
end;
$$;

select 'company_messaging_foundation_ok' as result;

rollback;
