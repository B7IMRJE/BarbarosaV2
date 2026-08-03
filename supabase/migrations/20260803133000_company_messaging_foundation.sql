-- Company Messaging foundation.
--
-- This migration is intentionally additive. It creates the company-scoped
-- channel, membership, post, attachment-reference, and read-state records
-- required by the future Operations, University, Emergency, Supervisors,
-- technician Field Work, and custom group experiences.
--
-- Normal authenticated sessions receive SELECT access protected by RLS.
-- Writes remain RPC-only and will be introduced with the membership and
-- messaging service checkpoint so users cannot bypass channel rules.

begin;

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.company_job_workflows') is null then
        raise exception 'public.company_job_workflows is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.service_request_attachments') is null then
        raise exception 'public.service_request_attachments is required before Company Messaging can be installed.';
    end if;

    if to_regclass('public.company_job_workflow_attachments') is null then
        raise exception 'public.company_job_workflow_attachments is required before Company Messaging can be installed.';
    end if;

    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'public.is_platform_admin() is required before Company Messaging can be installed.';
    end if;
end;
$$;

create table if not exists public.company_message_channels (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    name text not null,
    description text,
    channel_kind text not null default 'custom',
    status text not null default 'active',
    posting_mode text not null default 'members',
    linked_technician_company_user_id uuid references public.company_users(id) on delete set null,
    created_by_company_user_id uuid references public.company_users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    constraint company_message_channels_name_check
        check (char_length(btrim(name)) between 1 and 80),
    constraint company_message_channels_description_check
        check (description is null or char_length(description) <= 500),
    constraint company_message_channels_kind_check
        check (channel_kind in (
            'field_work',
            'operations',
            'university',
            'emergency',
            'supervisors',
            'custom'
        )),
    constraint company_message_channels_status_check
        check (status in ('active', 'archived')),
    constraint company_message_channels_posting_mode_check
        check (posting_mode in ('members', 'moderators', 'announcements')),
    constraint company_message_channels_metadata_check
        check (jsonb_typeof(metadata) = 'object'),
    constraint company_message_channels_archived_at_check
        check (
            (status = 'active' and archived_at is null)
            or (status = 'archived' and archived_at is not null)
        ),
    constraint company_message_channels_field_work_technician_check
        check (
            linked_technician_company_user_id is null
            or channel_kind = 'field_work'
        )
);

create unique index if not exists company_message_channels_company_id_id_key
    on public.company_message_channels(company_id, id);

create unique index if not exists company_message_channels_active_technician_key
    on public.company_message_channels(company_id, linked_technician_company_user_id)
    where status = 'active'
      and linked_technician_company_user_id is not null;

create index if not exists company_message_channels_company_status_idx
    on public.company_message_channels(company_id, status, channel_kind, updated_at desc);

