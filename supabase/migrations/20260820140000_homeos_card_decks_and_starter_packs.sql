-- Platform-admin HomeOS Card Decks and versioned Starter Packs.  These are
-- catalog definitions only: they do not provision, edit, archive, move, or
-- otherwise mutate installed HomeOS cards, except for the narrowly audited
-- Toilet Drain legacy parentage repair below.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.homeos_starter_identity(text)') is null
       or to_regprocedure('public.homeos_item_placement_identity(text,text,text,text,text)') is null
       or to_regprocedure('public.homeos_complete_room_kind(text)') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'homeos_starter_card_templates'
             and column_name = 'presentation_role'
       ) then
        raise exception 'HomeOS Card Decks require the current HomeOS catalog, product, template-role, and platform-admin foundations.';
    end if;
end;
$$;

-- Keep a complete, pre-migration installed-card snapshot.  This guard is
-- checked once before the legacy repair and again against an exact expected
-- fingerprint after it, so future catalog-only edits cannot quietly write
-- home_items.
create temporary table homeos_card_decks_home_items_guard
on commit drop
as
select
    item.id,
    item.parent_home_item_id,
    to_jsonb(item) as row_json
from public.home_items item;

create temporary table homeos_card_decks_home_items_fingerprint_guard
on commit drop
as
select
    count(*)::bigint as row_count,
    md5(coalesce(string_agg(guard.row_json::text, E'\n' order by guard.id), '')) as row_fingerprint
from homeos_card_decks_home_items_guard guard;

