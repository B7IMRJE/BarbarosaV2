-- Phase 1
-- Home item files foundation and storage bucket ownership policies.
-- Existing table compatibility:
-- id uuid
-- item_slug text
-- file_url text
-- file_name text
-- file_type text
-- category text
-- created_at timestamptz

create table if not exists public.home_item_files (
    id uuid primary key default gen_random_uuid(),
    item_slug text null,
    file_url text not null,
    file_name text null,
    file_type text not null,
    category text not null default 'other',
    created_at timestamptz not null default now(),
    user_id uuid null,
    home_item_id uuid null,
    storage_bucket text not null default 'item-files',
    storage_path text null
);

do $$
begin
    alter table public.home_item_files
        add column if not exists user_id uuid;

    alter table public.home_item_files
        add column if not exists home_item_id uuid;

    alter table public.home_item_files
        add column if not exists storage_bucket text;

    alter table public.home_item_files
        add column if not exists storage_path text;

    alter table public.home_item_files
        add column if not exists item_slug text;

    update public.home_item_files
    set category = 'other'
    where category is null;

    alter table public.home_item_files
        alter column category set default 'other';

    update public.home_item_files
    set storage_bucket = 'item-files'
    where storage_bucket is null;

    alter table public.home_item_files
        alter column storage_bucket set default 'item-files';

    alter table public.home_item_files
        alter column storage_bucket set not null;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_item_files_file_type_check'
          and conrelid = 'public.home_item_files'::regclass
    ) then
        alter table public.home_item_files
        add constraint home_item_files_file_type_check
        check (file_type in ('photo', 'document'));
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_item_files_user_id_fkey'
          and conrelid = 'public.home_item_files'::regclass
    )
    and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'home_item_files'
          and column_name = 'user_id'
    )
    and to_regclass('auth.users') is not null then
        alter table public.home_item_files
        add constraint home_item_files_user_id_fkey
        foreign key (user_id)
        references auth.users(id)
        on delete cascade;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'home_item_files_home_item_id_fkey'
          and conrelid = 'public.home_item_files'::regclass
    )
    and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'home_item_files'
          and column_name = 'home_item_id'
    )
    and to_regclass('public.home_items') is not null then
        alter table public.home_item_files
        add constraint home_item_files_home_item_id_fkey
        foreign key (home_item_id)
        references public.home_items(id)
        on delete cascade;
    end if;
end
$$;

create index if not exists home_item_files_user_id_idx
on public.home_item_files (user_id);

create index if not exists home_item_files_home_item_id_idx
on public.home_item_files (home_item_id);

create index if not exists home_item_files_item_slug_idx
on public.home_item_files (item_slug);

create index if not exists home_item_files_file_type_idx
on public.home_item_files (file_type);

alter table public.home_item_files enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_files'
          and policyname = 'home_item_files_select_owner'
    ) then
        create policy home_item_files_select_owner
        on public.home_item_files
        for select
        to authenticated
        using (user_id = auth.uid());
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_files'
          and policyname = 'home_item_files_insert_owner'
    ) then
        create policy home_item_files_insert_owner
        on public.home_item_files
        for insert
        to authenticated
        with check (user_id = auth.uid());
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_files'
          and policyname = 'home_item_files_update_owner'
    ) then
        create policy home_item_files_update_owner
        on public.home_item_files
        for update
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_files'
          and policyname = 'home_item_files_delete_owner'
    ) then
        create policy home_item_files_delete_owner
        on public.home_item_files
        for delete
        to authenticated
        using (user_id = auth.uid());
    end if;
end
$$;

do $$
begin
    if to_regclass('storage.buckets') is not null then
        insert into storage.buckets (id, name, public)
        values ('item-files', 'item-files', true)
        on conflict (id) do update
            set public = excluded.public;

        insert into storage.buckets (id, name, public)
        values ('item-photos', 'item-photos', true)
        on conflict (id) do update
            set public = excluded.public;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_files_select_owner_objects'
    ) then
        create policy item_files_select_owner_objects
        on storage.objects
        for select
        to authenticated
        using (
            bucket_id = 'item-files'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_files_insert_owner_objects'
    ) then
        create policy item_files_insert_owner_objects
        on storage.objects
        for insert
        to authenticated
        with check (
            bucket_id = 'item-files'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_files_update_owner_objects'
    ) then
        create policy item_files_update_owner_objects
        on storage.objects
        for update
        to authenticated
        using (
            bucket_id = 'item-files'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        )
        with check (
            bucket_id = 'item-files'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_files_delete_owner_objects'
    ) then
        create policy item_files_delete_owner_objects
        on storage.objects
        for delete
        to authenticated
        using (
            bucket_id = 'item-files'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_photos_select_owner_objects'
    ) then
        create policy item_photos_select_owner_objects
        on storage.objects
        for select
        to authenticated
        using (
            bucket_id = 'item-photos'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_photos_insert_owner_objects'
    ) then
        create policy item_photos_insert_owner_objects
        on storage.objects
        for insert
        to authenticated
        with check (
            bucket_id = 'item-photos'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_photos_update_owner_objects'
    ) then
        create policy item_photos_update_owner_objects
        on storage.objects
        for update
        to authenticated
        using (
            bucket_id = 'item-photos'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        )
        with check (
            bucket_id = 'item-photos'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'item_photos_delete_owner_objects'
    ) then
        create policy item_photos_delete_owner_objects
        on storage.objects
        for delete
        to authenticated
        using (
            bucket_id = 'item-photos'
            and (storage.foldername(name))[1] = 'users'
            and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        );
    end if;
end
$$;
