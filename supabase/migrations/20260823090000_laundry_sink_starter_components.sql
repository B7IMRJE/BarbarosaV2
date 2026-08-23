-- Add the standard serviceable components that belong under a Laundry Sink.
-- This extends the existing HomeOS starter-card catalog; it does not create a
-- parallel catalog or alter existing customer item data beyond missing children.

begin;

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_room_check;

alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_room_check
    check (room_kind in ('bathroom','kitchen','garage','laundry'));

create or replace function public.homeos_complete_room_kind(p_area_name text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_name text := public.homeos_starter_identity(p_area_name);
begin
    if v_name = '' or v_name like '%outdoor kitchen%' then return null; end if;
    if v_name ~ '(^| )(bathroom|bath room|master bath|primary bath|guest bath|half bath|powder room)( |$)' then return 'bathroom'; end if;
    if v_name ~ '(^| )kitchen( |$)' then return 'kitchen'; end if;
    if v_name ~ '(^| )garage( |$)' then return 'garage'; end if;
    if v_name ~ '(^| )(laundry|laundry room)( |$)' then return 'laundry'; end if;
    return null;
end;
$$;

with seed(room_kind, name, system, category, aliases, parent_name, display_order) as (
    values
    ('laundry','Laundry Sink','Plumbing','Fixture','["Utility Sink"]'::jsonb,null,10),
    ('laundry','Laundry Sink Faucet','Plumbing','Component','["Laundry Faucet","Utility Sink Faucet"]'::jsonb,'Laundry Sink',20),
    ('laundry','Laundry Sink Hot Angle Stop','Plumbing','Component','["Hot Angle Stop","Laundry Hot Angle Stop"]'::jsonb,'Laundry Sink',30),
    ('laundry','Laundry Sink Cold Angle Stop','Plumbing','Component','["Cold Angle Stop","Laundry Cold Angle Stop"]'::jsonb,'Laundry Sink',40),
    ('laundry','Laundry Sink Hot Supply Line','Plumbing','Component','["Hot Supply Line","Laundry Hot Supply Line"]'::jsonb,'Laundry Sink',50),
    ('laundry','Laundry Sink Cold Supply Line','Plumbing','Component','["Cold Supply Line","Laundry Cold Supply Line"]'::jsonb,'Laundry Sink',60),
    ('laundry','Laundry Sink P-Trap','Drains / Sewer','Component','["Laundry P-Trap","Utility Sink P-Trap"]'::jsonb,'Laundry Sink',70)
), prepared as (
    select
        room_kind || ':' || replace(public.homeos_starter_identity(name), ' ', '_') as template_key,
        room_kind, name, system, category,
        case when parent_name is null then null
             else room_kind || ':' || replace(public.homeos_starter_identity(parent_name), ' ', '_') end as parent_template_key,
        aliases, display_order
    from seed
)
insert into public.homeos_starter_card_templates(
    template_key, room_kind, name, system, category, parent_template_key, aliases, display_order
)
select template_key, room_kind, name, system, category, parent_template_key, aliases, display_order
from prepared
on conflict (template_key) do update set
    room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = excluded.parent_template_key,
    aliases = excluded.aliases,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

-- Provision missing children for existing Laundry areas. The existing
-- provision function remains the single canonical installation path.
do $$
declare
    v_area record;
begin
    for v_area in
        select id
        from public.home_items
        where lower(btrim(coalesce(category, ''))) = 'area'
          and coalesce(archived, false) = false
          and public.homeos_complete_room_kind(name) = 'laundry'
    loop
        perform public.provision_complete_room_starter_cards(v_area.id);
    end loop;
end;
$$;

commit;
