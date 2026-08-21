# Retired historical migrations

These SQL files are preserved verbatim as audit evidence, but intentionally sit
outside `supabase/migrations/` so the Supabase CLI will not attempt to replay
them on environments that already use their current successors.

| Historical version | Why retired | Current successor / source of truth |
| --- | --- | --- |
| `20260810010000_shared_core_rls_hardening` | Partially present and superseded by later profile, provider, Sales, and property-access work. Replaying it would replace current policies. | `20260820160000_shared_core_current_access_controls.sql` |
| `20260814190000_allow_dispatch_price_book_view` | Its direct RPC replacement was superseded by the current helper chain. Replaying it would overwrite current `get_company_price_book_v2` authorization. | `20260820170000_price_book_view_access_successor.sql` |

The associated remote historical versions are deliberately absent. They are not
marked applied because their original SQL was not fully deployed. The current
successor migrations are the deployable, recorded representation of the
intended state.
