-- Assignment-scoped provider maintenance plus reusable, location-neutral
-- electrical starter archetypes for the HomeOS Deck.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.home_item_maintenance_tasks') is null
       or to_regclass('public.home_item_maintenance_completions') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is null then
        raise exception 'Maintenance Wizard requires HomeOS items, maintenance timers, assignment access, audit logging, and the starter-card Deck.';
    end if;
end;
$$;

alter table public.homeos_starter_card_templates
    add column if not exists placement_tags jsonb not null default '[]'::jsonb;

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_room_check;

alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_room_check
    check (btrim(room_kind) <> '');

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_placement_tags_check;

alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_placement_tags_check
    check (jsonb_typeof(placement_tags) = 'array');

with electrical_seed(
    template_key, room_kind, name, category, aliases, placement_tags, display_order
) as (
    values
    ('electrical_whole_home:main_electrical_panel', 'electrical_whole_home', 'Main Electrical Panel', 'Equipment', '["Main Panel","Breaker Panel","Service Panel"]'::jsonb, '["whole_home"]'::jsonb, 10),
    ('electrical_whole_home:electrical_subpanel', 'electrical_whole_home', 'Electrical Subpanel', 'Equipment', '["Subpanel","Sub Panel"]'::jsonb, '["whole_home","garage"]'::jsonb, 20),
    ('electrical_exterior:meter_service_entrance', 'electrical_exterior', 'Electrical Meter / Service Entrance', 'Equipment', '["Electrical Meter","Service Entrance","Utility Service"]'::jsonb, '["whole_home","exterior"]'::jsonb, 10),
    ('electrical_living_room:receptacle_outlet', 'electrical_living_room', 'Receptacle / Outlet', 'Component', '["Electrical Outlet","Wall Outlet","Receptacle"]'::jsonb, '["living_room","hall","kitchen","bathroom","exterior","garage"]'::jsonb, 10),
    ('electrical_whole_home:gfci_afci_protection', 'electrical_whole_home', 'GFCI / AFCI Protection', 'Component', '["GFCI","AFCI","Ground Fault Protection","Arc Fault Protection"]'::jsonb, '["whole_home","kitchen","bathroom","exterior","garage"]'::jsonb, 30),
    ('electrical_living_room:switch_dimmer', 'electrical_living_room', 'Switch / Dimmer', 'Component', '["Light Switch","Dimmer Switch"]'::jsonb, '["living_room","hall","kitchen","bathroom","exterior","garage"]'::jsonb, 20),
    ('electrical_living_room:interior_light_fixture', 'electrical_living_room', 'Interior Light Fixture', 'Fixture', '["Interior Light","Ceiling Light","Wall Light"]'::jsonb, '["living_room","hall","kitchen","bathroom","garage"]'::jsonb, 30),
    ('electrical_exterior:exterior_light_fixture', 'electrical_exterior', 'Exterior Light Fixture', 'Fixture', '["Outdoor Light","Exterior Lighting"]'::jsonb, '["exterior","garage"]'::jsonb, 20),
    ('electrical_living_room:ceiling_fan', 'electrical_living_room', 'Ceiling Fan', 'Equipment', '["Ceiling Light Fan"]'::jsonb, '["living_room"]'::jsonb, 40),
    ('electrical_bathroom:bathroom_exhaust_fan', 'electrical_bathroom', 'Bathroom Exhaust Fan', 'Equipment', '["Exhaust Fan","Ventilation Fan"]'::jsonb, '["bathroom"]'::jsonb, 10),
    ('electrical_hall:smoke_carbon_monoxide_alarm', 'electrical_hall', 'Smoke / Carbon Monoxide Alarm', 'Equipment', '["Smoke Alarm","CO Alarm","Carbon Monoxide Alarm","Combination Alarm"]'::jsonb, '["whole_home","living_room","hall","kitchen","garage"]'::jsonb, 10),
    ('electrical_exterior:doorbell_low_voltage', 'electrical_exterior', 'Doorbell / Low-Voltage System', 'Equipment', '["Doorbell","Low Voltage","Chime"]'::jsonb, '["whole_home","living_room","exterior"]'::jsonb, 30),
    ('electrical_kitchen:dedicated_electrical_circuit', 'electrical_kitchen', 'Dedicated Electrical Circuit', 'Component', '["Dedicated Circuit","Appliance Circuit"]'::jsonb, '["whole_home","kitchen","bathroom","garage"]'::jsonb, 10),
    ('electrical_garage:ev_charger', 'electrical_garage', 'EV Charger', 'Equipment', '["Electric Vehicle Charger","EVSE"]'::jsonb, '["garage","exterior"]'::jsonb, 10),
    ('electrical_whole_home:whole_home_surge_protector', 'electrical_whole_home', 'Whole-Home Surge Protector', 'Equipment', '["Surge Protection Device","Whole House Surge Protector"]'::jsonb, '["whole_home"]'::jsonb, 40),
    ('electrical_garage:electric_heater', 'electrical_garage', 'Electric Heater', 'Equipment', '["Electric Space Heater","Wall Heater"]'::jsonb, '["garage","living_room","bathroom"]'::jsonb, 20),
    ('electrical_garage:generator_transfer_switch', 'electrical_garage', 'Generator / Transfer Switch', 'Equipment', '["Standby Generator","Portable Generator Connection","Transfer Switch"]'::jsonb, '["whole_home","garage","exterior"]'::jsonb, 30)
)
insert into public.homeos_starter_card_templates(
    template_key,
    room_kind,
    name,
    system,
    category,
    parent_template_key,
    aliases,
    placement_tags,
    display_order,
    readiness_status,
    active
)
select
    seed.template_key,
    seed.room_kind,
    seed.name,
    'Electrical',
    seed.category,
    null,
    seed.aliases,
    seed.placement_tags,
    seed.display_order,
    'unbuilt',
    true
