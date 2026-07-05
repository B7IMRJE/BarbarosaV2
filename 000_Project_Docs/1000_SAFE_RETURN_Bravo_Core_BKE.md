# Safe Return Point: Bravo Core / BKE

## Why This Exists

Bravo Core and the Bravo Knowledge Engine are important, but they should not consume attention when the business needs working app progress, testing, promotion, and revenue.

This document is the return point. It lets the team pause deep architecture work without losing the model.

## Current State

### BKE Foundation

- Project 1000 BKE foundation exists.
- `src/lib/bravoKnowledgeEngine.ts` defines the Knowledge Object type and helper functions.
- BKE is a typed source layer, not a replacement for the current Price Book.

### Water Heaters Module

- Project 1001 Water Heaters v1.1 exists.
- Water Heaters has 52 Knowledge Objects.
- Pricing fields remain nullable.
- No fake pricing is assigned.
- The module is still a draft/testing knowledge source, not approved operating truth.

### BKE Viewer

- A read-only Knowledge Object Viewer exists in ManagementOS.
- The viewer is for inspection and review.
- It does not edit objects.
- It does not write to Price Book.
- It does not apply BKE data to estimates, TechOS, HomeOS, AI, or reporting.

### Price Book

- The current Price Book plumbing catalog exists.
- It supports Systems -> Areas -> Item/Service cards.
- Company price rows remain separate from BKE.
- BKE should not replace or overwrite Price Book behavior yet.

## Core Architecture To Preserve

### One Source Of Truth

Bravo Core should become the canonical source for service meaning.

Price Book, Estimate Builder, TechOS, HomeOS, AI, training, and reporting should eventually read from the same service knowledge instead of each inventing their own version.

### Knowledge Vs View

Knowledge Objects are the source.

Views are workflow surfaces:

- Price Book is a pricing view.
- Estimate Builder is a proposal view.
- TechOS is an execution view.
- HomeOS is a homeowner knowledge view.
- AI is an assistance view.
- Reporting is an analytics view.

Do not duplicate BKE data into a view as a second source of truth.

### Module-First Development

Do not expand every trade module deeply at once.

Water Heaters is the proof module. Finish the structure and review pattern there before moving deeply into Toilets, Kitchen, Bathroom, Drain / Sewer, Gas, Water Quality, Diagnostics, or Emergency.

## What Not To Do Yet

- Do not wire BKE into Price Book.
- Do not auto-create company price rows from BKE.
- Do not auto-apply BKE service scope into estimates.
- Do not push BKE checklists into TechOS.
- Do not expose draft BKE objects directly to homeowners.
- Do not let AI treat draft BKE as approved authority.
- Do not add fake pricing to make BKE look complete.
- Do not run SQL for BKE until the object model and integration plan are reviewed.

## Next Return Task

### Project 1000.1: Object Types

Resume here before more deep expansion.

Project 1000.1 should define the object type model for Bravo Core.

The key question:

What kinds of objects does Bravo Core need, and how should each kind behave across Price Book, estimates, TechOS, HomeOS, AI, training, and reporting?

Expected output:

- Object Types blueprint document.
- Type list and definitions.
- Shared fields vs type-specific fields.
- Rules for which object types can become Price Book items.
- Rules for which object types can appear in estimates.
- Rules for which object types drive TechOS checklist requirements.
- Rules for which object types are homeowner-visible.
- Rules for which object types AI can consume.

No app behavior needs to change for Project 1000.1 unless explicitly requested later.

## Then Finish Water Heaters

After Project 1000.1:

1. Apply object types to the 52 Water Heater objects.
2. Split service, diagnostic, inspection, package, permit, part, and checklist concepts where needed.
3. Tighten object names and stable keys.
4. Review status and confidence.
5. Fill missing Water Heater objects only after type boundaries are clear.
6. Keep pricing nullable until reviewed and approved.
7. Keep the viewer read-only until edit/review workflows are intentionally designed.

## Business Priority Reminder

Pause BKE when needed.

Priority order when attention is limited:

1. Working app.
2. Testing.
3. Promotion.
4. Revenue.
5. Deep BKE expansion.

The architecture is preserved here. It is safe to return later.

## Files To Reopen On Return

- `000_Project_Docs/0000_Bravo_Vision.md`
- `000_Project_Docs/0001_BravoOS_Constitution.md`
- `000_Project_Docs/0002_BravoOS_Roadmap.md`
- `000_Project_Docs/0003_BravoOS_Glossary.md`
- `000_Project_Docs/1000_Bravo_Knowledge_Engine_Blueprint.md`
- `000_Project_Docs/1001_BKE_Water_Heaters_Module_V1.md`
- `src/lib/bravoKnowledgeEngine.ts`
- `src/lib/knowledgeModules/waterHeaters.ts`
- `src/app/super-admin/company/[id]/knowledge-engine.tsx`