create table if not exists public.company_message_channel_members (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references public.company_message_channels(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    company_user_id uuid not null references public.company_users(id) on delete cascade,
    member_role text not null default 'member',
    membership_status text not null default 'active',
    notification_level text not null default 'all',
    added_by_company_user_id uuid references public.company_users(id) on delete set null,
    removed_by_company_user_id uuid references public.company_users(id) on delete set null,
    joined_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    removed_at timestamptz,
    constraint company_message_channel_members_channel_user_key
        unique (channel_id, company_user_id),
    constraint company_message_channel_members_role_check
        check (member_role in ('member', 'moderator', 'admin')),
    constraint company_message_channel_members_status_check
        check (membership_status in ('active', 'removed')),
    constraint company_message_channel_members_notification_check
        check (notification_level in ('all', 'mentions', 'muted')),
    constraint company_message_channel_members_removed_at_check
        check (
            (membership_status = 'active' and removed_at is null and removed_by_company_user_id is null)
            or (membership_status = 'removed' and removed_at is not null)
        )
);

create index if not exists company_message_members_company_user_idx
    on public.company_message_channel_members(company_id, company_user_id, membership_status);

create index if not exists company_message_members_channel_status_idx
    on public.company_message_channel_members(channel_id, membership_status, member_role);

create table if not exists public.company_message_posts (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references public.company_message_channels(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    author_company_user_id uuid references public.company_users(id) on delete set null,
    message_type text not null default 'message',
    body text not null default '',
    reply_to_post_id uuid references public.company_message_posts(id) on delete set null,
    service_request_id uuid references public.service_requests(id) on delete set null,
    schedule_slot_id uuid references public.job_schedule_slots(id) on delete set null,
    workflow_id uuid references public.company_job_workflows(id) on delete set null,
    client_message_id text,
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    edited_at timestamptz,
    deleted_at timestamptz,
    constraint company_message_posts_type_check
        check (message_type in (
            'message',
            'job_update',
            'question',
            'answer',
            'emergency',
            'review',
            'system'
        )),
    constraint company_message_posts_body_check
        check (char_length(body) <= 20000),
    constraint company_message_posts_client_id_check
        check (client_message_id is null or char_length(btrim(client_message_id)) between 1 and 100),
    constraint company_message_posts_status_check
        check (status in ('active', 'deleted')),
    constraint company_message_posts_metadata_check
        check (jsonb_typeof(metadata) = 'object'),
    constraint company_message_posts_deleted_at_check
        check (
            (status = 'active' and deleted_at is null)
            or (status = 'deleted' and deleted_at is not null)
        )
);

create index if not exists company_message_posts_channel_created_idx
    on public.company_message_posts(channel_id, created_at desc, id);

create index if not exists company_message_posts_company_created_idx
    on public.company_message_posts(company_id, created_at desc);

create index if not exists company_message_posts_service_request_idx
    on public.company_message_posts(service_request_id, created_at desc)
    where service_request_id is not null;

create index if not exists company_message_posts_workflow_idx
    on public.company_message_posts(workflow_id, created_at desc)
    where workflow_id is not null;

create unique index if not exists company_message_posts_client_message_key
    on public.company_message_posts(channel_id, author_company_user_id, client_message_id)
    where client_message_id is not null
      and author_company_user_id is not null;

create table if not exists public.company_message_attachments (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.company_message_posts(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    source_type text not null,
    service_request_attachment_id uuid references public.service_request_attachments(id) on delete cascade,
    job_workflow_attachment_id uuid references public.company_job_workflow_attachments(id) on delete cascade,
    bucket text,
    storage_path text,
    file_name text,
    mime_type text,
    size_bytes bigint,
    duration_seconds integer,
    caption text,
    sort_order integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_by_company_user_id uuid references public.company_users(id) on delete set null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    constraint company_message_attachments_source_check
        check (source_type in ('upload', 'service_request', 'job_workflow')),
    constraint company_message_attachments_source_value_check
        check (
            (
                source_type = 'upload'
                and service_request_attachment_id is null
                and job_workflow_attachment_id is null
                and bucket is not null
                and char_length(btrim(bucket)) > 0
                and storage_path is not null
                and char_length(btrim(storage_path)) > 0
            )
            or (
                source_type = 'service_request'
                and service_request_attachment_id is not null
                and job_workflow_attachment_id is null
            )
            or (
                source_type = 'job_workflow'
                and service_request_attachment_id is null
                and job_workflow_attachment_id is not null
            )
        ),
    constraint company_message_attachments_size_check
        check (size_bytes is null or size_bytes > 0),
    constraint company_message_attachments_duration_check
        check (duration_seconds is null or duration_seconds >= 0),
    constraint company_message_attachments_caption_check
        check (caption is null or char_length(caption) <= 1000),
    constraint company_message_attachments_metadata_check
        check (jsonb_typeof(metadata) = 'object')
);

create index if not exists company_message_attachments_post_idx
    on public.company_message_attachments(post_id, deleted_at, sort_order, created_at);

create unique index if not exists company_message_attachments_service_request_key
    on public.company_message_attachments(post_id, service_request_attachment_id)
    where service_request_attachment_id is not null
      and deleted_at is null;

create unique index if not exists company_message_attachments_workflow_key
    on public.company_message_attachments(post_id, job_workflow_attachment_id)
    where job_workflow_attachment_id is not null
      and deleted_at is null;

create unique index if not exists company_message_attachments_upload_path_key
    on public.company_message_attachments(bucket, storage_path)
    where source_type = 'upload'
      and deleted_at is null;

create table if not exists public.company_message_read_states (
    channel_id uuid not null references public.company_message_channels(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    company_user_id uuid not null references public.company_users(id) on delete cascade,
    last_read_post_id uuid references public.company_message_posts(id) on delete set null,
    last_read_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (channel_id, company_user_id)
);

create index if not exists company_message_read_states_user_idx
    on public.company_message_read_states(company_id, company_user_id, updated_at desc);

create or replace function public.company_message_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create or replace function public.company_message_validate_channel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.linked_technician_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.linked_technician_company_user_id
              and company_user.company_id = new.company_id
              and lower(btrim(coalesce(company_user.role, ''))) in (
                  'technician', 'tech', 'field_tech', 'field-tech', 'field technician'
              )
       ) then
        raise exception 'The Field Work technician must belong to the same company.';
    end if;

    if new.created_by_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.created_by_company_user_id
              and company_user.company_id = new.company_id
       ) then
        raise exception 'The channel creator must belong to the same company.';
    end if;

    return new;
end;
$$;

create or replace function public.company_message_validate_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.company_message_channels as channel
        where channel.id = new.channel_id
          and channel.company_id = new.company_id
    ) then
        raise exception 'The channel does not belong to the supplied company.';
    end if;

    if not exists (
        select 1
        from public.company_users as company_user
        where company_user.id = new.company_user_id
          and company_user.company_id = new.company_id
    ) then
        raise exception 'The channel member does not belong to the supplied company.';
    end if;

    if new.added_by_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.added_by_company_user_id
              and company_user.company_id = new.company_id
       ) then
        raise exception 'The member administrator does not belong to the supplied company.';
    end if;

    if new.removed_by_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.removed_by_company_user_id
              and company_user.company_id = new.company_id
       ) then
        raise exception 'The member remover does not belong to the supplied company.';
    end if;

    return new;
