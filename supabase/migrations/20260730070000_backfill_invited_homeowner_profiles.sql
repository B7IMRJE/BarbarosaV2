begin;

insert into public.profiles (
    id,
    email,
    role
)
select
    auth_user.id,
    lower(auth_user.email),
    'HOMEOWNER'
from auth.users auth_user
left join public.profiles profile
    on profile.id = auth_user.id
where profile.id is null
  and auth_user.email is not null
  and (
      coalesce((auth_user.raw_user_meta_data ->> 'invited_customer')::boolean, false)
      or upper(coalesce(auth_user.raw_user_meta_data ->> 'role', '')) = 'HOMEOWNER'
  )
on conflict (id) do nothing;

commit;
