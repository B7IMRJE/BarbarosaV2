# BravoOS Roadmap

## North Star

BravoOS becomes a practical operating system for home service companies and homeowners, with Bravo Core as the long-term source of truth for service knowledge.

The roadmap must stay grounded: build useful workflows, test them, promote them, and generate revenue. Deep BKE work resumes when it helps that path.

## Current Completed Foundation

### Price Book

- Plumbing Price Book catalog exists.
- Company price rows can be reviewed and saved separately from the catalog.
- Price research/import review flow exists separately from BKE.
- Price Book should not be replaced by BKE yet.

### Bravo Core / BKE

- BKE foundation exists in TypeScript.
- Knowledge Object field contract exists.
- Water Heaters module exists with 52 objects.
- BKE viewer exists in ManagementOS as a read-only inspection surface.
- BKE is not wired into Price Book, Estimate Builder, TechOS, HomeOS, AI, or reporting yet.

## Immediate Safe Return Task

### Project 1000.1: Object Types

Before finishing or expanding Water Heaters further, define BKE object types.

Questions to answer:

- What object types exist?
- Which fields are shared by all objects?
- Which fields are specific to service, part, inspection, checklist, diagnostic, package, add-on, permit, warranty, or training objects?
- How do object types relate to Price Book items?
- Which object types can appear in estimates?
- Which object types create TechOS tasks or checklist requirements?
- Which object types are homeowner-visible?
- Which object types can AI use as context?

Possible object types:

- service
- diagnostic
- repair
- replacement
- installation
- maintenance
- inspection
- add-on
- package
- permit
- part
- equipment
- checklist
- safety requirement
- warranty
- training note
- reporting tag

Project 1000.1 should create a blueprint first. It should not wire new behavior into the app.

## Next After Object Types

### Finish Water Heaters Module

After object types are defined:

1. Reclassify the 52 Water Heater objects by object type.
2. Review naming, keys, status, confidence, and scope boundaries.
3. Identify missing service objects.
4. Identify package objects separately from individual services.
5. Identify diagnostic and inspection objects separately from repair objects.
6. Confirm homeowner-safe language.
7. Confirm TechOS requirements.
8. Confirm AI context boundaries.
9. Confirm which objects could eventually map to Price Book rows.
10. Keep pricing nullable until approved.

## Later Integrations

### Price Book Integration

Only after review:

- Map approved BKE service objects to Price Book templates by stable key.
- Keep company-specific pricing in company price rows.
- Do not overwrite saved company pricing automatically.

### Estimate Builder Integration

Use BKE to provide:

- scope summaries
- included and excluded items
- related services
- customer notes
- line-item draft structure

Do not auto-generate final estimates without review.

### TechOS Integration

Use BKE to provide:

- required photos
- required measurements
- required tests
- required documents
- safety notes
- recommended tools
- technician training reminders

### HomeOS Integration

Use BKE to provide:

- homeowner-safe service explanations
- warranty context
- maintenance history meaning
- upgrade recommendations
- future service education

### AI Integration

Use BKE to provide:

- stable service context
- safe boundaries
- related services
- field requirements
- customer-facing explanation drafts

AI must not invent approved pricing or final scope.

## Business Priority Lane

When time or attention is limited, pause deep BKE and focus on:

- app stability
- user testing
- workflow completion
- demos
- sales conversations
- revenue

The safe return files preserve the architecture so the team can pause without losing the thread.
