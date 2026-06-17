create table if not exists public.property_connection_codes (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null,
    created_by_user_id uuid not null,
    code_hash text not null,
    code_last4 text not null,
    status text not null default 'active',
    can_view_documents boolean not null default false,
    can_view_photos boolean not null default true,
    can_view_service_history boolean not null default false,
    can_view_quotes boolean not null default false,
    expires_at timestamptz not null,
    redeemed_at timestamptz null,
    redeemed_by_company_id uuid null,
    redeemed_by_user_id uuid null,
    property_connection_id uuid null,
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint property_connection_codes_status_check
        check (status in ('active', 'redeemed', 'expired', 'revoked')),
    constraint property_connection_codes_code_hash_key unique (code_hash),
    constraint property_connection_codes_expires_at_check check (expires_at > created_at)
);

create index if not exists property_connection_codes_property_id_idx
on public.property_connection_codes (property_id);

create index if not exists property_connection_codes_status_idx
on public.property_connection_codes (status);

create index if not exists property_connection_codes_expires_at_idx
on public.property_connection_codes (expires_at);

create index if not exists property_connection_codes_created_by_user_id_idx
on public.property_connection_codes (created_by_user_id);

create index if not exists property_connection_codes_redeemed_by_company_id_idx
on public.property_connection_codes (redeemed_by_company_id);

do $$
begin
    if to_regclass('public.properties') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connection_codes_property_id_fkey'
             and conrelid = 'public.property_connection_codes'::regclass
       ) then
        alter table public.property_connection_codes
        add constraint property_connection_codes_property_id_fkey
        foreign key (property_id)
        references public.properties(id)
        on delete cascade;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.companies') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connection_codes_redeemed_by_company_id_fkey'
             and conrelid = 'public.property_connection_codes'::regclass
       ) then
        alter table public.property_connection_codes
        add constraint property_connection_codes_redeemed_by_company_id_fkey
        foreign key (redeemed_by_company_id)
        references public.companies(id)
        on delete set null;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.property_connections') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'property_connection_codes_property_connection_id_fkey'
             and conrelid = 'public.property_connection_codes'::regclass
       ) then
        alter table public.property_connection_codes
        add constraint property_connection_codes_property_connection_id_fkey
        foreign key (property_connection_id)
        references public.property_connections(id)
        on delete set null;
    end if;
end
$$;

alter table public.property_connection_codes enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'property_connection_codes'
          and policyname = 'property_connection_codes_select_active_members'
    ) then
        create policy property_connection_codes_select_active_members
        on public.property_connection_codes
        for select
        to authenticated
        using (
            exists (
                select 1
                from public.property_memberships membership
                where membership.property_id = property_connection_codes.property_id
                  and membership.user_id = auth.uid()
                  and membership.status = 'active'
            )
        );
    end if;
end
$$;

create or replace function public.generate_connection_code(
    p_property_id uuid,
    p_can_view_documents boolean default false,
    p_can_view_photos boolean default true,
    p_can_view_service_history boolean default false,
    p_can_view_quotes boolean default false,
    p_expires_in_hours integer default 24
)
returns table (
    code_id uuid,
    plain_code text,
    code_last4 text,
    expires_at timestamptz,
    can_view_documents boolean,
    can_view_photos boolean,
    can_view_service_history boolean,
    can_view_quotes boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_plain_code text;
    v_code_hash text;
    v_expires_at timestamptz;
    v_code_id uuid;
    v_expires_in_hours integer := greatest(1, least(coalesce(p_expires_in_hours, 24), 168));
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if not exists (
        select 1
        from public.property_memberships membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to generate a code for this property';
    end if;

    v_expires_at := now() + make_interval(hours => v_expires_in_hours);

    loop
        v_plain_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
        v_code_hash := encode(digest(v_plain_code, 'sha256'), 'hex');

        exit when not exists (
            select 1
            from public.property_connection_codes existing_code
            where existing_code.code_hash = v_code_hash
        );
    end loop;

    insert into public.property_connection_codes (
        property_id,
        created_by_user_id,
        code_hash,
        code_last4,
        status,
        can_view_documents,
        can_view_photos,
        can_view_service_history,
        can_view_quotes,
        expires_at
    )
    values (
        p_property_id,
        v_user_id,
        v_code_hash,
        right(v_plain_code, 4),
        'active',
        p_can_view_documents,
        p_can_view_photos,
        p_can_view_service_history,
        p_can_view_quotes,
        v_expires_at
    )
    returning id into v_code_id;

    return query
    select
        v_code_id,
        v_plain_code,
        right(v_plain_code, 4),
        v_expires_at,
        p_can_view_documents,
        p_can_view_photos,
        p_can_view_service_history,
        p_can_view_quotes;
end;
$$;

grant execute on function public.generate_connection_code(
    uuid,
    boolean,
    boolean,
    boolean,
    boolean,
    integer
) to authenticated;