create table if not exists public.homeos_area_card_templates (
    area_key text primary key,
    name text not null,
    scope text not null,
    aliases jsonb not null default '[]'::jsonb,
    display_order integer not null,
    publication_status text not null default 'draft',
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint homeos_area_card_templates_key_check
        check (area_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
    constraint homeos_area_card_templates_name_check check (btrim(name) <> ''),
    constraint homeos_area_card_templates_scope_check check (scope in ('interior', 'exterior')),
    constraint homeos_area_card_templates_aliases_check check (jsonb_typeof(aliases) = 'array'),
    constraint homeos_area_card_templates_display_order_check check (display_order >= 0),
    constraint homeos_area_card_templates_publication_status_check
        check (publication_status in ('draft', 'published', 'archived'))
);

create index if not exists homeos_area_card_templates_published_order_idx
    on public.homeos_area_card_templates(scope, display_order, name)
    where publication_status = 'published';

-- A set is the durable identity.  Revisions are numbered snapshots under it;
-- only an active set's current published revision is consumable.
create table if not exists public.homeos_card_sets (
    id uuid primary key default gen_random_uuid(),
    set_key text not null,
    name text not null,
    description text,
    status text not null default 'active',
    current_published_revision_id uuid,
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    archived_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    constraint homeos_card_sets_key_check
        check (set_key ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
    constraint homeos_card_sets_name_check check (btrim(name) <> ''),
    constraint homeos_card_sets_status_check check (status in ('active', 'archived')),
    constraint homeos_card_sets_archive_audit_check check (
        (status = 'active' and archived_at is null and archived_by_user_id is null)
        or (status = 'archived' and archived_at is not null)
    )
);

create unique index if not exists homeos_card_sets_key_uidx
    on public.homeos_card_sets(lower(btrim(set_key)));

create table if not exists public.homeos_card_set_revisions (
    id uuid primary key default gen_random_uuid(),
    card_set_id uuid not null references public.homeos_card_sets(id) on delete restrict,
    revision_number integer not null,
    publication_status text not null default 'draft',
    created_by_user_id uuid references auth.users(id) on delete set null,
    published_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    published_at timestamptz,
    retired_at timestamptz,
    constraint homeos_card_set_revisions_number_check check (revision_number >= 1),
    constraint homeos_card_set_revisions_publication_status_check
        check (publication_status in ('draft', 'published', 'retired')),
    constraint homeos_card_set_revisions_publication_audit_check check (
        (publication_status = 'draft' and published_at is null and published_by_user_id is null and retired_at is null)
        or (publication_status = 'published' and published_at is not null and retired_at is null)
        or (publication_status = 'retired' and retired_at is not null)
    ),
    unique (card_set_id, revision_number)
);

create unique index if not exists homeos_card_set_revisions_one_draft_uidx
    on public.homeos_card_set_revisions(card_set_id)
    where publication_status = 'draft';

create unique index if not exists homeos_card_set_revisions_one_published_uidx
    on public.homeos_card_set_revisions(card_set_id)
    where publication_status = 'published';

alter table public.homeos_card_sets
    drop constraint if exists homeos_card_sets_current_published_revision_id_fkey;
alter table public.homeos_card_sets
    add constraint homeos_card_sets_current_published_revision_id_fkey
    foreign key (current_published_revision_id)
    references public.homeos_card_set_revisions(id)
    on delete restrict;

create table if not exists public.homeos_card_set_revision_members (
    id uuid primary key default gen_random_uuid(),
    revision_id uuid not null references public.homeos_card_set_revisions(id) on delete restrict,
    slot_key text not null,
    parent_slot_key text,
    display_order integer not null,
    member_behavior text not null default 'instantiate',
    area_card_key text references public.homeos_area_card_templates(area_key) on delete restrict,
    starter_template_key text references public.homeos_starter_card_templates(template_key) on delete restrict,
    catalog_product_variant_id uuid references public.catalog_product_variants(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint homeos_card_set_revision_members_slot_check
        check (slot_key ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
    constraint homeos_card_set_revision_members_parent_slot_check
        check (parent_slot_key is null or parent_slot_key ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'),
    constraint homeos_card_set_revision_members_not_self_parent_check
        check (parent_slot_key is null or parent_slot_key <> slot_key),
    constraint homeos_card_set_revision_members_display_order_check check (display_order >= 0),
    constraint homeos_card_set_revision_members_behavior_check
        check (member_behavior in ('instantiate', 'recommendation')),
    constraint homeos_card_set_revision_members_exactly_one_target_check check (
        num_nonnulls(area_card_key, starter_template_key, catalog_product_variant_id) = 1
    ),
    constraint homeos_card_set_revision_members_product_recommendation_check
        check (catalog_product_variant_id is null or member_behavior = 'recommendation'),
    unique (revision_id, slot_key),
    unique (revision_id, display_order)
);

alter table public.homeos_card_set_revision_members
    drop constraint if exists homeos_card_set_revision_members_same_revision_parent_fkey;
alter table public.homeos_card_set_revision_members
    add constraint homeos_card_set_revision_members_same_revision_parent_fkey
    foreign key (revision_id, parent_slot_key)
    references public.homeos_card_set_revision_members(revision_id, slot_key)
    on delete no action
    deferrable initially deferred;

create index if not exists homeos_card_set_revision_members_order_idx
    on public.homeos_card_set_revision_members(revision_id, display_order, slot_key);

alter table public.homeos_area_card_templates enable row level security;
alter table public.homeos_card_sets enable row level security;
alter table public.homeos_card_set_revisions enable row level security;
alter table public.homeos_card_set_revision_members enable row level security;

revoke all on table public.homeos_area_card_templates from public, anon, authenticated;
revoke all on table public.homeos_card_sets from public, anon, authenticated;
revoke all on table public.homeos_card_set_revisions from public, anon, authenticated;
revoke all on table public.homeos_card_set_revision_members from public, anon, authenticated;

-- The source list is intentionally the canonical propertyAreaCatalog from
-- src/lib/propertyAreas.ts, with that module's explicit aliases retained.
with seed(area_key, name, scope, aliases, display_order) as (
    values
        ('kitchen', 'Kitchen', 'interior', '["Kitchen"]'::jsonb, 10),
        ('living_room', 'Living Room', 'interior', '["Living Room"]'::jsonb, 20),
        ('dining_room', 'Dining Room', 'interior', '["Dining Room"]'::jsonb, 30),
        ('hallway', 'Hallway', 'interior', '["Hallway"]'::jsonb, 40),
        ('garage', 'Garage', 'interior', '["Garage","Attached Garage"]'::jsonb, 50),
        ('laundry', 'Laundry', 'interior', '["Laundry","Laundry Room"]'::jsonb, 60),
        ('primary_bedroom', 'Primary Bedroom', 'interior', '["Primary Bedroom","Master Bedroom"]'::jsonb, 70),
        ('bedroom', 'Bedroom', 'interior', '["Bedroom"]'::jsonb, 80),
        ('primary_bathroom', 'Primary Bathroom', 'interior', '["Primary Bathroom","Master Bathroom"]'::jsonb, 90),
        ('bathroom', 'Bathroom', 'interior', '["Bathroom"]'::jsonb, 100),
        ('office', 'Office', 'interior', '["Office"]'::jsonb, 110),
        ('attic', 'Attic', 'interior', '["Attic"]'::jsonb, 120),
        ('basement', 'Basement', 'interior', '["Basement"]'::jsonb, 130),
        ('utility_or_mechanical_room', 'Utility or Mechanical Room', 'interior', '["Utility or Mechanical Room","Utility / Mechanical Room","Utility Room","Mechanical Room"]'::jsonb, 140),
        ('gym', 'Gym', 'interior', '["Gym"]'::jsonb, 150),
        ('bar', 'Bar', 'interior', '["Bar"]'::jsonb, 160),
        ('theater', 'Theater', 'interior', '["Theater"]'::jsonb, 170),
        ('man_cave', 'Man Cave', 'interior', '["Man Cave"]'::jsonb, 180),
        ('wine_room', 'Wine Room', 'interior', '["Wine Room"]'::jsonb, 190),
        ('storage_room', 'Storage Room', 'interior', '["Storage Room"]'::jsonb, 200),
        ('interior_walkway', 'Interior Walkway', 'interior', '["Interior Walkway"]'::jsonb, 210),
        ('custom_area', 'Custom Area', 'interior', '["Custom Area"]'::jsonb, 220),
        ('front_yard', 'Front Yard', 'exterior', '["Front Yard"]'::jsonb, 230),
        ('backyard', 'Backyard', 'exterior', '["Backyard","Back Yard"]'::jsonb, 240),
        ('left_side_yard', 'Left Side Yard', 'exterior', '["Left Side Yard"]'::jsonb, 250),
        ('right_side_yard', 'Right Side Yard', 'exterior', '["Right Side Yard"]'::jsonb, 260),
        ('patio', 'Patio', 'exterior', '["Patio"]'::jsonb, 270),
        ('porch', 'Porch', 'exterior', '["Porch"]'::jsonb, 280),
        ('balcony', 'Balcony', 'exterior', '["Balcony"]'::jsonb, 290),
        ('driveway', 'Driveway', 'exterior', '["Driveway"]'::jsonb, 300),
        ('pool_area', 'Pool Area', 'exterior', '["Pool Area"]'::jsonb, 310),
        ('spa_area', 'Spa Area', 'exterior', '["Spa Area"]'::jsonb, 320),
        ('bbq_or_outdoor_kitchen', 'BBQ or Outdoor Kitchen', 'exterior', '["BBQ or Outdoor Kitchen","BBQ / Grill Area","Outdoor Kitchen"]'::jsonb, 330),
        ('detached_garage', 'Detached Garage', 'exterior', '["Detached Garage"]'::jsonb, 340),
        ('shed', 'Shed', 'exterior', '["Shed"]'::jsonb, 350),
        ('workshop', 'Workshop', 'exterior', '["Workshop"]'::jsonb, 360),
        ('guest_house_or_adu', 'Guest House or ADU', 'exterior', '["Guest House or ADU","Guest House","ADU"]'::jsonb, 370),
        ('pool_house', 'Pool House', 'exterior', '["Pool House"]'::jsonb, 380),
        ('landscaping', 'Landscaping', 'exterior', '["Landscaping"]'::jsonb, 390),
        ('irrigation', 'Irrigation', 'exterior', '["Irrigation"]'::jsonb, 400),
        ('roof', 'Roof', 'exterior', '["Roof"]'::jsonb, 410),
        ('exterior_mechanical_area', 'Exterior Mechanical Area', 'exterior', '["Exterior Mechanical Area"]'::jsonb, 420),
        ('exterior_shutoff_area', 'Exterior Shutoff Area', 'exterior', '["Exterior Shutoff Area"]'::jsonb, 430),
        ('custom_exterior_area', 'Custom Exterior Area', 'exterior', '["Custom Exterior Area"]'::jsonb, 440)
)
insert into public.homeos_area_card_templates(
    area_key, name, scope, aliases, display_order, publication_status
)
select area_key, name, scope, aliases, display_order, 'published'
from seed
on conflict (area_key) do update
set name = excluded.name,
    scope = excluded.scope,
    aliases = excluded.aliases,
    display_order = excluded.display_order,
    publication_status = excluded.publication_status,
    updated_at = now();

-- The missing canonical component is template-only.  Its legacy instance
-- repair below deliberately does not set starter_template_key: changing a
-- historical card's identity is outside this migration's narrow authority.
insert into public.homeos_starter_card_templates(
    template_key, room_kind, name, system, category, parent_template_key,
    aliases, placement_tags, display_order, readiness_status, active,
    trade_key, presentation_role, auto_provision
)
values (
    'bathroom:toilet_drain', 'bathroom', 'Toilet Drain', 'Drains / Sewer', 'Component',
    'bathroom:toilet', '["Toilet Sewer Drain","Toilet Waste Drain"]'::jsonb,
    '["bathroom"]'::jsonb, 245, 'unbuilt', true, 'plumbing', 'component', false
)
on conflict (template_key) do update
set room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = excluded.parent_template_key,
    aliases = excluded.aliases,
    placement_tags = excluded.placement_tags,
    display_order = excluded.display_order,
    active = true,
    trade_key = excluded.trade_key,
    presentation_role = 'component',
    auto_provision = false,
    updated_at = now();

-- No catalog/table DDL above may have touched installed cards.
do $$
declare
    v_before_count bigint;
    v_before_fingerprint text;
    v_after_count bigint;
    v_after_fingerprint text;
begin
    select row_count, row_fingerprint
    into v_before_count, v_before_fingerprint
    from homeos_card_decks_home_items_fingerprint_guard;

    select count(*)::bigint,
           md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_after_count, v_after_fingerprint
    from public.home_items item;

    if v_after_count is distinct from v_before_count
       or v_after_fingerprint is distinct from v_before_fingerprint then
        raise exception 'HomeOS Card Deck catalog definitions must not mutate installed HomeOS cards.';
    end if;
end;
$$;

-- Backfill only an unkeyed, active, root-level legacy Toilet Drain Fixture
-- whose existing snapshot exactly identifies one active root Toilet.  Both historic
-- forms are recognized: the explicit Toilet -> Bathroom chain and the older
-- same-room root snapshot.  The full guard below allows only the bounded
-- parentage attachment and, for the same-room shape, its exact canonical
-- parent snapshot rewrite.  Repeated, wrong-placement, archived, keyed, and
-- already-parented rows remain untouched.
create temporary table homeos_card_decks_toilet_drain_attachment_guard
on commit drop
as
with eligible_parent_matches as (
    select
        child.id as child_id,
        parent.id as parent_id,
        child.property_id,
        lower(child.item_slug) as proposed_slug,
        public.homeos_item_placement_identity(
            child.system,
            child.category,
            child.name,
            parent.name,
            parent.location
        ) as proposed_identity,
        public.homeos_starter_identity(parent.name) as proposed_location,
        public.homeos_starter_identity(parent.location) as proposed_parent_area,
        nullif(btrim(coalesce(parent.name, '')), '') as expected_location,
        nullif(btrim(coalesce(parent.location, '')), '') as expected_parent_area,
        case
            when public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.name)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.location)
                then 'legacy_chain'
            else 'same_room_root'
        end as attachment_shape,
        count(*) over (partition by child.id) as parent_count
    from public.home_items child
    join public.home_items parent
     on parent.property_id = child.property_id
     and parent.parent_home_item_id is null
     and coalesce(parent.archived, false) = false
     and public.homeos_complete_room_kind(parent.location) = 'bathroom'
     and (
         parent.starter_template_key = 'bathroom:toilet'
         or (
             parent.starter_template_key is null
             and public.homeos_starter_identity(parent.name) = 'toilet'
             and public.homeos_starter_identity(parent.system) = 'plumbing'
             and lower(btrim(coalesce(parent.category, ''))) in ('fixture', 'equipment')
         )
     )
     and (
         (
             public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.name)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.location)
         )
         or (
             public.homeos_starter_identity(child.location) = public.homeos_starter_identity(parent.location)
             and public.homeos_starter_identity(child.parent_area) = public.homeos_starter_identity(parent.parent_area)
         )
     )
    where child.starter_template_key is null
      and child.parent_home_item_id is null
      and coalesce(child.archived, false) = false
      and public.homeos_starter_identity(child.name) = 'toilet drain'
      and public.homeos_starter_identity(child.system) = 'drains sewer'
      and public.homeos_starter_identity(child.category) = 'fixture'
      and not exists (
          select 1
          from public.home_items descendant
          where descendant.parent_home_item_id = child.id
      )
),
destination_safe_candidates as (
    select candidate.*
    from eligible_parent_matches candidate
    -- Resolve ambiguity from every otherwise eligible parent first.  A
    -- collision on one parent target must never make a second parent look
    -- uniquely eligible and cause this bounded repair to guess.
    where candidate.parent_count = 1
      and not exists (
          select 1
          from public.home_items placement_conflict
          where placement_conflict.property_id = candidate.property_id
            and placement_conflict.id <> candidate.child_id
            and coalesce(placement_conflict.archived, false) = false
            and public.homeos_item_placement_identity(
                placement_conflict.system,
                placement_conflict.category,
                placement_conflict.name,
                placement_conflict.location,
                placement_conflict.parent_area
            ) = candidate.proposed_identity
      )
      and not exists (
          select 1
          from public.home_items slug_conflict
          where candidate.proposed_slug is not null
            and slug_conflict.property_id = candidate.property_id
            and slug_conflict.id <> candidate.child_id
            and coalesce(slug_conflict.archived, false) = false
            and lower(slug_conflict.item_slug) = candidate.proposed_slug
            and public.homeos_starter_identity(slug_conflict.location) = candidate.proposed_location
            and public.homeos_starter_identity(slug_conflict.parent_area) = candidate.proposed_parent_area
      )
),
uniquely_resolved as (
    select
        candidate.*,
        count(*) over (
            partition by candidate.property_id, candidate.proposed_identity
        ) as proposed_identity_count,
        case
            when candidate.proposed_slug is null then 1
            else count(*) over (
                partition by
                    candidate.property_id,
                    candidate.proposed_slug,
                    candidate.proposed_location,
                    candidate.proposed_parent_area
            )
        end as proposed_slug_count
    from destination_safe_candidates candidate
)
-- Two independently valid legacy snapshots can still converge on one active
-- placement or placement-qualified slug.  Keep both untouched rather than
-- letting the bounded repair create an identity conflict.
select child_id, parent_id, expected_location, expected_parent_area, attachment_shape
from uniquely_resolved
where proposed_identity_count = 1
  and proposed_slug_count = 1;

do $$
declare
    v_previous_parentage_system_write text := current_setting('barbarosa.homeos_parentage_system_write', true);
begin
    perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);
    update public.home_items child
    set parent_home_item_id = attachment.parent_id
    from homeos_card_decks_toilet_drain_attachment_guard attachment
    where child.id = attachment.child_id
      and child.parent_home_item_id is null
      and child.starter_template_key is null
      and coalesce(child.archived, false) = false;

    perform set_config(
        'barbarosa.homeos_parentage_system_write',
        coalesce(v_previous_parentage_system_write, ''),
        true
    );
