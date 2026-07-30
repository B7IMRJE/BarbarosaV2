begin;

update public.company_customer_invitations invitation
set invite_code = encode(gen_random_bytes(20), 'hex'),
    updated_at = now()
where lower(btrim(coalesce(invitation.status, ''))) = 'pending'
  and invitation.revoked_at is null
  and nullif(btrim(coalesce(invitation.invite_code, '')), '') is null;

commit;
