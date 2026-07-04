# Bravo Master Plumbing Catalog v1.0 Blueprint

## Purpose

Bravo Master Plumbing Catalog v1.0 is the foundation catalog for residential plumbing services. It is designed to become the source of truth for:

- Price Book
- Estimate Builder
- TechOS checklists
- HomeOS item knowledge
- AI assistance
- Required photos and videos
- Warranty, service history, and reporting

This blueprint and the accompanying TypeScript catalog are a foundation only. They do not replace the current company Price Book workflow yet.

## Current Scope

The first catalog version starts with 25 high-value residential plumbing services:

- Standard tank water heater replacement
- Tankless water heater replacement
- Water heater diagnostic
- Water heater flush
- Expansion tank install
- PRV replacement
- Main water shutoff replacement
- Angle stop replacement
- Kitchen faucet replacement
- Bathroom faucet replacement
- Toilet replacement
- Toilet repair
- Garbage disposal replacement
- Shower cartridge replacement
- Shower valve replacement
- Drain cleaning
- Main line cleanout
- Sewer camera inspection
- P-trap replacement
- Dishwasher connection
- Ice maker line install
- Gas leak diagnostic
- Gas shutoff replacement
- Whole-home filter install
- Plumbing diagnostic

## Catalog Contract

Each catalog item includes these fields:

- `service_id`
- `price_key`
- `version`
- `status`
- `confidence_level`
- `service_name`
- `system`
- `area`
- `equipment`
- `category`
- `service_type`
- `unit`
- `base_price`
- `labor_hours`
- `material_cost`
- `linear_foot_price`
- `minimum_price`
- `maximum_discount_percent`
- `package_discount_percent`
- `customer_description`
- `internal_description`
- `whats_included`
- `whats_not_included`
- `common_add_ons`
- `recommended_upgrades`
- `required_photos`
- `required_videos`
- `required_measurements`
- `required_tests`
- `required_documents`
- `warranty`
- `permit_required`
- `code_notes`
- `safety_notes`
- `recommended_tools`
- `related_services`
- `estimate_template`
- `ai_context`
- `active`

## Versioning

- Catalog version starts at `1.0`.
- Item status values are `draft`, `testing`, `approved`, `deprecated`, and `archived`.
- v1 items start as `draft` until reviewed by operations and field leadership.
- `confidence_level` is a 1-5 operational confidence score, not a price confidence score.

## Pricing Policy

No fake prices are included. If a reliable price is not already known from existing app data or approved company context, pricing fields remain `null`.

These nullable fields are intentionally blank in v1 unless reviewed:

- `base_price`
- `labor_hours`
- `material_cost`
- `linear_foot_price`
- `minimum_price`
- `maximum_discount_percent`
- `package_discount_percent`

## Integration Plan

Future integration should happen in phases:

1. Keep current Price Book stable while the master catalog is reviewed.
2. Add read-only preview tooling for master catalog entries.
3. Map approved master catalog entries to company price book rows by `price_key`.
4. Let Estimate Builder use `estimate_template`, required media, and checklist fields.
5. Let TechOS use `required_photos`, `required_tests`, tools, safety notes, and closeout requirements.
6. Let HomeOS use customer-safe descriptions, warranty notes, and history/reporting fields.
7. Let AI features use `ai_context`, inclusions/exclusions, add-ons, and related services without inventing prices.

## Guardrails

- Do not auto-apply master catalog data to company price books.
- Do not auto-create estimates from draft catalog items.
- Do not use AI-generated pricing as approved pricing.
- Keep `price_key` stable once an item is approved.
- Deprecate or archive old items instead of changing their historical meaning.

## Source File

The TypeScript source for this foundation is:

`src/lib/bravoMasterPlumbingCatalog.ts`
