begin;

alter table public.company_user_invitations
    add column if not exists login_code_used_at timestamptz null;

create table if not exists public.invitation_login_attempts (
    id bigint generated always as identity primary key,
    invitation_id uuid null references public.company_user_invitations(id) on delete cascade,
    ip_hash text not null,
    code_hash text not null,
    succeeded boolean not null default false,
    outcome text not null,
    created_at timestamptz not null default now(),
    constraint invitation_login_attempts_outcome_check
        check (outcome in ('invalid', 'expired', 'locked', 'verified', 'auth_failed'))
);

create index if not exists invitation_login_attempts_ip_recent_idx
    on public.invitation_login_attempts (ip_hash, created_at desc);

create index if not exists invitation_login_attempts_code_recent_idx
    on public.invitation_login_attempts (code_hash, created_at desc);

alter table public.invitation_login_attempts enable row level security;

revoke all on table public.invitation_login_attempts from public;
revoke all on table public.invitation_login_attempts from anon;
revoke all on table public.invitation_login_attempts from authenticated;

comment on table public.invitation_login_attempts is
    'Service-role-only security log and throttle source for public invitation login code exchange.';

comment on column public.company_user_invitations.login_code_used_at is
    'Set after the one-time Supabase invitation OTP successfully creates a session.';

commit;
