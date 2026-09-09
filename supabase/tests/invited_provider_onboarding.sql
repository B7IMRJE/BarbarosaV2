-- Run inside BEGIN / ROLLBACK. No real invitation, home, or notification is created.
do $$
declare
    homeowner uuid := gen_random_uuid();
    stranger uuid := gen_random_uuid();
    provider uuid; another_provider uuid;
    invited_email text := 'invite-onboarding-' || homeowner::text || '@example.invalid';
    invitation public.company_customer_invitations%rowtype;
    home record; receipt record; repeat_receipt record;
    other_home uuid; denied boolean;
    home_input jsonb := jsonb_build_object(
        'p_name','Automatic invitation test', 'p_address_line_1','100 Test Street',
        'p_city','Riverside','p_state','CA','p_postal_code','92501','p_country_code','US',
        'p_formatted_address','100 Test Street, Riverside, CA 92501',
        'p_latitude',33.98,'p_longitude',-117.37,
        'p_google_place_id','test-invite-' || homeowner::text,'p_property_type','HOUSE'
    );
begin
    insert into auth.users(id,email,email_confirmed_at) values
        (homeowner,invited_email,now()),(stranger,'stranger-' || stranger::text || '@example.invalid',now());
    insert into public.profiles(id,email,role) values (homeowner,invited_email,'HOMEOWNER')
        on conflict(id) do update set role='HOMEOWNER';
    insert into public.companies(name,status,service_categories) values
        ('Inviting company test - rolled back','active',array['Plumbing']) returning id into provider;
    insert into public.companies(name,status,service_categories) values
        ('Other company test - rolled back','active',array['Plumbing']) returning id into another_provider;
    insert into public.company_customer_invitations(company_id,invited_email)
        values(provider,invited_email) returning * into invitation;
    perform set_config('request.jwt.claim.sub',homeowner::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',homeowner,'email',invited_email,'role','authenticated')::text,true);

    -- An unusable invitation must not leave behind a newly created home.
    denied := false;
    begin
        perform public.create_invited_homeowner_first_property(home_input, 'invalid-test-code');
    exception when others then denied := sqlerrm like '%Customer invite not found%'; end;
    if not denied or exists(select 1 from public.properties where owner_id=homeowner) then
        raise exception 'Failed invitation left a home behind or was not rejected.';
    end if;

    execute 'set local role authenticated';
    select * into home from public.create_invited_homeowner_first_property(home_input,invitation.invite_code);
    select * into receipt from public.accept_customer_invite_by_code(invitation.invite_code,home.property_id);
    select * into repeat_receipt from public.create_invited_homeowner_first_property(home_input,invitation.invite_code);
    execute 'reset role';
    if receipt.company_id<>provider or receipt.property_id<>home.property_id
       or repeat_receipt.property_id<>home.property_id or repeat_receipt.created then
        raise exception 'Invitation retry changed the home or inviting company.';
    end if;
    if (select count(*) from public.properties where owner_id=homeowner)<>1
       or (select count(*) from public.company_property_clients where property_id=home.property_id and company_id=provider and status='active')<>1
       or (select count(*) from public.property_preferred_providers where property_id=home.property_id and company_id=provider and status='active')<>1
       or not exists(select 1 from public.company_customer_invitations where id=invitation.id and status='accepted' and accepted_by_user_id=homeowner and accepted_property_id=home.property_id) then
        raise exception 'Home and its invited provider were not saved together exactly once.';
    end if;
    if not exists(select 1 from public.get_homeowner_connection_providers(home.property_id) where id=provider) then
        raise exception 'Invited provider is not visible to the homeowner.';
    end if;
    if exists(select 1 from public.company_property_clients where property_id=home.property_id and company_id=another_provider) then
        raise exception 'An unrelated company was connected.';
    end if;

    -- Reusing a used invitation for a different home must not transfer it.
    insert into public.properties(name,owner_id) values('Other test home',homeowner) returning id into other_home;
    insert into public.property_memberships(property_id,user_id,role,status) values(other_home,homeowner,'OWNER','active');
    denied := false;
    begin perform public.accept_customer_invite_by_code(invitation.invite_code,other_home);
    exception when others then denied := sqlerrm like '%already used%'; end;
    if not denied then raise exception 'Accepted invitation moved to another home.'; end if;

    perform set_config('request.jwt.claim.sub',stranger::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',stranger,'email','stranger@example.invalid','role','authenticated')::text,true);
    denied := false;
    begin perform public.accept_customer_invite_by_code(invitation.invite_code,home.property_id);
    exception when others then denied := sqlerrm like '%different email%'; end;
    if not denied then raise exception 'Another account reused an accepted invitation.'; end if;

    perform set_config('request.jwt.claim.sub',homeowner::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',homeowner,'email',invited_email,'role','authenticated')::text,true);
    update public.property_connections set status='revoked' where id=receipt.property_connection_id;
    denied := false;
    begin perform public.accept_customer_invite_by_code(invitation.invite_code,home.property_id);
    exception when others then denied := sqlerrm like '%no longer active%'; end;
    if not denied or exists(select 1 from public.property_connections where id=receipt.property_connection_id and status='connected') then
        raise exception 'Retry restored a revoked relationship.';
    end if;

    insert into public.company_customer_invitations(company_id,invited_email,expires_at)
        values(another_provider,invited_email,now()-interval '1 minute') returning * into invitation;
    denied := false;
    begin perform public.accept_customer_invite_by_code(invitation.invite_code,other_home);
    exception when others then denied := sqlerrm like '%not active%'; end;
    if not denied then raise exception 'Expired invitation was accepted.'; end if;
    if has_function_privilege('anon','public.create_invited_homeowner_first_property(jsonb,text)','execute')
       or has_function_privilege('anon','public.accept_customer_invite_by_code(text,uuid)','execute') then
        raise exception 'Anonymous users can connect homes to providers.';
    end if;
end $$;
select 'PASS: atomic invited home, exact provider, safe retries, wrong-home/account denial, revoked and expired denial' as result;
