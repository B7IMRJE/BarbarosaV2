begin;

update public.company_customer_invitations invitation
set invite_code = replace(gen_random_uuid()::text, '-', '') || substr(md5(random()::text), 1, 8),
    updated_at = now()
where lower(btrim(coalesce(invitation.status, ''))) = 'pending'
  and invitation.revoked_at is null
  and nullif(btrim(coalesce(invitation.invite_code, '')), '') is null;

commit;
