# 598 Price Book AI Research Setup

Review-only setup note. Do not add provider keys to the Expo frontend.

## Goal

Enable company owners/admins/managers to request AI-assisted price research for Price Book items while keeping final pricing manual and review-based.

AI must suggest prices only. It must not overwrite company price book records automatically.

## Suggested Edge Function

Create a Supabase Edge Function:

```bash
supabase functions deploy research-price-book-pricing
```

The Expo app should call the function with the signed-in user's Supabase session. The function should verify the caller can manage the requested company price book before doing any paid/API work.

## Required Secrets

Set these as Supabase Edge Function secrets, not Expo public env vars:

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set PRICE_RESEARCH_MODEL=...
```

Optional, if live web/search provider is added later:

```bash
supabase secrets set PRICE_RESEARCH_SEARCH_API_KEY=...
supabase secrets set PRICE_RESEARCH_SEARCH_ENDPOINT=...
```

## Request Shape

```json
{
  "company_id": "uuid",
  "scope": "one_item | current_system | filtered_list | all_unpriced",
  "items": [
    {
      "price_key": "water-heater-standard-service",
      "name": "Water Heater Service",
      "system": "Plumbing",
      "category": "Water Heater",
      "current_price": null
    }
  ],
  "service_area": "92618",
  "trade": "Plumbing",
  "positioning": "budget | market average | premium",
  "target_margin_percent": 45,
  "notes": "Company-specific pricing notes"
}
```

## Response Shape

```json
{
  "ok": true,
  "suggestions": [
    {
      "price_key": "water-heater-standard-service",
      "item_name": "Water Heater Service",
      "current_price": null,
      "suggested_price": 325,
      "low_price": 225,
      "average_price": 300,
      "high_price": 425,
      "confidence": "medium",
      "source_count": 3,
      "source_notes": [
        "Summary of source evidence, not copied article text"
      ],
      "warning": "Review carefully. Pricing varies by market, code requirements, access, and job conditions."
    }
  ]
}
```

## Safety Rules

- Verify authenticated user access server-side.
- Allow platform admin and active company owner/admin/manager only.
- Return JSON with CORS headers for every success/error path.
- If `OPENAI_API_KEY` is missing, return:
  `AI price research is not connected yet. Set OPENAI_API_KEY in Supabase Edge Function secrets.`
- If live web/search is not connected, either use model-only reasoning with a clear low-confidence warning, or return a setup-needed message.
- Do not generate fake source URLs.
- Do not write price book rows from the Edge Function.
- The frontend must show suggestions in a review queue and only update prices after the user clicks Apply.

## Future Database Extension

If persistent history is needed, add a later reviewed migration for:

- `company_price_book_item_history`
- old/new price values
- change reason
- changed_by_user_id
- changed_at
- source: manual, bulk_percentage, margin_calculator, ai_suggestion

Do not install history until the shared price book foundation has been tested.