exception when others then
    perform set_config(
        'barbarosa.homeos_parentage_system_write',
        coalesce(v_previous_parentage_system_write, ''),
        true
    );
    raise;
end;
$$;

-- Compare the entire post-migration fingerprint against the pre-migration
-- rows with exactly the allowed parent UUID substitutions applied.
do $$
declare
    v_expected_count bigint;
    v_expected_fingerprint text;
    v_actual_count bigint;
    v_actual_fingerprint text;
begin
    with expected_rows as (
        select
            guard.id,
            case
                when attachment.child_id is not null then jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            guard.row_json,
                            '{parent_home_item_id}',
                            to_jsonb(attachment.parent_id),
                            true
                        ),
                        '{location}',
                        to_jsonb(attachment.expected_location),
                        true
                    ),
                    '{parent_area}',
                    to_jsonb(attachment.expected_parent_area),
                    true
                )
                else guard.row_json
            end as row_json
        from homeos_card_decks_home_items_guard guard
        left join homeos_card_decks_toilet_drain_attachment_guard attachment
          on attachment.child_id = guard.id
    )
    select count(*)::bigint,
           md5(coalesce(string_agg(expected_rows.row_json::text, E'\n' order by expected_rows.id), ''))
    into v_expected_count, v_expected_fingerprint
    from expected_rows;

    select count(*)::bigint,
           md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by item.id), ''))
    into v_actual_count, v_actual_fingerprint
    from public.home_items item;

    if v_actual_count is distinct from v_expected_count
       or v_actual_fingerprint is distinct from v_expected_fingerprint then
        raise exception 'HomeOS Card Decks may only attach the exact bounded Toilet Drain legacy parentage rows.';
    end if;
