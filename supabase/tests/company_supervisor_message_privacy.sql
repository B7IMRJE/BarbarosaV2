-- Run with BEGIN/ROLLBACK. Synthetic users and messages are never committed.
do $$
declare c uuid; r uuid; other_c uuid; property uuid; homeowner uuid;
 manager_user uuid:=gen_random_uuid(); field_user uuid:=gen_random_uuid(); office_user uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 invitation public.company_user_invitations%rowtype; invite_user uuid:=gen_random_uuid(); accepted_member public.company_users%rowtype;
 owner_user uuid:=gen_random_uuid(); gm_invite_user uuid:=gen_random_uuid(); gm_invite public.company_user_invitations%rowtype;
 manager_member uuid; field_member uuid; office_member uuid; ticket uuid; denied boolean; data jsonb; message_count integer;
begin
 select s.company_id,s.id,s.property_id,p.owner_id into c,r,property,homeowner from public.service_requests s join public.properties p on p.id=s.property_id where s.company_id is not null and p.owner_id is not null limit 1;
 if r is null then raise exception 'A service request fixture is required.'; end if;
 insert into public.companies(name,status) values('Message privacy test — rolled back','active') returning id into other_c;
 insert into auth.users(id,email,email_confirmed_at) values
 (manager_user,'message-manager-'||manager_user||'@example.invalid',now()),
 (field_user,'message-field-'||field_user||'@example.invalid',now()),
 (office_user,'message-office-'||office_user||'@example.invalid',now()),
 (outsider,'message-outsider-'||outsider||'@example.invalid',now());
 insert into public.company_users(company_id,auth_user_id,full_name,role,status) values(c,manager_user,'Test manager','manager','active') returning id into manager_member;
 insert into public.company_users(company_id,auth_user_id,full_name,role,status,permissions) values(c,field_user,'Test field','field_supervisor','active','{"can_manage_company_users":true,"can_dispatch":true,"can_access_management":true,"can_manage_catalog":true}') returning id into field_member;
 insert into public.company_users(company_id,auth_user_id,full_name,role,status) values(c,office_user,'Test office','office_supervisor','active') returning id into office_member;
 insert into public.company_users(company_id,auth_user_id,full_name,role,status) values(other_c,outsider,'Other company manager','manager','active');
 perform set_config('request.jwt.claim.sub',field_user::text,true);
 if public.can_dispatch_company(c) or public.can_manage_company_users(c) or public.company_operations_can_manage(c) or public.company_product_catalog_can_manage(c) or public.company_user_has_permission(c,'can_access_management') then raise exception 'Field supervisor has office/admin access.'; end if;
 if public.service_request_dispatch_chat_can_access(c,r) then raise exception 'Uninvited field supervisor can access a job.'; end if;
 denied:=false;
 begin perform public.set_company_member_permissions(office_member,'{"can_manage_company_users":true}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Field supervisor changed permissions.'; end if;
 perform set_config('request.jwt.claim.sub',office_user::text,true);
 if not public.can_dispatch_company(c) or public.can_manage_company_users(c) then raise exception 'Office supervisor permissions incorrect.'; end if;
 insert into auth.users(id,email,email_confirmed_at) values(owner_user,'message-owner-'||owner_user||'@example.invalid',now()),(gm_invite_user,'message-gm-'||gm_invite_user||'@example.invalid',now());
 insert into public.company_users(company_id,auth_user_id,full_name,role,status) values(c,owner_user,'Test company owner','owner','active');
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 denied:=false;
 begin perform public.create_company_invitation_with_access(c,'message-gm-'||gm_invite_user||'@example.invalid','Test GM','manager','{}'); exception when others then denied:=sqlerrm like '%Only the company owner%'; end;
 if not denied then raise exception 'Non-owner created General Manager invitation.'; end if;
 denied:=false;
 begin perform public.update_company_user_role(office_member,'manager'); exception when others then denied:=sqlerrm like '%Only the company owner%'; end;
 if not denied then raise exception 'Non-owner promoted a General Manager.'; end if;
 denied:=false;
 begin perform public.set_company_role_permission_profile(c,'manager','{}'); exception when others then denied:=sqlerrm like '%Only the company owner%'; end;
 if not denied then raise exception 'Non-owner changed General Manager profile.'; end if;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 perform public.update_company_user_role(office_member,'manager');
 perform public.update_company_user_role(office_member,'office_supervisor');
 gm_invite:=public.create_company_invitation_with_access(c,'message-gm-'||gm_invite_user||'@example.invalid','Test GM','manager','{"can_manage_price_book":false}');
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 denied:=false;
 begin perform public.set_company_invitation_access(gm_invite.id,'manager','{}'); exception when others then denied:=sqlerrm like '%Only the company owner%'; end;
 if not denied then raise exception 'Non-owner edited General Manager invitation.'; end if;
 perform set_config('request.jwt.claim.sub',gm_invite_user::text,true);
 accepted_member:=public.accept_company_user_invitation(gm_invite.id);
 if accepted_member.role<>'manager' or public.company_user_has_permission(c,'can_manage_price_book') then raise exception 'Owner-approved General Manager acceptance failed.'; end if;
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 if not public.can_manage_company_users(c) then raise exception 'General manager cannot manage users.'; end if;
 insert into auth.users(id,email,email_confirmed_at) values(invite_user,'message-invite-'||invite_user||'@example.invalid',now());
 invitation:=public.create_company_invitation_with_access(c,'message-invite-'||invite_user||'@example.invalid','Invited office test','office_supervisor','{"can_dispatch":false,"can_view_all_job_messages":false}');
 perform set_config('request.jwt.claim.sub',invite_user::text,true);
 accepted_member:=public.accept_company_user_invitation(invitation.id);
 if public.can_dispatch_company(c) or public.company_user_has_permission(c,'can_view_all_job_messages') then raise exception 'Invitation acceptance lost overrides.'; end if;
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 ticket:=public.request_job_supervisor(c,r,field_member,'Synthetic private supervisor question');
 if public.request_job_supervisor(c,r,field_member,'Repeat tap')<>ticket then raise exception 'Duplicate help request was created.'; end if;
 perform set_config('request.jwt.claim.sub',field_user::text,true);
 if not public.service_request_dispatch_chat_can_access(c,r) then raise exception 'Invited field supervisor cannot read job.'; end if;
 perform public.send_service_request_dispatch_chat_message(c,r,'PRIVATE TEST — never homeowner visible');
 perform public.get_job_message_directory(c,false,'',0);
 perform public.get_job_message_context(c,r);
 perform public.get_job_supervisor_requests(c,r);
 perform public.update_job_supervisor_request(ticket,'acknowledged');
 perform public.mark_service_request_dispatch_chat_read(c,r);
 perform public.mark_job_customer_messages_read(c,r);
 insert into public.service_request_events(company_id,service_request_id,property_id,event_type,message,event_visibility,metadata)
 values(c,r,property,'communication_message','PRIVATE EVENT TEST','internal','{"thread_kind":"customer_communication"}');
 if exists(select 1 from public.get_service_request_communication_thread(c,r) e where e.message='PRIVATE EVENT TEST') then raise exception 'Internal event leaked through customer API.'; end if;
 if exists(select 1 from public.get_service_request_communication_thread(c,r) e where e.message='PRIVATE TEST — never homeowner visible') then raise exception 'Internal message leaked through customer API.'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 if public.service_request_dispatch_chat_can_access(c,r) then raise exception 'Cross-company message access.'; end if;
 denied:=false;
 begin perform public.get_service_request_dispatch_chat_messages(c,r); exception when others then denied:=true; end;
 if not denied then raise exception 'Cross-company RPC returned messages.'; end if;
 execute 'set local role authenticated';
 select count(*) into message_count from public.service_request_dispatch_messages where company_id=c and service_request_id=r;
 execute 'reset role';
 if message_count<>0 then raise exception 'Cross-company direct RLS returned messages.'; end if;
 if homeowner is not null then
 perform set_config('request.jwt.claim.sub',homeowner::text,true);
 -- Only test an actual homeowner who is not simultaneously authorized company staff.
 if not exists(select 1 from public.company_users u where u.company_id=c and u.auth_user_id=homeowner and u.status='active') then
 if public.service_request_dispatch_chat_can_access(c,r) then raise exception 'Homeowner can access internal messages.'; end if;
 execute 'set local role authenticated';
 select count(*) into message_count from public.service_request_dispatch_messages where company_id=c and service_request_id=r;
 execute 'reset role';
 if message_count<>0 then raise exception 'Homeowner direct table access leaked internal messages.'; end if;
 end if;
 end if;
 update public.company_users set status='inactive' where id=field_member;
 perform set_config('request.jwt.claim.sub',field_user::text,true);
 if public.service_request_dispatch_chat_can_access(c,r) then raise exception 'Departed staff retains access.'; end if;
 if not exists(select 1 from public.service_request_dispatch_messages where sender_user_id=field_user and message='PRIVATE TEST — never homeowner visible') then raise exception 'Deactivation erased history.'; end if;
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 perform public.set_company_member_permissions(office_member,'{"can_dispatch":false}');
 perform set_config('request.jwt.claim.sub',office_user::text,true);
 if public.can_dispatch_company(c) or public.can_manage_company_schedule(c) then raise exception 'Per-person dispatch removal was ignored.'; end if;
end $$;
select 'PASS: owner-only General Manager, role limits, overrides, private message RLS, cross-company denial, targeted help, history retention' as result;
