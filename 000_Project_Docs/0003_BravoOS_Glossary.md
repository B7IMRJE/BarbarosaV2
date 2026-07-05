# BravoOS Glossary

## BravoOS

The operating system for the company side of the product. It includes management workflows, company configuration, pricing, estimating, dispatch, technician work, reporting, and future AI-assisted operations.

## ManagementOS

The management surface inside BravoOS. It is where admins inspect and manage company workflows such as the company dashboard, Price Book, BKE viewer, users, clients, and future operations tools.

## HomeOS

The homeowner-facing operating layer. It explains the home, service history, equipment, documents, photos, maintenance, and recommendations in language homeowners can understand.

## TechOS

The technician-facing execution layer. It should eventually consume BKE requirements for photos, measurements, tests, safety notes, tools, and checklists.

## Bravo Core

The durable knowledge layer of BravoOS.

Bravo Core is the broader concept of one source of truth for services, pricing meaning, estimating context, technician execution, homeowner education, AI context, training, and reporting.

## Bravo Knowledge Engine

BKE is the first implementation of Bravo Core.

It is a typed source layer made of Knowledge Objects. BKE is not itself a screen, Price Book, or AI feature.

## Knowledge Object

A canonical object that describes a service, diagnostic, installation, replacement, maintenance task, package, add-on, permit, part, equipment concept, checklist requirement, warranty concept, training note, or reporting concept.

Current Water Heater objects include fields for identity, navigation, pricing, estimating, technician requirements, homeowner language, AI context, training, reporting, and active state.

## Object Type

A future classification layer for Knowledge Objects.

Project 1000.1 should define object types before BKE expands too far. Object types will clarify what a Knowledge Object is and how it can be used.

## Price Book

The company-specific pricing view used for estimates and proposals.

The current Price Book plumbing catalog exists separately from BKE. BKE should not replace it yet. Future integration should map approved BKE objects to Price Book templates while keeping company-specific pricing in company price rows.

## Plumbing Catalog

The existing catalog that drives the current Price Book navigation and editable company pricing workflow.

It is separate from BKE for now.

## Estimate Builder

The future proposal-building surface. It should eventually consume BKE scope summaries, included and excluded items, related services, and customer notes.

## BKE Viewer

The read-only ManagementOS route that lets the team inspect Knowledge Objects before wiring them into live workflows.

The viewer exists to reduce risk. It is for review, not mutation.

## Knowledge Vs View

Knowledge is the canonical object.

A view is a way to use that object for a specific workflow. Views should not become separate sources of truth.

## One Source Of Truth

The principle that service meaning should live in one canonical layer and be reused across pricing, estimating, technician execution, homeowner education, AI, training, and reporting.

## Module

A focused domain area of BKE, such as Water Heaters, Toilets, Kitchen, Bathroom, Drain / Sewer, Gas, Water Quality, Diagnostics, or Emergency.

## Module-First Development

The rule that BKE should be built deeply enough in one module before expanding every module shallowly.

Water Heaters is the current proof module.

## Draft

A Knowledge Object status meaning the object is useful for structure and review but is not approved as final operating truth.

## Testing

A Knowledge Object status meaning the object is solid enough for operational review or controlled use, but still not fully approved.

## Approved

A future Knowledge Object status meaning reviewed and accepted as standard operating knowledge.

No current Water Heater object should be treated as approved unless explicitly marked and reviewed.

## Price Key

A stable key used to connect service knowledge to priceable catalog or company-specific pricing rows.

Stable keys should not change casually once used.

## AI Context

The text BKE can provide to AI tools so assistance is better grounded.

AI context is not authority. It does not approve pricing, safety, warranty, or final customer scope.

## Safe Return Point

A documented pause state that captures where architecture work stopped, what exists, what should not be wired yet, and what task should resume next.