end;
$$;

create or replace function public.homeos_validate_card_set_current_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_revision public.homeos_card_set_revisions%rowtype;
begin
    if new.current_published_revision_id is null then
        return new;
    end if;

    select revision.*
    into v_revision
    from public.homeos_card_set_revisions revision
    where revision.id = new.current_published_revision_id;

    if not found
       or v_revision.card_set_id is distinct from new.id
       or v_revision.publication_status <> 'published' then
        raise exception 'A Card Set current revision must be its own published revision.' using errcode = '23514';
    end if;

    return new;
end;
$$;

create or replace function public.homeos_prevent_published_card_set_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if old.publication_status = 'published'
       and coalesce(current_setting('barbarosa.homeos_card_set_publish', true), '') <> 'allowed' then
        raise exception 'Published Card Set revisions are immutable.' using errcode = '55000';
    end if;

    if old.publication_status = 'retired' then
        raise exception 'Retired Card Set revisions are immutable.' using errcode = '55000';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create or replace function public.homeos_prevent_published_card_set_member_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_old_revision_status text;
    v_new_revision_status text;
begin
    if tg_op <> 'INSERT' then
        select revision.publication_status
        into v_old_revision_status
        from public.homeos_card_set_revisions revision
        where revision.id = old.revision_id;
    end if;

    if tg_op <> 'DELETE' then
        select revision.publication_status
        into v_new_revision_status
        from public.homeos_card_set_revisions revision
        where revision.id = new.revision_id;
    end if;

    if v_old_revision_status in ('published', 'retired')
       or v_new_revision_status in ('published', 'retired') then
        raise exception 'Published and retired Card Set revision members are immutable.' using errcode = '55000';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create or replace function public.homeos_validate_card_set_revision_for_publication(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_revision public.homeos_card_set_revisions%rowtype;
    v_area_root_count integer;
begin
    select revision.*
    into v_revision
    from public.homeos_card_set_revisions revision
    where revision.id = p_revision_id;

    if not found then
        raise exception 'Card Set revision was not found.';
    end if;

    if not exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id = p_revision_id
    ) then
        raise exception 'A published Starter Pack must contain at least one card.' using errcode = '23514';
    end if;

    select count(*)::integer
    into v_area_root_count
    from public.homeos_card_set_revision_members member
    where member.revision_id = p_revision_id
      and member.area_card_key is not null
      and member.parent_slot_key is null
      and member.member_behavior = 'instantiate';

    if v_area_root_count <> 1
       or (select count(*) from public.homeos_card_set_revision_members member
           where member.revision_id = p_revision_id and member.area_card_key is not null) <> 1 then
        raise exception 'A published Starter Pack must have exactly one instantiated Area root member.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members member
        left join public.homeos_area_card_templates area on area.area_key = member.area_card_key
        left join public.homeos_starter_card_templates template on template.template_key = member.starter_template_key
        left join public.catalog_product_variants variant on variant.id = member.catalog_product_variant_id
        where member.revision_id = p_revision_id
          and (
              (member.area_card_key is not null and (
                  area.area_key is null or area.publication_status <> 'published'
              ))
              or (member.starter_template_key is not null and (
                  template.template_key is null or not template.active
              ))
              or (member.catalog_product_variant_id is not null and (
                  variant.id is null or variant.status <> 'approved'
              ))
          )
    ) then
        raise exception 'Published Starter Pack members must reference published Areas, active starter templates, and approved product variants.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id = p_revision_id
          and member.area_card_key is not null
          and (member.parent_slot_key is not null or member.member_behavior <> 'instantiate')
    ) then
        raise exception 'An Area Card may only be the instantiated Starter Pack root.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members member
        where member.revision_id = p_revision_id
          and member.starter_template_key is not null
          and member.member_behavior <> 'instantiate'
    ) then
        raise exception 'Starter-template cards must be instantiated; only product cards may be recommendations.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members child
        join public.homeos_starter_card_templates child_template
          on child_template.template_key = child.starter_template_key
        left join public.homeos_card_set_revision_members parent
          on parent.revision_id = child.revision_id
         and parent.slot_key = child.parent_slot_key
        where child.revision_id = p_revision_id
          and child_template.presentation_role = 'container'
          and (child.parent_slot_key is null or parent.area_card_key is null)
    ) then
        raise exception 'Container starter cards must parent the Area root.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members child
        join public.homeos_starter_card_templates child_template
          on child_template.template_key = child.starter_template_key
        left join public.homeos_card_set_revision_members parent
          on parent.revision_id = child.revision_id
         and parent.slot_key = child.parent_slot_key
        left join public.homeos_starter_card_templates parent_template
          on parent_template.template_key = parent.starter_template_key
        where child.revision_id = p_revision_id
          and child_template.presentation_role = 'component'
          and (
              child.parent_slot_key is null
              or parent.starter_template_key is null
              or parent_template.presentation_role not in ('container', 'component')
              or (
                  child_template.parent_template_key is not null
                  and child_template.parent_template_key is distinct from parent.starter_template_key
              )
          )
    ) then
        raise exception 'Component starter cards must parent an appropriate starter container or component.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.homeos_card_set_revision_members product
        left join public.homeos_card_set_revision_members parent
          on parent.revision_id = product.revision_id
         and parent.slot_key = product.parent_slot_key
        where product.revision_id = p_revision_id
          and product.catalog_product_variant_id is not null
          and (
              product.member_behavior <> 'recommendation'
              or product.parent_slot_key is null
              or parent.starter_template_key is null
          )
    ) or exists (
        select 1
        from public.homeos_card_set_revision_members product
        join public.homeos_card_set_revision_members child
          on child.revision_id = product.revision_id
         and child.parent_slot_key = product.slot_key
        where product.revision_id = p_revision_id
          and product.catalog_product_variant_id is not null
    ) then
        raise exception 'Product variants are recommendation-only leaves beneath starter-template cards.' using errcode = '23514';
    end if;

    if exists (
        with recursive walk(root_slot_key, current_slot_key, parent_slot_key, path, cycle) as (
            select member.slot_key, member.slot_key, member.parent_slot_key,
                   array[member.slot_key]::text[], false
            from public.homeos_card_set_revision_members member
            where member.revision_id = p_revision_id
            union all
            select walk.root_slot_key, parent.slot_key, parent.parent_slot_key,
                   walk.path || parent.slot_key,
                   parent.slot_key = any(walk.path)
            from walk
            join public.homeos_card_set_revision_members parent
              on parent.revision_id = p_revision_id
             and parent.slot_key = walk.parent_slot_key
            where walk.parent_slot_key is not null
              and not walk.cycle
        )
        select 1 from walk where cycle
    ) then
        raise exception 'Starter Pack member parent slots may not contain a cycle.' using errcode = '23514';
    end if;
