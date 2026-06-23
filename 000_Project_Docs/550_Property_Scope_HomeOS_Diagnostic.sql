-- HomeOS migration 550 production diagnostic.
-- Read-only SELECT statements only. Run in Supabase SQL Editor and return each result set.

select
    '01_schema_presence' as section,
    columns.table_name,
    columns.column_name,
    columns.data_type
from information_schema.columns
where columns.table_schema = 'public'
  and columns.table_name in (
      'properties',
      'property_memberships',
      'profiles',
      'home_items',
      'home_item_files',
      'maintenance_records',
      'home_emergencies',
      'jobs',
      'job_thread_events'
  )
  and (
      columns.column_name in (
          'id',
          'user_id',
          'owner_id',
          'property_id',
          'home_item_id',
          'item_slug',
          'category',
          'system',
          'status',
          'created_at'
      )
      or columns.column_name ilike '%property%'
      or columns.column_name ilike '%home%'
      or columns.column_name ilike '%owner%'
  )
order by columns.table_name, columns.ordinal_position;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'item_slug', '') as item_slug,
        nullif(to_jsonb(item_row)->>'category', '') as category,
        nullif(to_jsonb(item_row)->>'system', '') as system,
        nullif(to_jsonb(item_row)->>'created_at', '')::timestamptz as created_at
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
owned_properties as (
    select
        property.owner_id as user_id,
        count(*) as owned_property_count,
        coalesce(array_agg(property.id order by property.id), array[]::uuid[]) as owned_property_ids
    from public.properties as property
    group by property.owner_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(active_memberships.active_property_ids, array[]::uuid[]) as active_property_ids,
        coalesce(owned_properties.owned_property_count, 0) as owned_property_count,
        coalesce(owned_properties.owned_property_ids, array[]::uuid[]) as owned_property_ids,
        profile.id is not null as profile_exists,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id,
        case
            when item_row.existing_property_id is not null then 'existing_property_id'
            when coalesce(active_memberships.active_membership_count, 0) = 1 then 'exactly_one_active_membership'
            when item_row.user_id is null then 'null_user_id'
            when coalesce(active_memberships.active_membership_count, 0) = 0 then 'zero_active_memberships'
            when coalesce(active_memberships.active_membership_count, 0) > 1 then 'multiple_active_memberships'
            else 'unresolved'
        end as current_migration_result
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
    left join owned_properties
      on owned_properties.user_id = item_row.user_id
    left join public.profiles as profile
      on profile.id = item_row.user_id
)
select
    '02_home_items_unresolved_summary' as section,
    count(*) as total_home_items,
    count(*) filter (where current_migration_property_id is null) as unresolved_rows,
    count(*) filter (where current_migration_property_id is null and user_id is null) as unresolved_null_user_id_rows,
    count(*) filter (where current_migration_property_id is null and user_id is not null and active_membership_count = 0) as unresolved_zero_active_membership_rows,
    count(*) filter (where current_migration_property_id is null and active_membership_count > 1) as unresolved_multiple_active_membership_rows,
    count(*) filter (where current_migration_property_id is null and owned_property_count = 1) as unresolved_with_exactly_one_owned_property,
    count(*) filter (where current_migration_property_id is null and owned_property_count > 1) as unresolved_with_multiple_owned_properties,
    min(created_at) filter (where current_migration_property_id is null) as earliest_unresolved_created_at,
    max(created_at) filter (where current_migration_property_id is null) as latest_unresolved_created_at
from home_item_resolution;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'category', '') as category,
        nullif(to_jsonb(item_row)->>'system', '') as system,
        nullif(to_jsonb(item_row)->>'created_at', '')::timestamptz as created_at
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
owned_properties as (
    select
        property.owner_id as user_id,
        count(*) as owned_property_count,
        coalesce(array_agg(property.id order by property.id), array[]::uuid[]) as owned_property_ids
    from public.properties as property
    group by property.owner_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(active_memberships.active_property_ids, array[]::uuid[]) as active_property_ids,
        coalesce(owned_properties.owned_property_count, 0) as owned_property_count,
        coalesce(owned_properties.owned_property_ids, array[]::uuid[]) as owned_property_ids,
        profile.id is not null as profile_exists,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
    left join owned_properties
      on owned_properties.user_id = item_row.user_id
    left join public.profiles as profile
      on profile.id = item_row.user_id
)
select
    '03_home_items_unresolved_by_user' as section,
    user_id,
    count(*) as item_count,
    bool_or(user_id is null) as user_id_is_null,
    bool_or(profile_exists) as profile_exists,
    max(active_membership_count) as active_membership_count,
    max(active_property_ids::text) as active_property_ids,
    max(owned_property_count) as owner_property_count,
    max(owned_property_ids::text) as owner_property_ids,
    count(*) filter (where category = 'Area') as area_row_count,
    min(created_at) as earliest_created_at,
    max(created_at) as latest_created_at
