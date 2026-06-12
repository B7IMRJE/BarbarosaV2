# 300 Data Model

## Core Rule

No fake items.
No fake statuses.
No hardcoded equipment.
No dead buttons.

Everything displayed in the app must come from saved user/home data.

---

## Main Structure

HomeHealth is organized like this:

House
→ System
→ Area
→ Item
→ Component
→ Documents / Photos / Notes / Service History

---

## House

A House is the main property profile.

A House can have many Systems.

Example systems:
- Plumbing
- HVAC
- Electrical
- Water Quality
- Safety
- Gas
- Appliances
- Exterior
- Drains / Sewer

---

## System

A System is a major category of the home.

Examples:
- Plumbing
- HVAC
- Electrical
- Water Quality

Each System can have Areas, Items, or both.

---

## Area

An Area is a physical location inside or outside the home.

Examples:
- Kitchen
- Bathroom 1
- Bathroom 2
- Garage
- Laundry Room
- Attic
- Exterior
- Backyard
- Front Yard
- Other

---

## Item

An Item is a real fixture, appliance, or piece of equipment.

Examples:
- Kitchen Sink
- Toilet
- Water Heater
- Dishwasher
- Main Shutoff
- Hose Bib
- Shower Valve

Items are not created by code automatically.

Items are added by the homeowner, technician, or admin through the app.

---

## Component

A Component is a smaller part belonging to an Item.

Example:

Kitchen Sink components:
- Faucet
- Hot angle stop
- Cold angle stop
- Dishwasher angle stop
- Supply lines
- P-trap
- Drain assembly
- Garbage disposal
- Air gap
- RO system
- Filter
- Leak sensor

Water Heater components:
- Gas control valve
- T&P valve
- Drain valve
- Expansion tank
- Vent pipe
- Gas line
- Water flex lines
- Shutoff valve

---

## Condition

Every Item and Component must have a saved condition.

Allowed conditions:
- Good
- Needs Attention
- Bad
- Unknown

The app must display the saved condition only.

The app must not hardcode “Good” or any other status.

Condition can be changed later from the item detail screen.

---

## Documents

Documents belong to the Item or Component.

Document types:
- Photo
- Warranty
- Manual
- Receipt
- Invoice
- Service note
- Permit
- Inspection
- Other

Documents can be reached two ways:

1. From the Item detail page.
2. From the Documents tab.

Both paths show the same saved documents.

---

## Documents Tab Flow

Documents
→ Pick System
→ Pick Area
→ Pick Item
→ View Documents

Example:

Documents
→ Plumbing
→ Kitchen
→ Kitchen Sink
→ Faucet Warranty

Documents are organized by home structure, not alphabetically.

---

## Add / Delete Rules

Main dashboard does not show add or delete buttons.

Main bottom navigation:

Home | Equipment | Documents | Profile

On screens where adding or deleting makes sense, bottom navigation becomes:

Home | Equipment | + | - | Documents | Profile

Delete always requires confirmation.

Confirmation message:

“Are you sure you want to delete this item? This cannot be undone.”

---

## Home Health Score

No fake score.

When there is not enough data, display:

“Not enough data yet.”

Later, the score will be calculated from saved item and component conditions.

---

## V1 Goal

The first real house entered will be Michael’s house.

The app must start empty and allow real items to be added through the app flow.

No sample toilets.
No sample water heaters.
No sample documents.
No fake warnings.
No fake needs-attention list.