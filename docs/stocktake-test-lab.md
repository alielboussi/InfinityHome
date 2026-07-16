# Stocktake — quick test

## 1) Seed the lab location (Supabase SQL)
Run: `supabase/sql/migrations/20260710_seed_test_stocktake_lab.sql`

Creates only:
- Location **TEST STOCKTAKE LAB**
- Resets lab so the next submit is the **first** stocktake

Add your own products to that location afterward (product list / product locations).

## 2) Use the app
1. Open **Stocktake Flow → Stocktake** (auto-selects the lab if present).
2. **Start session**
3. Open the fixed count page: `/stocktake/count` (same link every time)
4. Turn **Counting ON**
5. On count page: pick location (if more than one is ON) → search → qty → **Submit** on control