from home_item_resolution
where current_migration_property_id is null
group by user_id
order by item_count desc, user_id nulls first;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'category', '') as category,
        nullif(to_jsonb(item_row)->>'system', '') as system,
        nullif(to_jsonb(item_row)->>'created_at', '')::timestamptz as created_at
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
owned_properties as (
    select
        property.owner_id as user_id,
        count(*) as owned_property_count
    from public.properties as property
    group by property.owner_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(owned_properties.owned_property_count, 0) as owned_property_count,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
    left join owned_properties
      on owned_properties.user_id = item_row.user_id
)
select
    '04_home_items_unresolved_category_counts' as section,
    coalesce(category, '[null]') as category,
    coalesce(system, '[null]') as system,
    count(*) as row_count,
    count(*) filter (where user_id is null) as null_user_id_count,
    count(*) filter (where active_membership_count = 0 and user_id is not null) as zero_active_membership_count,
    count(*) filter (where owned_property_count = 1) as exactly_one_owned_property_count,
    min(created_at) as earliest_created_at,
    max(created_at) as latest_created_at
from home_item_resolution
where current_migration_property_id is null
group by coalesce(category, '[null]'), coalesce(system, '[null]')
order by row_count desc, category, system;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'category', '') as category,
        nullif(to_jsonb(item_row)->>'system', '') as system,
        nullif(to_jsonb(item_row)->>'created_at', '')::timestamptz as created_at
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
owned_properties as (
    select
        property.owner_id as user_id,
        count(*) as owned_property_count
    from public.properties as property
    group by property.owner_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(owned_properties.owned_property_count, 0) as owned_property_count,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
    left join owned_properties
      on owned_properties.user_id = item_row.user_id
)
select
    '05_home_items_unresolved_area_rows' as section,
    system,
    count(*) as area_row_count,
    count(*) filter (where user_id is null) as null_user_id_count,
    count(*) filter (where active_membership_count = 0 and user_id is not null) as zero_active_membership_count,
    count(*) filter (where owned_property_count = 1) as exactly_one_owned_property_count,
    min(created_at) as earliest_created_at,
    max(created_at) as latest_created_at
from home_item_resolution
where current_migration_property_id is null
  and category = 'Area'
group by system
order by area_row_count desc, system;

with
candidate_columns as (
    select
        columns.column_name,
        columns.data_type
    from information_schema.columns as columns
    where columns.table_schema = 'public'
      and columns.table_name = 'home_items'
      and (
          columns.column_name ilike '%property%'
          or columns.column_name ilike '%home%'
          or columns.column_name ilike '%owner%'
          or columns.column_name ilike '%user%'
          or columns.column_name in ('id', 'item_slug', 'category', 'system', 'location', 'parent_area')
      )
)
select
    '06_home_items_possible_relationship_columns' as section,
    candidate_columns.column_name,
    candidate_columns.data_type,
    count(*) filter (
        where nullif(to_jsonb(item_row)->>candidate_columns.column_name, '') is not null
    ) as non_null_rows,
    count(distinct nullif(to_jsonb(item_row)->>candidate_columns.column_name, '')) as distinct_non_null_values
from candidate_columns
cross join public.home_items as item_row
group by candidate_columns.column_name, candidate_columns.data_type
order by candidate_columns.column_name;

select
    '07_home_items_foreign_keys' as section,
    constraints.constraint_name,
    key_columns.column_name,
    referenced.table_schema as referenced_schema,
    referenced.table_name as referenced_table,
    referenced.column_name as referenced_column
