begin;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'company_job_workflows'
       ) then
        alter publication supabase_realtime add table public.company_job_workflows;
    end if;
end;
$$;

commit;
