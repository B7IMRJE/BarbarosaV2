-- Run after the outdoor catalog migration. Read-only assertions, rolled back.
begin;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.homeos_starter_card_templates WHERE template_key LIKE 'exterior:%' AND presentation_role = 'container' AND NOT auto_provision AND parent_template_key IS NULL AND active) <> 15 THEN
    RAISE EXCEPTION 'Expected fifteen optional outdoor root cards';
  END IF;
  IF (SELECT count(*) FROM public.homeos_starter_card_templates WHERE template_key IN ('exterior:vacuum_breaker','exterior:hose_bibb_with_vacuum_breaker')) <> 2 THEN
    RAISE EXCEPTION 'Standalone vacuum breaker and combined faucet must be distinct';
  END IF;
  IF EXISTS (SELECT 1 FROM public.homeos_starter_card_templates WHERE template_key LIKE 'exterior:%' AND (name ILIKE '%main water%' OR name ILIKE '%water main%')) THEN
    RAISE EXCEPTION 'Must not create a second or physically assumed main water shutoff';
  END IF;
  IF EXISTS (SELECT 1 FROM public.homeos_starter_card_templates t LEFT JOIN public.catalog_card_short_codes c ON c.entity_kind='starter_template' AND c.entity_key=t.template_key WHERE t.template_key LIKE 'exterior:%' AND c.short_code IS NULL) THEN
    RAISE EXCEPTION 'Every added card needs its permanent catalog code';
  END IF;
END;
$$;
select template_key, name, system, category, aliases, room_kind, placement_tags, parent_template_key, presentation_role, auto_provision, trade_key, display_order from public.homeos_starter_card_templates where template_key like 'exterior:%' or template_key='garage:whole_home_filter' order by display_order;
rollback;