from information_schema.table_constraints as constraints
join information_schema.key_column_usage as key_columns
  on key_columns.constraint_schema = constraints.constraint_schema
 and key_columns.constraint_name = constraints.constraint_name
 and key_columns.table_schema = constraints.table_schema
 and key_columns.table_name = constraints.table_name
join information_schema.constraint_column_usage as referenced
  on referenced.constraint_schema = constraints.constraint_schema
 and referenced.constraint_name = constraints.constraint_name
where constraints.table_schema = 'public'
  and constraints.table_name = 'home_items'
  and constraints.constraint_type = 'FOREIGN KEY'
order by constraints.constraint_name, key_columns.ordinal_position;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'category', '') as category,
        nullif(to_jsonb(item_row)->>'system', '') as system,
        nullif(to_jsonb(item_row)->>'created_at', '')::timestamptz as created_at
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
owned_properties as (
    select
        property.owner_id as user_id,
        count(*) as owned_property_count
    from public.properties as property
    group by property.owner_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(owned_properties.owned_property_count, 0) as owned_property_count,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
    left join owned_properties
      on owned_properties.user_id = item_row.user_id
)
select
    '08_home_items_unresolved_sample' as section,
    record_id,
    category,
    system,
    created_at,
    user_id is null as user_id_is_null,
    active_membership_count,
    owned_property_count
