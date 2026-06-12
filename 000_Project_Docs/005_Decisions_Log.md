# Decision Log

## 2026-05-30

Decision:
HOA functionality will be integrated into the same Barbarosa platform rather than developed as a separate application.

Reason:
The underlying systems (home health, equipment, documents, photos, service history, and maintenance requests) are nearly identical.

Only management workflows and contact destinations differ.

Status:
LOCKED

Decision:

Version 1 focuses on:

- Homeowners
- HOAs

Future property types are documented but not actively built.

Reason:

Prevent feature creep and maintain development focus.

Status:

LOCKED

2026-05-29

Decision:
Home Health is the primary feature of Barbarosa.

Reason:
Homeowners care about understanding and maintaining their property more than requesting service.

All service requests, equipment records, documents, and maintenance history support the Home Health system.

Status:
LOCKED

Barbarosa HomeOS

A Property Health Platform that helps homeowners,
HOAs, property managers, and service providers
understand, maintain, and improve the health
of their properties.

Core Principle:

Your home should have a health record,
just like your body has a medical record.





1. Tank condition is the primary score driver.

2. Tank leaking = Critical Failure.

3. Tank age reduces score over time based on expected service life.

4. Expansion Tank is its own asset record.

5. Drain Pan importance depends on installation location.

6. Technician sees full component checklist.

7. Homeowner sees simplified summary.

8. Every component maintains:
   - Status
   - Photos
   - Service History
   - Install Date
   - Replacement Date
   - Notes