from electrical_seed seed
on conflict (template_key) do update
set room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    aliases = excluded.aliases,
    placement_tags = excluded.placement_tags,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

create or replace function public.get_homeos_starter_card_picker()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Sign in to browse HomeOS Deck cards.' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'room_kind', template.room_kind,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'aliases', template.aliases,
        'placement_tags', template.placement_tags,
        'display_order', template.display_order
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'starter_template'
     and code.entity_key = template.template_key
    where template.active;

    return v_result;
end;
$$;

create or replace function public.get_homeos_starter_card_deck()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'room_kind', template.room_kind,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'aliases', template.aliases,
        'placement_tags', template.placement_tags,
        'display_order', template.display_order,
        'readiness_status', template.readiness_status,
        'admin_notes', coalesce(template.admin_notes, ''),
        'mapped_variant_ids', coalesce(mapping.mapped_variant_ids, '[]'::jsonb),
        'mapped_count', coalesce(mapping.mapped_count, 0),
        'approved_option_count', coalesce(mapping.approved_option_count, 0),
        'readiness_issues', to_jsonb(array_remove(array[
            case when coalesce(mapping.mapped_count, 0) = 0 then 'No real catalog product options mapped.' end,
            case when coalesce(mapping.mapped_count, 0) > 0 and coalesce(mapping.approved_option_count, 0) = 0 then 'Mapped options are not approved yet.' end,
            case when template.readiness_status <> 'ready' then 'Starter card is not marked ready.' end
        ], null))
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'starter_template'
     and code.entity_key = template.template_key
    left join lateral (
        select
            jsonb_agg(link.product_variant_id::text order by link.created_at, link.product_variant_id) as mapped_variant_ids,
            count(*)::integer as mapped_count,
            count(*) filter (where variant.status = 'approved')::integer as approved_option_count
        from public.homeos_starter_card_catalog_variants link
        join public.catalog_product_variants variant on variant.id = link.product_variant_id
        where link.template_key = template.template_key
    ) mapping on true
    where template.active;

    return v_result;
end;
$$;

