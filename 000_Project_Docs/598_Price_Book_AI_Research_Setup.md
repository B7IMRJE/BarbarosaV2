# 598 Price Book AI Research Setup

Review-only setup note. Do not add provider keys to the Expo frontend.

## Goal

Enable company owners/admins/managers to request AI-assisted price research for Price Book items while keeping final pricing manual and review-based.

AI must suggest prices only. It must not overwrite company price book records automatically.

## Suggested Edge Function

Edge Function added in repo:

```text
supabase/functions/research-price-book/index.ts
```

Deploy it with:

```bash
npx supabase functions deploy research-price-book
```

The Expo app should call the function with the signed-in user's Supabase session. The function should verify the caller can manage the requested company price book before doing any paid/API work.

## Required Secrets

Set these as Supabase Edge Function secrets, not Expo public env vars:

```bash
npx supabase secrets set OPENAI_API_KEY="..."
```

Optional model override:

```bash
npx supabase secrets set PRICE_RESEARCH_MODEL="gpt-4.1-mini"
```

Optional CORS allow-list for non-production test origins:

```bash
npx supabase secrets set PRICE_RESEARCH_CORS_ORIGINS="https://example-preview.vercel.app"
```

Optional, if live web/search provider is added later:

```bash
npx supabase secrets set PRICE_RESEARCH_SEARCH_API_KEY="..."
npx supabase secrets set PRICE_RESEARCH_SEARCH_ENDPOINT="..."
```

Never commit API keys or provider secrets.

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
  "research_note": "AI estimate based on provided company/item context, not live market research.",
  "suggestions": [
    {
      "item_key": "water-heater-standard-service",
      "name": "Water Heater Service",
      "suggested_low_price": 225,
      "suggested_average_price": 300,
      "suggested_high_price": 425,
      "recommended_price": 325,
      "confidence": "medium",
      "reasoning_summary": "Short explanation for review.",
      "assumptions": [
        "No live web research was used."
      ],
      "caution_notes": [
        "Review carefully. Pricing varies by market, code requirements, access, and job conditions."
      ],
      "source_notes": [
        "AI estimate based on provided company/item context, not live market research."
      ],
      "apply_allowed": true
    }
  ]
}
```

## Safety Rules

- Verify authenticated user access server-side.
- Allow platform admin and active company owner/admin/manager only.
- Return JSON with CORS headers for every success/error path.
- If `OPENAI_API_KEY` is missing, return:
  `AI price research is not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.`
- The first version is AI-assisted pricing based on supplied context. It is not guaranteed live market pricing.
- If live web/search is not connected, do not call the result online research.
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