end;
$$;

drop trigger if exists homeos_card_sets_validate_current_revision on public.homeos_card_sets;
create trigger homeos_card_sets_validate_current_revision
before insert or update on public.homeos_card_sets
for each row execute function public.homeos_validate_card_set_current_revision();

drop trigger if exists homeos_card_set_revisions_prevent_published_mutation on public.homeos_card_set_revisions;
create trigger homeos_card_set_revisions_prevent_published_mutation
before update or delete on public.homeos_card_set_revisions
for each row execute function public.homeos_prevent_published_card_set_revision_mutation();

drop trigger if exists homeos_card_set_revision_members_prevent_published_mutation on public.homeos_card_set_revision_members;
create trigger homeos_card_set_revision_members_prevent_published_mutation
before insert or update or delete on public.homeos_card_set_revision_members
for each row execute function public.homeos_prevent_published_card_set_member_mutation();

-- Immutable, reference-only v1 packs give Super Admin a concrete published
-- baseline without auto-applying anything to a property.  The first edit uses
-- save_admin_homeos_card_set_draft to clone the published revision into v2.
-- Stable IDs make seed assertions and cross-environment references durable.
insert into public.homeos_card_sets(
    id, set_key, name, description, status, created_at, updated_at
)
values
    ('62000000-0000-4000-8000-000000000001'::uuid, 'bathroom_plumbing', 'Bathroom Plumbing', 'Reference-only Bathroom plumbing Starter Pack.', 'active', now(), now()),
    ('62000000-0000-4000-8000-000000000002'::uuid, 'kitchen_plumbing', 'Kitchen Plumbing', 'Reference-only Kitchen plumbing Starter Pack.', 'active', now(), now()),
    ('62000000-0000-4000-8000-000000000003'::uuid, 'garage_plumbing', 'Garage Plumbing', 'Reference-only Garage plumbing Starter Pack.', 'active', now(), now())
on conflict do nothing;

insert into public.homeos_card_set_revisions(
    id, card_set_id, revision_number, publication_status, created_at, updated_at
)
values
    ('62100000-0000-4000-8000-000000000001'::uuid, '62000000-0000-4000-8000-000000000001'::uuid, 1, 'draft', now(), now()),
    ('62100000-0000-4000-8000-000000000002'::uuid, '62000000-0000-4000-8000-000000000002'::uuid, 1, 'draft', now(), now()),
    ('62100000-0000-4000-8000-000000000003'::uuid, '62000000-0000-4000-8000-000000000003'::uuid, 1, 'draft', now(), now())
on conflict do nothing;

insert into public.homeos_card_set_revision_members(
    revision_id, slot_key, parent_slot_key, display_order, member_behavior,
    area_card_key, starter_template_key
)
values
    -- Bathroom: one Area root; plumbing/drain starter cards only.
    ('62100000-0000-4000-8000-000000000001'::uuid, 'bathroom_area', null, 10, 'instantiate', 'bathroom', null),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'bathroom_vanity', 'bathroom_area', 20, 'instantiate', null, 'bathroom:bathroom_vanity'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'bathroom_sink', 'bathroom_vanity', 30, 'instantiate', null, 'bathroom:bathroom_sink'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'bathroom_sink_faucet', 'bathroom_vanity', 40, 'instantiate', null, 'bathroom:bathroom_sink_faucet'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'shower_tub', 'bathroom_area', 50, 'instantiate', null, 'bathroom:shower_tub'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'shower_valve', 'shower_tub', 60, 'instantiate', null, 'bathroom:shower_valve'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'toilet', 'bathroom_area', 70, 'instantiate', null, 'bathroom:toilet'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'toilet_shutoff', 'toilet', 80, 'instantiate', null, 'bathroom:toilet_shutoff_angle_stop'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'toilet_supply', 'toilet', 90, 'instantiate', null, 'bathroom:toilet_supply_line'),
    ('62100000-0000-4000-8000-000000000001'::uuid, 'toilet_drain', 'toilet', 100, 'instantiate', null, 'bathroom:toilet_drain'),
    -- Kitchen: no electrical/safety cards.
    ('62100000-0000-4000-8000-000000000002'::uuid, 'kitchen_area', null, 10, 'instantiate', 'kitchen', null),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'kitchen_sink', 'kitchen_area', 20, 'instantiate', null, 'kitchen:kitchen_sink'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'kitchen_faucet', 'kitchen_sink', 30, 'instantiate', null, 'kitchen:kitchen_faucet'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'garbage_disposal', 'kitchen_sink', 40, 'instantiate', null, 'kitchen:garbage_disposal'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'kitchen_sink_drain', 'kitchen_sink', 50, 'instantiate', null, 'kitchen:kitchen_sink_drain'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'dishwasher', 'kitchen_area', 60, 'instantiate', null, 'kitchen:dishwasher'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'dishwasher_supply', 'dishwasher', 70, 'instantiate', null, 'kitchen:dishwasher_supply_line'),
    ('62100000-0000-4000-8000-000000000002'::uuid, 'dishwasher_drain', 'dishwasher', 80, 'instantiate', null, 'kitchen:dishwasher_drain_hose'),
    -- Garage: only canonical plumbing/water-quality starter cards.
    ('62100000-0000-4000-8000-000000000003'::uuid, 'garage_area', null, 10, 'instantiate', 'garage', null),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'water_heater', 'garage_area', 20, 'instantiate', null, 'garage:water_heater'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'water_heater_cold_connection', 'water_heater', 30, 'instantiate', null, 'garage:water_heater_cold_water_connection'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'water_heater_shutoff', 'water_heater', 40, 'instantiate', null, 'garage:water_heater_shutoff_valve'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'water_heater_drain', 'water_heater', 50, 'instantiate', null, 'garage:water_heater_sediment_drain_valve'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'washer_box', 'garage_area', 60, 'instantiate', null, 'garage:washer_box_laundry_connections'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'washer_hot_valve', 'washer_box', 70, 'instantiate', null, 'garage:washer_hot_valve'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'washer_drain', 'washer_box', 80, 'instantiate', null, 'garage:washer_drain_standpipe'),
    ('62100000-0000-4000-8000-000000000003'::uuid, 'whole_home_filter', 'garage_area', 90, 'instantiate', null, 'garage:whole_home_filter')
