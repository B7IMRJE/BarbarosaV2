# Bravo Vision

## Mission

BravoOS exists to help home service companies run cleaner, faster, and more trustworthy operations while giving homeowners a clearer record of what is happening in their home.

The long-term vision is one operating system for the full loop:

- company operations
- estimating and pricing
- technician execution
- homeowner knowledge
- maintenance history
- training
- reporting
- AI assistance

The system should feel useful before it feels ambitious. A working app, real customers, tested workflows, promotion, and revenue are the business priority. Deep architecture should support that priority, not distract from it.

## One Source Of Truth

BravoOS should avoid scattering the meaning of the business across disconnected screens.

The same service should not be separately invented in Price Book, Estimate Builder, TechOS, HomeOS, reporting, training, and AI prompts. Those surfaces should eventually read from one canonical knowledge layer.

That canonical layer is Bravo Core, implemented first as the Bravo Knowledge Engine.

## Bravo Core And BKE

Bravo Core is the durable operating knowledge of the business.

Bravo Knowledge Engine (BKE) is the first typed implementation of Bravo Core. It describes real services as Knowledge Objects with:

- identity
- navigation
- pricing fields
- estimate context
- technician requirements
- homeowner-safe knowledge
- AI context
- training notes
- reporting metadata

BKE is not a screen. It is not the Price Book. It is not an AI feature. It is the source layer those experiences can later consume.

## Knowledge Vs View Rule

Knowledge is the canonical object.

Views are ways to inspect, edit, quote, execute, explain, or report on that knowledge.

Examples:

- Price Book is a pricing and company-specific review view.
- Estimate Builder is a quoting view.
- TechOS is an execution and checklist view.
- HomeOS is a homeowner explanation and history view.
- AI assistance is a reasoning and drafting view.
- Reporting is an analytics view.

Do not duplicate BKE data into a view just because the view needs a different layout. The view should transform or filter the object, not become a second source of truth.

## Module-First Development

Bravo Core should be built module by module.

Finish enough of one module to prove the pattern before expanding too broadly. Water Heaters is the current test module. It should teach the object shape, object type model, review workflow, and eventual integrations before Toilets, Kitchen, Bathroom, Drain / Sewer, Gas, Water Quality, Diagnostics, and Emergency are expanded deeply.

## Current State

- BKE foundation exists.
- Water Heaters module exists with 52 Knowledge Objects.
- BKE viewer exists inside ManagementOS for read-only review.
- Price Book plumbing catalog exists separately.
- BKE is not wired into Price Book yet.
- No BKE data should be auto-applied to company pricing.

## Business Priority

Pause deep BKE expansion whenever needed to focus on:

- a working app
- customer testing
- field workflow testing
- promotion
- revenue

The architecture is valuable because it can be returned to safely. It should not block practical product progress.