create or replace function public.homeos_can_manage_provider_maintenance(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and p_property_id is not null
       and (
           public.company_sales_context_matches_client_home(
               p_company_id,
               p_property_id,
               p_service_request_id,
               p_schedule_slot_id,
               p_job_id
           )
           or public.homeos_can_read_provider_assigned_items(
               p_company_id,
               p_property_id,
               p_service_request_id,
               p_schedule_slot_id,
               p_job_id
           )
       );
$$;

create or replace function public.get_provider_homeos_maintenance(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_tasks jsonb;
    v_completions jsonb;
begin
    if not public.homeos_can_manage_provider_maintenance(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Maintenance access requires an assigned company job or sales visit.' using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.home_items item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then
        raise exception 'That HomeOS item is not available for this assigned home.' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(to_jsonb(task) order by task.next_due_date, task.created_at, task.id), '[]'::jsonb)
    into v_tasks
    from public.home_item_maintenance_tasks task
    where task.property_id = p_property_id
      and task.home_item_id = p_home_item_id;

    select coalesce(jsonb_agg(to_jsonb(completion) order by completion.completed_on desc, completion.created_at desc, completion.id desc), '[]'::jsonb)
    into v_completions
    from public.home_item_maintenance_completions completion
    where completion.property_id = p_property_id
      and completion.home_item_id = p_home_item_id;

    return jsonb_build_object('tasks', v_tasks, 'completions', v_completions);
end;
$$;

create or replace function public.save_provider_homeos_maintenance_task(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_title text,
    p_recurrence_interval integer,
    p_recurrence_unit text,
    p_start_date date,
    p_next_due_date date,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_task_id uuid default null,
    p_item_slug text default null,
    p_system text default null,
    p_task_key text default null,
    p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_task public.home_item_maintenance_tasks%rowtype;
    v_action text;
    v_previous jsonb := null;
begin
    if not public.homeos_can_manage_provider_maintenance(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Maintenance changes require an assigned company job or sales visit.' using errcode = '42501';
    end if;
    if btrim(coalesce(p_title, '')) = '' then raise exception 'Maintenance task title is required.'; end if;
    if p_recurrence_interval is null or p_recurrence_interval < 1 then raise exception 'Maintenance cadence must be at least one.'; end if;
    if p_recurrence_unit not in ('days', 'weeks', 'months', 'years') then raise exception 'Choose a valid maintenance cadence.'; end if;
    if p_start_date is null or p_next_due_date is null then raise exception 'Maintenance start and next due dates are required.'; end if;
    if not exists (
        select 1 from public.home_items item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then raise exception 'That HomeOS item is not available for this assigned home.' using errcode = '42501'; end if;

    perform pg_advisory_xact_lock(hashtextextended(p_home_item_id::text, 0));

    if p_task_id is not null then
        select to_jsonb(task)
        into v_previous
        from public.home_item_maintenance_tasks task
        where task.id = p_task_id
          and task.property_id = p_property_id
          and task.home_item_id = p_home_item_id
        for update;

        update public.home_item_maintenance_tasks task
        set item_slug = nullif(btrim(coalesce(p_item_slug, '')), ''),
            system = nullif(btrim(coalesce(p_system, '')), ''),
            task_key = nullif(btrim(coalesce(p_task_key, '')), ''),
            title = btrim(p_title),
            description = nullif(btrim(coalesce(p_description, '')), ''),
            recurrence_interval = p_recurrence_interval,
            recurrence_unit = p_recurrence_unit,
            start_date = p_start_date,
            next_due_date = p_next_due_date,
            reminder_status = 'active'
        where task.id = p_task_id
          and task.property_id = p_property_id
          and task.home_item_id = p_home_item_id
        returning task.* into v_task;
        if v_task.id is null then raise exception 'That maintenance task is not available for this assigned home.' using errcode = '42501'; end if;
        v_action := 'provider_homeos_maintenance_update';
    else
        select task.*
        into v_task
        from public.home_item_maintenance_tasks task
        where task.property_id = p_property_id
          and task.home_item_id = p_home_item_id
          and task.reminder_status = 'active'
          and (
              (nullif(btrim(coalesce(p_task_key, '')), '') is not null and task.task_key = nullif(btrim(coalesce(p_task_key, '')), ''))
              or (nullif(btrim(coalesce(p_task_key, '')), '') is null and lower(btrim(task.title)) = lower(btrim(p_title)))
          )
        order by task.created_at, task.id
        limit 1
        for update;

        if v_task.id is not null then
            return v_task.id;
        end if;

        insert into public.home_item_maintenance_tasks(
            user_id,
            property_id,
            home_item_id,
            item_slug,
            system,
            task_key,
            title,
            description,
            recurrence_interval,
            recurrence_unit,
            start_date,
            next_due_date,
            reminder_status,
            created_by
        ) values (
            auth.uid(),
            p_property_id,
            p_home_item_id,
            nullif(btrim(coalesce(p_item_slug, '')), ''),
            nullif(btrim(coalesce(p_system, '')), ''),
            nullif(btrim(coalesce(p_task_key, '')), ''),
            btrim(p_title),
            nullif(btrim(coalesce(p_description, '')), ''),
            p_recurrence_interval,
            p_recurrence_unit,
            p_start_date,
            p_next_due_date,
            'active',
            auth.uid()
        ) returning * into v_task;
        v_action := 'provider_homeos_maintenance_create';
    end if;

    perform public.log_company_audit_event(
        p_company_id,
        v_action,
        'home_item_maintenance_task',
        v_task.id,
        v_task.title,
        v_previous,
        to_jsonb(v_task),
        jsonb_build_object(
            'property_id', p_property_id,
            'home_item_id', p_home_item_id,
            'service_request_id', p_service_request_id,
            'schedule_slot_id', p_schedule_slot_id,
            'job_id', p_job_id
        )
    );

    return v_task.id;
end;
$$;

create or replace function public.complete_provider_homeos_maintenance_task(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_task_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_task public.home_item_maintenance_tasks%rowtype;
    v_completion public.home_item_maintenance_completions%rowtype;
    v_next_due date;
begin
    if not public.homeos_can_manage_provider_maintenance(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Maintenance completion requires an assigned company job or sales visit.' using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 0));

    select task.*
    into v_task
    from public.home_item_maintenance_tasks task
    join public.home_items item
      on item.id = task.home_item_id
     and item.property_id = task.property_id
     and coalesce(item.archived, false) = false
    where task.id = p_task_id
      and task.property_id = p_property_id
      and task.home_item_id = p_home_item_id
    for update of task;

    if v_task.id is null then raise exception 'That maintenance task is not available for this assigned home.' using errcode = '42501'; end if;

    select completion.*
    into v_completion
    from public.home_item_maintenance_completions completion
    where completion.maintenance_task_id = p_task_id
      and completion.completed_on = current_date
    order by completion.created_at, completion.id
    limit 1;

    if v_completion.id is not null then return v_completion.id; end if;

    insert into public.home_item_maintenance_completions(
        maintenance_task_id,
        user_id,
        property_id,
        home_item_id,
        completed_on,
        created_by
    ) values (
        p_task_id,
        auth.uid(),
        p_property_id,
        p_home_item_id,
        current_date,
        auth.uid()
    ) returning * into v_completion;

    v_next_due := case v_task.recurrence_unit
        when 'days' then current_date + v_task.recurrence_interval
        when 'weeks' then current_date + (v_task.recurrence_interval * 7)
        when 'months' then (current_date + make_interval(months => v_task.recurrence_interval))::date
        when 'years' then (current_date + make_interval(years => v_task.recurrence_interval))::date
    end;

    update public.home_item_maintenance_tasks task
    set last_completed_date = current_date,
        next_due_date = v_next_due,
        reminder_status = 'active'
    where task.id = p_task_id;

    perform public.log_company_audit_event(
        p_company_id,
        'provider_homeos_maintenance_complete',
        'home_item_maintenance_task',
        v_task.id,
        v_task.title,
        to_jsonb(v_task),
        jsonb_build_object('completed_on', current_date, 'next_due_date', v_next_due),
        jsonb_build_object(
            'property_id', p_property_id,
            'home_item_id', p_home_item_id,
            'service_request_id', p_service_request_id,
            'schedule_slot_id', p_schedule_slot_id,
            'job_id', p_job_id,
            'completion_id', v_completion.id
        )
    );

    return v_completion.id;
end;
$$;

revoke all on function public.get_homeos_starter_card_picker() from public, anon;
revoke all on function public.get_homeos_starter_card_deck() from public, anon;
revoke all on function public.homeos_can_manage_provider_maintenance(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.get_provider_homeos_maintenance(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.save_provider_homeos_maintenance_task(uuid,uuid,uuid,text,integer,text,date,date,uuid,uuid,uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.complete_provider_homeos_maintenance_task(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;

grant execute on function public.get_homeos_starter_card_picker() to authenticated;
grant execute on function public.get_homeos_starter_card_deck() to authenticated;
grant execute on function public.homeos_can_manage_provider_maintenance(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.get_provider_homeos_maintenance(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.save_provider_homeos_maintenance_task(uuid,uuid,uuid,text,integer,text,date,date,uuid,uuid,uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.complete_provider_homeos_maintenance_task(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;

comment on column public.homeos_starter_card_templates.placement_tags is
'Extensible placement/search metadata for location-neutral reusable Deck archetypes. Tags do not install an item or claim its physical location.';
comment on function public.homeos_can_manage_provider_maintenance(uuid,uuid,uuid,uuid,uuid) is
'Assignment-scoped maintenance authorization shared by Sales Tech and ordinary TechOS provider maintenance RPCs; it never grants company-wide client access.';
comment on function public.save_provider_homeos_maintenance_task(uuid,uuid,uuid,text,integer,text,date,date,uuid,uuid,uuid,uuid,text,text,text,text) is
'Creates or updates one HomeOS maintenance reminder for an assigned provider context with retry-safe deduplication and an audit event.';
comment on function public.complete_provider_homeos_maintenance_task(uuid,uuid,uuid,uuid,uuid,uuid,uuid) is
'Records an idempotent same-day maintenance completion for an assigned provider context, advances the due date, and writes an audit event.';

commit;
