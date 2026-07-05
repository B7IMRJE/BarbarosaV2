# BravoOS Constitution

## Purpose

This constitution records the operating rules for BravoOS and Bravo Core so future work can resume without re-deciding the architecture.

## Principle 1: The App Must Work

The business comes first.

BravoOS should prioritize working product surfaces, testing, promotion, and revenue. Architecture is only useful when it helps the app become more reliable, more understandable, or easier to grow.

## Principle 2: One Source Of Truth

Every important service concept should have one canonical source.

The same service should not be invented separately across pricing, estimating, checklists, homeowner education, AI prompts, and reporting. Bravo Core should own the service meaning. Views should consume that meaning.

## Principle 3: Knowledge Is Not A View

Knowledge Objects describe the business.

Views display or use Knowledge Objects for a specific job:

- Price Book prices and reviews services.
- Estimate Builder creates proposal line items.
- TechOS turns knowledge into field execution steps.
- HomeOS turns knowledge into homeowner-friendly context.
- AI turns knowledge into safer assistance.
- Reporting turns knowledge into operational visibility.

A view can format, filter, summarize, or request approval. It should not silently fork the object.

## Principle 4: Draft Knowledge Is Not Approved Pricing

BKE may contain nullable pricing fields, estimates, scope language, and context.

Draft BKE objects must not become approved company Price Book rows automatically. Pricing needs company review, margin logic, market context, and explicit approval.

No fake prices should be added to make a screen look complete.

## Principle 5: Module-First Beats Sprawl

Build one module deeply enough to prove the model before expanding every module shallowly.

Current module-first path:

1. Water Heaters.
2. Object Types.
3. Water Heaters completion and review.
4. Next module only after the pattern is stable.

## Principle 6: Read-Only Before Mutation

New source-of-truth systems should be reviewable before they are editable or connected to live workflows.

The BKE viewer exists for this reason. It lets the team inspect objects before wiring them into Price Book, Estimate Builder, TechOS, HomeOS, AI, or reporting.

## Principle 7: Integration Must Be Explicit

Do not wire BKE into other systems casually.

Each integration should state:

- what reads BKE
- what writes back, if anything
- what remains company-specific
- what approval is required
- what happens when object versions change

## Principle 8: AI Uses Context, Not Authority

AI can help draft, explain, compare, and review.

AI should not be treated as the authority for:

- approved pricing
- code compliance
- safety decisions
- warranty commitments
- final customer scope

BKE can give AI better context, but human review remains required.

## Principle 9: Stable Keys Matter

Stable identifiers make the system durable.

`price_key` and future object identifiers should not change casually once used by pricing, estimates, checklists, history, or reports. If meaning changes substantially, create a new object or deprecate the old one.

## Principle 10: Safe Return Points Are Part Of The System

When deep architecture work pauses, leave a clear return point.

Each safe return point should state:

- what exists
- what is intentionally not wired
- what comes next
- what should not be touched yet
- what business priority should take over when needed
