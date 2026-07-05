# Project 1001: BKE Water Heaters Module v1.1

## Purpose

Project 1001 expands the Bravo Knowledge Engine Water Heaters module from the Project 1000 foundation into a deeper operating catalog for water heater work.

The module is intended to support future Price Book, Estimate Builder, TechOS checklist, HomeOS knowledge, AI context, training, warranty, and reporting workflows. This project does not wire the module into the live Price Book.

## Scope

Project 1001 keeps the original 10 Project 1000 Water Heater knowledge objects and adds focused coverage for tank replacements, tankless service, gas and venting corrections, expansion tank work, diagnostics, accessories, permit coordination, and code upgrade packages.

Final module count:

- 10 Project 1000 foundation objects
- 42 Project 1001 added objects
- 52 Water Heater knowledge objects total

The requested service list overlaps one existing object: `Drain valve replacement` already exists in Project 1000 and remains the canonical object for that scope.

## Object Standards

Every Water Heater knowledge object includes the BKE field contract:

- identity, version, status, and confidence
- navigation fields
- nullable pricing fields
- estimate descriptions
- included and excluded scope
- common add-ons and recommended upgrades
- technician photo, measurement, test, and document requirements
- warranty, permit, code, and safety guidance
- tools, related services, estimate template, AI context, training notes, reporting tags, and active state

## Pricing Policy

Project 1001 does not invent prices.

The following fields remain `null` until pricing is approved through the company or operations process:

- `base_price`
- `labor_hours`
- `material_cost`
- `linear_foot_price`
- `minimum_price`
- `maximum_discount_percent`
- `package_discount_percent`

## Status And Confidence

The module version is `1.1`.

Status values remain:

- `draft`
- `testing`
- `approved`
- `deprecated`
- `archived`

Common, well-understood service scopes may use `testing` with confidence level `4`. Draft or less standardized scopes remain `draft` with confidence level `3`.

No object is marked `approved` in this project.

## Coverage Added

Project 1001 adds coverage for:

- Gas tank water heater replacements by common gallon size
- Electric tank and mobile home water heater replacement
- Power vent and direct vent replacements
- Customer supplied water heater installation
- Permit coordination and haul-away
- Pan, pan drain, and seismic restraint work
- Gas flex, sediment trap, venting, and combustion air corrections
- Water heater shutoff and connector corrections
- Recirculation pump install and replacement
- Tankless flush/descale, isolation valves, condensate neutralizer service, vent corrections, gas sizing review, and error code diagnostics
- Expansion tank replacement and pressure adjustment
- T&P discharge line correction
- Anode rod, pilot assembly, thermocouple, gas control valve, burner, electric element, and thermostat work
- Leak assessment and no hot water diagnostics
- Water heater code upgrade package

## Guardrails

- Do not replace or modify the current live Price Book from this module.
- Do not auto-create company price book rows from draft BKE objects.
- Do not use AI-generated prices as approved prices.
- Keep `price_key` stable once an object is approved.
- Deprecate or archive historical objects instead of mutating their meaning after approval.
- Keep gas, venting, combustion, and electrical safety boundaries visible in customer and technician context.

## Source Files

- `src/lib/bravoKnowledgeEngine.ts`
- `src/lib/knowledgeModules/waterHeaters.ts`