on conflict do nothing;

update public.homeos_card_set_revisions revision
set publication_status = 'published',
    published_at = now(),
    updated_at = now()
where revision.id in (
    '62100000-0000-4000-8000-000000000001'::uuid,
    '62100000-0000-4000-8000-000000000002'::uuid,
    '62100000-0000-4000-8000-000000000003'::uuid
)
  and revision.publication_status = 'draft';

update public.homeos_card_sets card_set
set current_published_revision_id = case card_set.set_key
        when 'bathroom_plumbing' then '62100000-0000-4000-8000-000000000001'::uuid
        when 'kitchen_plumbing' then '62100000-0000-4000-8000-000000000002'::uuid
        when 'garage_plumbing' then '62100000-0000-4000-8000-000000000003'::uuid
    end,
    updated_at = now()
where card_set.set_key in ('bathroom_plumbing', 'kitchen_plumbing', 'garage_plumbing')
  and card_set.current_published_revision_id is null;

do $$
declare
    v_seed_set_id uuid;
begin
    foreach v_seed_set_id in array array[
        '62000000-0000-4000-8000-000000000001'::uuid,
        '62000000-0000-4000-8000-000000000002'::uuid,
        '62000000-0000-4000-8000-000000000003'::uuid
    ] loop
        perform public.homeos_validate_card_set_revision_for_publication((
            select card_set.current_published_revision_id
            from public.homeos_card_sets card_set
            where card_set.id = v_seed_set_id
        ));
    end loop;
end;
$$;

create or replace function public.get_super_admin_homeos_card_decks()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'areas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'area_key', area.area_key,
                'name', area.name,
                'scope', area.scope,
                'aliases', area.aliases,
                'display_order', area.display_order,
                'publication_status', area.publication_status
            ) order by area.display_order, area.name)
            from public.homeos_area_card_templates area
        ), '[]'::jsonb),
        'card_sets', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', card_set.id,
                'set_key', card_set.set_key,
                'name', card_set.name,
                'description', coalesce(card_set.description, ''),
                'status', card_set.status,
                'current_published_revision_id', card_set.current_published_revision_id,
                'current_published_revision_number', (
                    select revision.revision_number
                    from public.homeos_card_set_revisions revision
                    where revision.id = card_set.current_published_revision_id
                ),
                'draft_revision_number', (
                    select revision.revision_number
                    from public.homeos_card_set_revisions revision
                    where revision.card_set_id = card_set.id
                      and revision.publication_status = 'draft'
                ),
                'published_revision_number', (
                    select revision.revision_number
                    from public.homeos_card_set_revisions revision
                    where revision.id = card_set.current_published_revision_id
                ),
                'revisions', coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'id', revision.id,
                        'revision_number', revision.revision_number,
                        'status', revision.publication_status,
                        'publication_status', revision.publication_status,
                        'created_at', revision.created_at,
                        'published_at', revision.published_at,
                        'members', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                'slot_key', member.slot_key,
                                'parent_slot_key', member.parent_slot_key,
                                'display_order', member.display_order,
                                'member_behavior', member.member_behavior,
                                'target_kind', case
                                    when member.area_card_key is not null then 'area'
                                    when member.starter_template_key is not null then 'starter_template'
                                    else 'catalog_product_variant'
                                end,
                                'area_card_key', member.area_card_key,
                                'starter_template_key', member.starter_template_key,
                                'catalog_product_variant_id', member.catalog_product_variant_id,
                                'target', case
                                    when member.area_card_key is not null then jsonb_build_object(
                                        'kind', 'area', 'key', member.area_card_key,
                                        'name', area.name, 'publication_status', area.publication_status
                                    )
                                    when member.starter_template_key is not null then jsonb_build_object(
                                        'kind', 'starter_template', 'key', member.starter_template_key,
                                        'name', template.name, 'presentation_role', template.presentation_role,
                                        'active', template.active
                                    )
                                    else jsonb_build_object(
                                        'kind', 'catalog_product_variant', 'id', member.catalog_product_variant_id,
                                        'name', coalesce(variant.variant_name, variant.model_number),
                                        'status', variant.status
                                    )
                                end
                            ) order by member.display_order, member.slot_key)
                            from public.homeos_card_set_revision_members member
                            left join public.homeos_area_card_templates area on area.area_key = member.area_card_key
                            left join public.homeos_starter_card_templates template on template.template_key = member.starter_template_key
                            left join public.catalog_product_variants variant on variant.id = member.catalog_product_variant_id
                            where member.revision_id = revision.id
                        ), '[]'::jsonb)
                    ) order by revision.revision_number desc)
                    from public.homeos_card_set_revisions revision
                    where revision.card_set_id = card_set.id
                ), '[]'::jsonb)
            ) order by card_set.created_at, card_set.id)
            from public.homeos_card_sets card_set
        ), '[]'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

