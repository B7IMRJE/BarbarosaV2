-- Configure the requested contractual 30-calendar-day cancellation policy.
-- This is labeled as a company policy, not as a universal statutory period.

begin;

insert into public.company_contract_rules (
    company_id,
    jurisdiction_label,
    cancellation_days,
    cancellation_notice_title,
    cancellation_notice_text,
    requires_homeowner_acknowledgment
)
select
    company.id,
    'Company contractual policy',
    30,
    'Company 30-Day Cancellation Policy',
    'You may cancel the selected work by notifying the company in writing within 30 calendar days after signing this notice. Keep a copy of your notice and proof of delivery. If you separately request that work begin before the 30-day period ends, work already performed and special-order materials may be handled according to the signed agreement and applicable law.',
    true
from public.companies company
on conflict (company_id) do update
set jurisdiction_label = excluded.jurisdiction_label,
    cancellation_days = excluded.cancellation_days,
    cancellation_notice_title = excluded.cancellation_notice_title,
    cancellation_notice_text = excluded.cancellation_notice_text,
    requires_homeowner_acknowledgment = true,
    updated_at = now();

alter table public.company_contract_rules
    alter column cancellation_days set default 30,
    alter column jurisdiction_label set default 'Company contractual policy',
    alter column cancellation_notice_title set default 'Company 30-Day Cancellation Policy',
    alter column cancellation_notice_text set default 'You may cancel the selected work by notifying the company in writing within 30 calendar days after signing this notice. Keep a copy of your notice and proof of delivery. If you separately request that work begin before the 30-day period ends, work already performed and special-order materials may be handled according to the signed agreement and applicable law.';

commit;