from home_item_resolution
where current_migration_property_id is null
order by created_at nulls last, record_id
limit 25;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'item_slug', '') as item_slug
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
),
file_rows as (
    select
        nullif(to_jsonb(file_row)->>'id', '')::uuid as file_id,
        nullif(to_jsonb(file_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(file_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(file_row)->>'home_item_id', '')::uuid as home_item_id,
        nullif(to_jsonb(file_row)->>'item_slug', '') as item_slug,
        nullif(to_jsonb(file_row)->>'file_type', '') as file_type,
        nullif(to_jsonb(file_row)->>'category', '') as category,
        nullif(to_jsonb(file_row)->>'created_at', '')::timestamptz as created_at
    from public.home_item_files as file_row
),
file_linked_items as (
    select
        file_rows.file_id,
        item_row.record_id as linked_item_id,
        item_row.current_migration_property_id as linked_item_property_id
    from file_rows
    left join home_item_resolution as item_row
      on item_row.record_id = file_rows.home_item_id
),
exact_item_matches as (
    select
        file_rows.file_id,
        count(distinct item_row.current_migration_property_id)
            filter (where item_row.current_migration_property_id is not null) as matched_property_count,
        coalesce(
            array_agg(distinct item_row.current_migration_property_id)
                filter (where item_row.current_migration_property_id is not null),
            array[]::uuid[]
        ) as matched_property_ids
    from file_rows
    left join home_item_resolution as item_row
      on item_row.user_id = file_rows.user_id
     and item_row.item_slug = file_rows.item_slug
    group by file_rows.file_id
),
file_active_memberships as (
    select
        file_rows.file_id,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(active_memberships.active_property_ids, array[]::uuid[]) as active_property_ids
    from file_rows
    left join active_memberships
      on active_memberships.user_id = file_rows.user_id
),
file_resolution as (
    select
        file_rows.*,
        file_linked_items.linked_item_id,
        file_linked_items.linked_item_property_id,
        exact_item_matches.matched_property_count,
        exact_item_matches.matched_property_ids,
        file_active_memberships.active_membership_count,
        case
            when file_rows.existing_property_id is not null then file_rows.existing_property_id
            when file_linked_items.linked_item_property_id is not null then file_linked_items.linked_item_property_id
            when exact_item_matches.matched_property_count = 1 then exact_item_matches.matched_property_ids[1]
            when file_active_memberships.active_membership_count = 1 then file_active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from file_rows
    left join file_linked_items
      on file_linked_items.file_id = file_rows.file_id
    left join exact_item_matches
      on exact_item_matches.file_id = file_rows.file_id
    left join file_active_memberships
      on file_active_memberships.file_id = file_rows.file_id
)
select
    '09_home_item_files_unresolved_summary' as section,
    count(*) as total_home_item_files,
    count(*) filter (where current_migration_property_id is null) as unresolved_file_rows,
    count(*) filter (where current_migration_property_id is null and user_id is null) as unresolved_null_user_id_rows,
    count(*) filter (where current_migration_property_id is null and home_item_id is not null) as unresolved_with_home_item_id,
    count(*) filter (where current_migration_property_id is null and linked_item_id is not null) as unresolved_with_matching_home_item_id,
    count(*) filter (where current_migration_property_id is null and linked_item_id is not null and linked_item_property_id is null) as unresolved_linked_to_unresolved_home_item,
    count(*) filter (where current_migration_property_id is null and matched_property_count = 1) as unresolved_with_exact_slug_match,
    min(created_at) filter (where current_migration_property_id is null) as earliest_unresolved_created_at,
    max(created_at) filter (where current_migration_property_id is null) as latest_unresolved_created_at
from file_resolution;

with
home_item_rows as (
    select
        nullif(to_jsonb(item_row)->>'id', '')::uuid as record_id,
        nullif(to_jsonb(item_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(item_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(item_row)->>'item_slug', '') as item_slug
    from public.home_items as item_row
),
active_memberships as (
    select
        membership.user_id,
        count(*) filter (where membership.status = 'active') as active_membership_count,
        coalesce(
            array_agg(membership.property_id order by membership.created_at asc, membership.id asc)
                filter (where membership.status = 'active'),
            array[]::uuid[]
        ) as active_property_ids
    from public.property_memberships as membership
    group by membership.user_id
),
home_item_resolution as (
    select
        item_row.*,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        case
            when item_row.existing_property_id is not null then item_row.existing_property_id
            when coalesce(active_memberships.active_membership_count, 0) = 1
                then active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from home_item_rows as item_row
    left join active_memberships
      on active_memberships.user_id = item_row.user_id
),
file_rows as (
    select
        nullif(to_jsonb(file_row)->>'id', '')::uuid as file_id,
        nullif(to_jsonb(file_row)->>'user_id', '')::uuid as user_id,
        nullif(to_jsonb(file_row)->>'property_id', '')::uuid as existing_property_id,
        nullif(to_jsonb(file_row)->>'home_item_id', '')::uuid as home_item_id,
        nullif(to_jsonb(file_row)->>'item_slug', '') as item_slug,
        nullif(to_jsonb(file_row)->>'file_type', '') as file_type,
        nullif(to_jsonb(file_row)->>'category', '') as category,
        nullif(to_jsonb(file_row)->>'created_at', '')::timestamptz as created_at
    from public.home_item_files as file_row
),
file_linked_items as (
    select
        file_rows.file_id,
        item_row.record_id as linked_item_id,
        item_row.current_migration_property_id as linked_item_property_id
    from file_rows
    left join home_item_resolution as item_row
      on item_row.record_id = file_rows.home_item_id
),
file_active_memberships as (
    select
        file_rows.file_id,
        coalesce(active_memberships.active_membership_count, 0) as active_membership_count,
        coalesce(active_memberships.active_property_ids, array[]::uuid[]) as active_property_ids
    from file_rows
    left join active_memberships
      on active_memberships.user_id = file_rows.user_id
),
file_resolution as (
    select
        file_rows.*,
        file_linked_items.linked_item_id,
        file_linked_items.linked_item_property_id,
        file_active_memberships.active_membership_count,
        case
            when file_rows.existing_property_id is not null then file_rows.existing_property_id
            when file_linked_items.linked_item_property_id is not null then file_linked_items.linked_item_property_id
            when file_active_memberships.active_membership_count = 1 then file_active_memberships.active_property_ids[1]
            else null::uuid
        end as current_migration_property_id
    from file_rows
    left join file_linked_items
      on file_linked_items.file_id = file_rows.file_id
    left join file_active_memberships
      on file_active_memberships.file_id = file_rows.file_id
)
select
    '10_home_item_files_unresolved_sample' as section,
    file_id,
    file_type,
    category,
    created_at,
    user_id is null as user_id_is_null,
    home_item_id is not null as has_home_item_id,
    linked_item_id is not null as linked_home_item_found,
    linked_item_property_id is not null as linked_home_item_has_property,
    active_membership_count
from file_resolution
where current_migration_property_id is null
order by created_at nulls last, file_id
limit 25;