create or replace function public.save_admin_homeos_card_set_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_set public.homeos_card_sets%rowtype;
    v_revision public.homeos_card_set_revisions%rowtype;
    v_set_id uuid;
    v_payload_set_id text;
    v_set_key text;
    v_name text;
    v_description text;
    v_members jsonb;
    v_member jsonb;
    v_target jsonb;
    v_slot_key text;
    v_parent_slot_key text;
    v_behavior text;
    v_kind text;
    v_target_key text;
    v_target_id uuid;
    v_display_order integer;
    v_max_revision_number integer;
    v_result jsonb;
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.' using errcode = '42501';
    end if;
    if jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Card Set draft payload must be an object.' using errcode = '22023';
    end if;

    v_members := p_payload->'members';
    if jsonb_typeof(v_members) <> 'array' then
        raise exception 'Card Set draft payload must include a full members array.' using errcode = '22023';
    end if;

    v_payload_set_id := nullif(btrim(coalesce(p_payload->>'id', '')), '');
    if v_payload_set_id is not null then
        begin
            v_set_id := v_payload_set_id::uuid;
        exception when invalid_text_representation then
            raise exception 'Card Set id must be a UUID.' using errcode = '22023';
        end;

        select card_set.*
        into v_set
        from public.homeos_card_sets card_set
        where card_set.id = v_set_id
        for update;

        if not found then
            raise exception 'Card Set was not found.' using errcode = 'P0002';
        end if;
        if v_set.status <> 'active' then
            raise exception 'Archived Card Sets cannot be edited.' using errcode = '55000';
        end if;

        update public.homeos_card_sets card_set
        set name = case when p_payload ? 'name' then nullif(btrim(coalesce(p_payload->>'name', '')), '') else card_set.name end,
            description = case when p_payload ? 'description' then nullif(btrim(coalesce(p_payload->>'description', '')), '') else card_set.description end,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where card_set.id = v_set.id;

        if exists (
            select 1 from public.homeos_card_sets card_set
            where card_set.id = v_set.id and btrim(card_set.name) = ''
        ) then
            raise exception 'Card Set name is required.' using errcode = '22023';
        end if;

        select revision.*
        into v_revision
        from public.homeos_card_set_revisions revision
        where revision.card_set_id = v_set.id
          and revision.publication_status = 'draft'
        for update;

        if not found then
            select coalesce(max(revision.revision_number), 0)
            into v_max_revision_number
            from public.homeos_card_set_revisions revision
            where revision.card_set_id = v_set.id;

            insert into public.homeos_card_set_revisions(
                card_set_id, revision_number, publication_status, created_by_user_id
            ) values (
                v_set.id, v_max_revision_number + 1, 'draft', auth.uid()
            ) returning * into v_revision;

            -- A published revision is cloned before the incoming full payload
            -- replaces it.  This preserves the explicit immutable lineage and
            -- makes a no-op edit a true numbered clone.
            insert into public.homeos_card_set_revision_members(
                revision_id, slot_key, parent_slot_key, display_order,
                member_behavior, area_card_key, starter_template_key,
                catalog_product_variant_id
            )
            select v_revision.id, member.slot_key, member.parent_slot_key,
                   member.display_order, member.member_behavior,
                   member.area_card_key, member.starter_template_key,
                   member.catalog_product_variant_id
            from public.homeos_card_set_revision_members member
            join public.homeos_card_set_revisions published
              on published.id = member.revision_id
             and published.card_set_id = v_set.id
             and published.publication_status = 'published';
        end if;
    else
        v_set_key := lower(btrim(coalesce(p_payload->>'set_key', '')));
        v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
        v_description := nullif(btrim(coalesce(p_payload->>'description', '')), '');

        if v_set_key !~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'
           or v_name is null then
            raise exception 'A new Card Set requires a lowercase stable set_key and a name.' using errcode = '22023';
        end if;

        insert into public.homeos_card_sets(
            set_key, name, description, created_by_user_id, updated_by_user_id
        ) values (
            v_set_key, v_name, v_description, auth.uid(), auth.uid()
        ) returning * into v_set;

        insert into public.homeos_card_set_revisions(
            card_set_id, revision_number, publication_status, created_by_user_id
        ) values (
            v_set.id, 1, 'draft', auth.uid()
        ) returning * into v_revision;
    end if;

    -- A full payload replaces the only mutable revision.  The deferred same-
    -- revision parent FK permits clients to send child slots before parents.
    delete from public.homeos_card_set_revision_members
    where revision_id = v_revision.id;

    for v_member in select value from jsonb_array_elements(v_members)
    loop
        if jsonb_typeof(v_member) <> 'object' then
            raise exception 'Every Card Set member must be an object.' using errcode = '22023';
        end if;

        v_slot_key := lower(btrim(coalesce(v_member->>'slot_key', '')));
        v_parent_slot_key := nullif(lower(btrim(coalesce(v_member->>'parent_slot_key', ''))), '');
        v_behavior := lower(btrim(coalesce(v_member->>'member_behavior', 'instantiate')));
        v_display_order := case
            when jsonb_typeof(v_member->'display_order') = 'number' then (v_member->>'display_order')::integer
            else null
        end;
        v_target := v_member->'target';

        if v_slot_key !~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'
           or (v_parent_slot_key is not null and v_parent_slot_key !~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$')
           or v_behavior not in ('instantiate', 'recommendation')
           or v_display_order is null
           or v_display_order < 0
           or jsonb_typeof(v_target) <> 'object' then
            raise exception 'Card Set member slot, parent slot, behavior, display order, or target is invalid.' using errcode = '22023';
        end if;

        v_kind := lower(btrim(coalesce(v_target->>'kind', '')));
        v_target_key := nullif(btrim(coalesce(v_target->>'key', '')), '');

        if v_kind = 'area' then
            if v_target_key is null or not exists (
                select 1 from public.homeos_area_card_templates area where area.area_key = v_target_key
            ) then raise exception 'Area member target was not found.' using errcode = '23503'; end if;

            insert into public.homeos_card_set_revision_members(
                revision_id, slot_key, parent_slot_key, display_order, member_behavior, area_card_key
            ) values (v_revision.id, v_slot_key, v_parent_slot_key, v_display_order, v_behavior, v_target_key);
        elsif v_kind = 'starter_template' then
            if v_target_key is null or not exists (
                select 1 from public.homeos_starter_card_templates template where template.template_key = v_target_key
            ) then raise exception 'Starter-template member target was not found.' using errcode = '23503'; end if;

            insert into public.homeos_card_set_revision_members(
                revision_id, slot_key, parent_slot_key, display_order, member_behavior, starter_template_key
            ) values (v_revision.id, v_slot_key, v_parent_slot_key, v_display_order, v_behavior, v_target_key);
        elsif v_kind = 'catalog_product_variant' then
            begin
                v_target_id := nullif(btrim(coalesce(v_target->>'id', '')), '')::uuid;
            exception when invalid_text_representation then
                raise exception 'Product-variant member target must be a UUID.' using errcode = '22023';
            end;

            if v_target_id is null or not exists (
                select 1 from public.catalog_product_variants variant where variant.id = v_target_id
            ) then raise exception 'Product-variant member target was not found.' using errcode = '23503'; end if;

            insert into public.homeos_card_set_revision_members(
                revision_id, slot_key, parent_slot_key, display_order, member_behavior, catalog_product_variant_id
            ) values (v_revision.id, v_slot_key, v_parent_slot_key, v_display_order, v_behavior, v_target_id);
        else
            raise exception 'Card Set target.kind must be area, starter_template, or catalog_product_variant.' using errcode = '22023';
        end if;
    end loop;

    update public.homeos_card_set_revisions
    set updated_at = now()
    where id = v_revision.id;

    select card_set
    into v_result
    from jsonb_array_elements(public.get_super_admin_homeos_card_decks()->'card_sets') card_set
    where card_set->>'id' = v_set.id::text;

    return v_result;
end;
$$;

create or replace function public.publish_admin_homeos_card_set(p_card_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_set public.homeos_card_sets%rowtype;
    v_draft public.homeos_card_set_revisions%rowtype;
    v_previous_published_id uuid;
    v_previous_publish_write text := current_setting('barbarosa.homeos_card_set_publish', true);
    v_result jsonb;
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.' using errcode = '42501';
    end if;

    select card_set.*
    into v_set
    from public.homeos_card_sets card_set
    where card_set.id = p_card_set_id
    for update;

    if not found or v_set.status <> 'active' then
        raise exception 'Active Card Set was not found.' using errcode = 'P0002';
    end if;

    select revision.*
    into v_draft
    from public.homeos_card_set_revisions revision
    where revision.card_set_id = v_set.id
      and revision.publication_status = 'draft'
    for update;

    if not found then
        raise exception 'Card Set has no draft revision to publish.' using errcode = '55000';
    end if;

    perform public.homeos_validate_card_set_revision_for_publication(v_draft.id);
    perform set_config('barbarosa.homeos_card_set_publish', 'allowed', true);

    select revision.id
    into v_previous_published_id
    from public.homeos_card_set_revisions revision
    where revision.card_set_id = v_set.id
      and revision.publication_status = 'published'
    for update;

    -- Retire first so the partial one-published-revision index remains true
    -- throughout the transaction; the current pointer is advanced before the
    -- transaction can commit, so readers never observe the intermediate state.
    if v_previous_published_id is not null then
        update public.homeos_card_set_revisions
        set publication_status = 'retired',
            retired_at = now(),
            updated_at = now()
        where id = v_previous_published_id;
    end if;

    update public.homeos_card_set_revisions
    set publication_status = 'published',
        published_by_user_id = auth.uid(),
        published_at = now(),
        updated_at = now()
    where id = v_draft.id;

    update public.homeos_card_sets
    set current_published_revision_id = v_draft.id,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where id = v_set.id;

    select card_set
    into v_result
    from jsonb_array_elements(public.get_super_admin_homeos_card_decks()->'card_sets') card_set
    where card_set->>'id' = v_set.id::text;

    perform set_config(
        'barbarosa.homeos_card_set_publish',
        coalesce(v_previous_publish_write, ''),
        true
    );
    return v_result;
exception when others then
    perform set_config(
        'barbarosa.homeos_card_set_publish',
        coalesce(v_previous_publish_write, ''),
        true
    );
    raise;
end;
$$;

create or replace function public.archive_admin_homeos_card_set(p_card_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_set public.homeos_card_sets%rowtype;
    v_result jsonb;
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.' using errcode = '42501';
    end if;

    select card_set.*
    into v_set
    from public.homeos_card_sets card_set
    where card_set.id = p_card_set_id
    for update;

    if not found then
        raise exception 'Card Set was not found.' using errcode = 'P0002';
    end if;

    if v_set.status = 'active' then
        update public.homeos_card_sets
        set status = 'archived',
            archived_at = now(),
            archived_by_user_id = auth.uid(),
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where id = v_set.id;
    end if;

    select card_set
    into v_result
    from jsonb_array_elements(public.get_super_admin_homeos_card_decks()->'card_sets') card_set
    where card_set->>'id' = v_set.id::text;

    return v_result;
end;
$$;

-- Keep the existing Catalog Factory bulk mapper's API and grants intact while
-- closing the status gap: a Starter Card mapping may never reference a draft,
-- rejected, or archived master product variant.
create or replace function public.save_homeos_starter_card_deck_entry(
    p_template_key text,
    p_variant_ids uuid[],
    p_readiness_status text,
    p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;
    if p_readiness_status not in ('unbuilt', 'building', 'ready') then
        raise exception 'Invalid starter-card readiness.';
    end if;
    if not exists (
        select 1 from public.homeos_starter_card_templates
        where template_key = p_template_key and active
    ) then
        raise exception 'Starter card was not found.';
    end if;
    if exists (
        select 1
        from unnest(coalesce(p_variant_ids, array[]::uuid[])) variant_id
        where not exists (
            select 1
            from public.catalog_product_variants variant
            where variant.id = variant_id
              and variant.status = 'approved'
        )
    ) then
        raise exception 'Starter-card product mappings require approved catalog product variants.' using errcode = '23514';
    end if;

    delete from public.homeos_starter_card_catalog_variants
    where template_key = p_template_key;

    insert into public.homeos_starter_card_catalog_variants(
        template_key, product_variant_id, created_by_user_id
    )
    select p_template_key, variant_id, auth.uid()
    from (
        select distinct unnest(coalesce(p_variant_ids, array[]::uuid[])) as variant_id
    ) selected;

    update public.homeos_starter_card_templates
    set readiness_status = p_readiness_status,
        admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
        updated_at = now()
    where template_key = p_template_key;

    select entry
    into v_result
    from jsonb_array_elements(public.get_homeos_starter_card_deck()) entry
    where entry->>'template_key' = p_template_key;

    return v_result;
end;
$$;

revoke all on function public.homeos_validate_card_set_current_revision() from public, anon, authenticated;
revoke all on function public.homeos_prevent_published_card_set_revision_mutation() from public, anon, authenticated;
revoke all on function public.homeos_prevent_published_card_set_member_mutation() from public, anon, authenticated;
revoke all on function public.homeos_validate_card_set_revision_for_publication(uuid) from public, anon, authenticated;
revoke all on function public.get_super_admin_homeos_card_decks() from public, anon;
revoke all on function public.save_admin_homeos_card_set_draft(jsonb) from public, anon;
revoke all on function public.publish_admin_homeos_card_set(uuid) from public, anon;
revoke all on function public.archive_admin_homeos_card_set(uuid) from public, anon;

grant execute on function public.get_super_admin_homeos_card_decks() to authenticated;
grant execute on function public.save_admin_homeos_card_set_draft(jsonb) to authenticated;
grant execute on function public.publish_admin_homeos_card_set(uuid) to authenticated;
grant execute on function public.archive_admin_homeos_card_set(uuid) to authenticated;

comment on table public.homeos_area_card_templates is
    'Platform-owned, version-independent Area cards seeded from propertyAreaCatalog.';
comment on table public.homeos_card_sets is
    'Stable Starter Pack identities. An active set points only to its current immutable published revision.';
comment on table public.homeos_card_set_revisions is
    'Numbered Starter Pack revisions. Published and retired revision records are immutable.';
comment on table public.homeos_card_set_revision_members is
    'Ordered revision-scoped member graph with one Area, starter-template, or Catalog Factory product target.';
comment on function public.get_super_admin_homeos_card_decks() is
    'Platform-admin Card Deck contract: {areas, card_sets}; each set includes its ordered revisions and members.';
comment on function public.save_admin_homeos_card_set_draft(jsonb) is
    'Platform-admin full-replacement draft save. Payload: {id? | set_key/name for create, name?, description?, members:[{slot_key,parent_slot_key?,display_order,member_behavior,target:{kind,key|id}}]}.';

commit;