end;
$$;

create or replace function public.company_message_validate_post()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.company_message_channels as channel
        where channel.id = new.channel_id
          and channel.company_id = new.company_id
    ) then
        raise exception 'The message channel does not belong to the supplied company.';
    end if;

    if new.author_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.author_company_user_id
              and company_user.company_id = new.company_id
       ) then
        raise exception 'The message author does not belong to the supplied company.';
    end if;

    if new.reply_to_post_id is not null
       and not exists (
            select 1
            from public.company_message_posts as parent_post
            where parent_post.id = new.reply_to_post_id
              and parent_post.channel_id = new.channel_id
              and parent_post.company_id = new.company_id
       ) then
        raise exception 'A reply must reference a message in the same channel.';
    end if;

    if new.service_request_id is not null
       and not exists (
            select 1
            from public.service_requests as request
            where request.id = new.service_request_id
              and request.company_id = new.company_id
       ) then
        raise exception 'The linked service request does not belong to the message company.';
    end if;

    if new.schedule_slot_id is not null
       and not exists (
            select 1
            from public.job_schedule_slots as slot
            where slot.id = new.schedule_slot_id
              and slot.company_id = new.company_id
       ) then
        raise exception 'The linked schedule slot does not belong to the message company.';
    end if;

    if new.workflow_id is not null
       and not exists (
            select 1
            from public.company_job_workflows as workflow
            where workflow.id = new.workflow_id
              and workflow.company_id = new.company_id
       ) then
        raise exception 'The linked job workflow does not belong to the message company.';
    end if;

    return new;
end;
$$;

