# Bravo Knowledge Engine Blueprint

## Purpose

Bravo Knowledge Engine (BKE) is the foundation for operational knowledge across BravoOS, ManagementOS, TechOS, and HomeOS.

BKE is intended to become the source of truth for:

- Price Book
- Estimate Builder
- TechOS checklists
- HomeOS knowledge
- AI context
- Training
- Reporting

This foundation does not replace the current Price Book yet. It creates a typed source layer that can be reviewed, expanded, and later connected to existing workflows.

## Architecture

A Knowledge Object contains:

- Identity
- Navigation
- Pricing
- Estimate context
- Technician requirements
- Homeowner knowledge
- AI context
- Training
- Reporting metadata

The first implementation keeps these fields flat in TypeScript so they are easy to map into existing app surfaces, while the blueprint groups them conceptually.

## Knowledge Object Field Contract

Each object includes:

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
- `training_notes`
- `reporting_tags`
- `active`

## v1 Module Scope

Project 1000 starts with Water Heaters only.

Included water heater knowledge objects:

- Standard tank water heater replacement
- Tankless water heater replacement
- Water heater diagnostic
- Water heater flush
- Expansion tank install
- T&P valve replacement
- Drain valve replacement
- Water heater supply line replacement
- Water heater gas connection
- Water heater code correction

## Pricing Policy

BKE must not invent prices.

The following fields are nullable and remain `null` until pricing is approved through company or operations review:

- `base_price`
- `labor_hours`
- `material_cost`
- `linear_foot_price`
- `minimum_price`
- `maximum_discount_percent`
- `package_discount_percent`

## Status And Confidence

Status values:

- `draft`
- `testing`
- `approved`
- `deprecated`
- `archived`

Confidence level:

- `1` means minimal operational confidence.
- `3` means usable draft structure needing review.
- `5` means reviewed and trusted as a standard operating reference.

Initial Water Heater objects are `draft` with confidence level `3`.

## Integration Plan

1. Keep BKE read-only and disconnected from the live Price Book.
2. Review Water Heater object content with operations and field leadership.
3. Add preview tools for Estimate Builder and TechOS checklist output.
4. Map approved objects to company Price Book rows by stable `price_key`.
5. Let TechOS consume required photos, measurements, tests, documents, safety notes, and tools.
6. Let HomeOS consume homeowner-safe descriptions and warranty/history context.
7. Let AI assistance consume `ai_context`, scope boundaries, add-ons, related services, and training notes without inventing pricing.
8. Add reporting rollups by `reporting_tags`.

## Guardrails

- Do not auto-apply BKE data to company Price Books.
- Do not auto-create estimates from draft objects.
- Do not use AI-generated prices as approved prices.
- Keep `price_key` stable once an object is approved.
- Deprecate or archive old objects instead of mutating their historical meaning.

## Source Files

- `src/lib/bravoKnowledgeEngine.ts`
- `src/lib/knowledgeModules/waterHeaters.ts`
