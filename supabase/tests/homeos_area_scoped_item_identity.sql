-- Read-only regression checks for 20260817190000_homeos_area_scoped_item_identity.sql.

do $$
declare
    v_provisioner text;
    v_provider_publisher text;
    v_identity_index text;
    v_slug_index text;
begin
    if to_regclass('public.home_items_property_id_item_slug_key') is not null then
        raise exception 'The obsolete property-wide HomeOS slug uniqueness index is still installed.';
    end if;

    select pg_get_indexdef(index_class.oid)
    into v_identity_index
    from pg_class index_class
    where index_class.oid = to_regclass('public.home_items_property_placement_identity_key');

    select pg_get_indexdef(index_class.oid)
    into v_slug_index
    from pg_class index_class
    where index_class.oid = to_regclass('public.home_items_property_placement_slug_key');

    if v_identity_index is null
       or v_identity_index !~* 'homeos_item_placement_identity'
       or v_identity_index !~* 'archived' then
        raise exception 'Active HomeOS cards are not protected by placement-scoped natural identity.';
    end if;

    if v_slug_index is null
       or v_slug_index !~* 'location'
       or v_slug_index !~* 'parent_area' then
        raise exception 'HomeOS slug uniqueness is not scoped to area/container placement, including null placement handling.';
    end if;

    select pg_get_functiondef('public.provision_complete_room_starter_cards(uuid)'::regprocedure)
    into v_provisioner;
    select pg_get_functiondef('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure)
    into v_provider_publisher;

    if v_provisioner !~* 'for update'
       or v_provisioner !~* 'pg_advisory_xact_lock'
       or v_provisioner !~* 'on conflict do nothing'
       or v_provisioner !~* 'starter_template_key' then
        raise exception 'Starter provisioning is not retry/concurrency safe or does not retain canonical archetype identity.';
    end if;

    if v_provider_publisher !~* 'pg_advisory_xact_lock'
       or v_provider_publisher !~* 'homeos_item_placement_identity' then
        raise exception 'Assigned provider item publication is not serialized by placement.';
    end if;
end;
$$;