create or replace function public.company_message_validate_attachment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.company_message_posts as post
        where post.id = new.post_id
          and post.company_id = new.company_id
    ) then
        raise exception 'The attachment message does not belong to the supplied company.';
    end if;

    if new.service_request_attachment_id is not null
       and not exists (
            select 1
            from public.service_request_attachments as attachment
            where attachment.id = new.service_request_attachment_id
              and attachment.company_id = new.company_id
              and attachment.deleted_at is null
       ) then
        raise exception 'The service-request attachment does not belong to the message company.';
    end if;

    if new.job_workflow_attachment_id is not null
       and not exists (
            select 1
            from public.company_job_workflow_attachments as attachment
            where attachment.id = new.job_workflow_attachment_id
              and attachment.company_id = new.company_id
       ) then
        raise exception 'The job-workflow attachment does not belong to the message company.';
    end if;

    if new.created_by_company_user_id is not null
       and not exists (
            select 1
            from public.company_users as company_user
            where company_user.id = new.created_by_company_user_id
              and company_user.company_id = new.company_id
       ) then
        raise exception 'The attachment creator does not belong to the message company.';
    end if;

    return new;
end;
$$;

create or replace function public.company_message_validate_read_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not exists (
        select 1
        from public.company_message_channels as channel
        where channel.id = new.channel_id
          and channel.company_id = new.company_id
    ) then
        raise exception 'The read-state channel does not belong to the supplied company.';
    end if;

    if not exists (
        select 1
        from public.company_users as company_user
        where company_user.id = new.company_user_id
          and company_user.company_id = new.company_id
    ) then
        raise exception 'The read-state user does not belong to the supplied company.';
    end if;

    if new.last_read_post_id is not null
       and not exists (
            select 1
            from public.company_message_posts as post
            where post.id = new.last_read_post_id
              and post.channel_id = new.channel_id
              and post.company_id = new.company_id
       ) then
        raise exception 'The last-read message must belong to the same channel.';
    end if;

    return new;
end;
$$;

drop trigger if exists company_message_channels_updated_at on public.company_message_channels;
create trigger company_message_channels_updated_at
before update on public.company_message_channels
for each row execute function public.company_message_set_updated_at();

drop trigger if exists company_message_channels_validate on public.company_message_channels;
create trigger company_message_channels_validate
before insert or update on public.company_message_channels
for each row execute function public.company_message_validate_channel();

drop trigger if exists company_message_members_updated_at on public.company_message_channel_members;
create trigger company_message_members_updated_at
before update on public.company_message_channel_members
for each row execute function public.company_message_set_updated_at();

drop trigger if exists company_message_members_validate on public.company_message_channel_members;
create trigger company_message_members_validate
before insert or update on public.company_message_channel_members
for each row execute function public.company_message_validate_member();

drop trigger if exists company_message_posts_validate on public.company_message_posts;
create trigger company_message_posts_validate
before insert or update on public.company_message_posts
for each row execute function public.company_message_validate_post();

drop trigger if exists company_message_attachments_validate on public.company_message_attachments;
create trigger company_message_attachments_validate
before insert or update on public.company_message_attachments
for each row execute function public.company_message_validate_attachment();

drop trigger if exists company_message_read_states_updated_at on public.company_message_read_states;
create trigger company_message_read_states_updated_at
before update on public.company_message_read_states
for each row execute function public.company_message_set_updated_at();

drop trigger if exists company_message_read_states_validate on public.company_message_read_states;
create trigger company_message_read_states_validate
before insert or update on public.company_message_read_states
for each row execute function public.company_message_validate_read_state();

create or replace function public.company_message_current_company_user_id(
    p_company_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select company_user.id
    from public.company_users as company_user
    where auth.uid() is not null
      and p_company_id is not null
      and company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;
$$;

create or replace function public.company_message_can_administer_company(
    p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.is_platform_admin()
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in (
                     'owner',
                     'admin',
                     'manager',
                     'office',
                     'dispatcher',
                     'dispatch'
                 )
           )
       );
$$;

create or replace function public.company_message_has_company_oversight(
    p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.is_platform_admin()
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in (
                     'owner',
                     'admin',
                     'manager'
                 )
           )
       );
$$;

create or replace function public.company_message_can_access_channel(
    p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_channel_id is not null
       and exists (
           select 1
           from public.company_message_channels as channel
           where channel.id = p_channel_id
             and (
                 public.company_message_has_company_oversight(channel.company_id)
                 or exists (
                     select 1
                     from public.company_message_channel_members as membership
                     join public.company_users as company_user
                       on company_user.id = membership.company_user_id
                      and company_user.company_id = membership.company_id
                     where membership.channel_id = channel.id
                       and membership.company_id = channel.company_id
                       and membership.membership_status = 'active'
                       and company_user.auth_user_id = auth.uid()
                       and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 )
             )
       );
$$;

create or replace function public.company_message_can_manage_channel(
    p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_channel_id is not null
       and exists (
           select 1
           from public.company_message_channels as channel
           where channel.id = p_channel_id
             and (
                 public.company_message_can_administer_company(channel.company_id)
                 or exists (
                     select 1
                     from public.company_message_channel_members as membership
                     join public.company_users as company_user
                       on company_user.id = membership.company_user_id
                      and company_user.company_id = membership.company_id
                     where membership.channel_id = channel.id
                       and membership.company_id = channel.company_id
                       and membership.membership_status = 'active'
                       and membership.member_role = 'admin'
                       and company_user.auth_user_id = auth.uid()
                       and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 )
             )
       );
$$;

create or replace function public.company_message_can_post(
    p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_channel_id is not null
       and exists (
           select 1
           from public.company_message_channels as channel
           where channel.id = p_channel_id
             and channel.status = 'active'
             and (
                 public.company_message_has_company_oversight(channel.company_id)
                 or exists (
                     select 1
                     from public.company_message_channel_members as membership
                     join public.company_users as company_user
                       on company_user.id = membership.company_user_id
                      and company_user.company_id = membership.company_id
                     where membership.channel_id = channel.id
                       and membership.company_id = channel.company_id
                       and membership.membership_status = 'active'
                       and company_user.auth_user_id = auth.uid()
                       and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                       and (
                           channel.posting_mode = 'members'
                           or (
                               channel.posting_mode = 'moderators'
                               and membership.member_role in ('moderator', 'admin')
                           )
                           or (
                               channel.posting_mode = 'announcements'
                               and membership.member_role = 'admin'
                           )
                       )
                 )
             )
       );
$$;

revoke all on function public.company_message_set_updated_at() from public;
revoke all on function public.company_message_set_updated_at() from anon;
revoke all on function public.company_message_validate_channel() from public;
revoke all on function public.company_message_validate_channel() from anon;
revoke all on function public.company_message_validate_member() from public;
revoke all on function public.company_message_validate_member() from anon;
revoke all on function public.company_message_validate_post() from public;
revoke all on function public.company_message_validate_post() from anon;
revoke all on function public.company_message_validate_attachment() from public;
revoke all on function public.company_message_validate_attachment() from anon;
revoke all on function public.company_message_validate_read_state() from public;
revoke all on function public.company_message_validate_read_state() from anon;

revoke all on function public.company_message_current_company_user_id(uuid) from public;
revoke all on function public.company_message_current_company_user_id(uuid) from anon;
grant execute on function public.company_message_current_company_user_id(uuid) to authenticated;

revoke all on function public.company_message_can_administer_company(uuid) from public;
revoke all on function public.company_message_can_administer_company(uuid) from anon;
grant execute on function public.company_message_can_administer_company(uuid) to authenticated;

revoke all on function public.company_message_has_company_oversight(uuid) from public;
revoke all on function public.company_message_has_company_oversight(uuid) from anon;
grant execute on function public.company_message_has_company_oversight(uuid) to authenticated;

revoke all on function public.company_message_can_access_channel(uuid) from public;
revoke all on function public.company_message_can_access_channel(uuid) from anon;
grant execute on function public.company_message_can_access_channel(uuid) to authenticated;

revoke all on function public.company_message_can_manage_channel(uuid) from public;
revoke all on function public.company_message_can_manage_channel(uuid) from anon;
grant execute on function public.company_message_can_manage_channel(uuid) to authenticated;

revoke all on function public.company_message_can_post(uuid) from public;
revoke all on function public.company_message_can_post(uuid) from anon;
grant execute on function public.company_message_can_post(uuid) to authenticated;

alter table public.company_message_channels enable row level security;
alter table public.company_message_channel_members enable row level security;
alter table public.company_message_posts enable row level security;
alter table public.company_message_attachments enable row level security;
alter table public.company_message_read_states enable row level security;

revoke all on table public.company_message_channels from public;
revoke all on table public.company_message_channels from anon;
revoke all on table public.company_message_channel_members from public;
revoke all on table public.company_message_channel_members from anon;
revoke all on table public.company_message_posts from public;
revoke all on table public.company_message_posts from anon;
revoke all on table public.company_message_attachments from public;
revoke all on table public.company_message_attachments from anon;
revoke all on table public.company_message_read_states from public;
revoke all on table public.company_message_read_states from anon;

grant select on table public.company_message_channels to authenticated;
grant select on table public.company_message_channel_members to authenticated;
grant select on table public.company_message_posts to authenticated;
grant select on table public.company_message_attachments to authenticated;
grant select on table public.company_message_read_states to authenticated;

drop policy if exists company_message_channels_select on public.company_message_channels;
create policy company_message_channels_select
on public.company_message_channels
for select
to authenticated
using (
    public.company_message_can_access_channel(id)
    or public.company_message_can_manage_channel(id)
);

drop policy if exists company_message_members_select on public.company_message_channel_members;
create policy company_message_members_select
on public.company_message_channel_members
for select
to authenticated
using (
    public.company_message_can_access_channel(channel_id)
    or public.company_message_can_manage_channel(channel_id)
);

drop policy if exists company_message_posts_select on public.company_message_posts;
create policy company_message_posts_select
on public.company_message_posts
for select
to authenticated
using (public.company_message_can_access_channel(channel_id));

drop policy if exists company_message_attachments_select on public.company_message_attachments;
create policy company_message_attachments_select
on public.company_message_attachments
for select
to authenticated
using (
    exists (
        select 1
        from public.company_message_posts as post
        where post.id = company_message_attachments.post_id
          and post.company_id = company_message_attachments.company_id
          and public.company_message_can_access_channel(post.channel_id)
    )
);

drop policy if exists company_message_read_states_select on public.company_message_read_states;
create policy company_message_read_states_select
on public.company_message_read_states
for select
to authenticated
using (
    company_user_id = public.company_message_current_company_user_id(company_id)
    or public.company_message_can_manage_channel(channel_id)
);

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'company_message_channels',
        'company_message_channel_members',
        'company_message_posts',
        'company_message_attachments',
        'company_message_read_states'
    ]
    loop
        if not exists (
            select 1
            from pg_class as relation
            join pg_namespace as namespace
              on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = v_table
              and relation.relrowsecurity
        ) then
            raise exception 'RLS verification failed for public.%', v_table;
        end if;

        if has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') then
            raise exception 'Direct authenticated writes must remain disabled for public.%', v_table;
        end if;
    end loop;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_message_posts'
          and policyname = 'company_message_posts_select'
    ) then
        raise exception 'Company Messaging post read policy verification failed.';
    end if;
end;
$$;

comment on table public.company_message_channels is
    'Company-scoped Operations, University, Emergency, Supervisors, Field Work, and custom messaging groups.';

comment on table public.company_message_channel_members is
    'Explicit company-user membership and notification preferences for a messaging group.';

comment on table public.company_message_posts is
    'Durable group messages, replies, questions, reviews, and job-linked operational updates.';

comment on table public.company_message_attachments is
    'References to uploaded or existing job media attached to company messages.';

comment on table public.company_message_read_states is
    'Per-user read cursor used for unread counts without mutating message history.';

commit;
