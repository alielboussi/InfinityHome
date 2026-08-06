# Stocktake Flow

## Guides
- **Procedure (how to run a stocktake):** [`stocktake-procedure.md`](./stocktake-procedure.md) — roles, steps, checklist; no APIs or internals
- **Technical reference:** [`stocktake-technical.md`](./stocktake-technical.md) — endpoints, tables, submit logic, audit

## Pages
- **Stocktake** (`/stocktake`) — control: start/close/clear/submit + periods + Excel import
- **Count page** (`/stocktake/count`) — **fixed URL** forever; counters sign in and pick an open location session

`/stocktake-periods` redirects to `/stocktake`.

## Control steps
1. Pick location  
2. **Start counting** (opens session for that location)  
3. Users count on `/stocktake/count` and/or import Excel on control  
4. **Submit** → inventory + periods for that location only  

### Session actions
- **Close session** — only if there are **no counts** (started by mistake)  
- **Clear counts** — wipe all session counts for a fresh start (session stays open)  
- **Submit** — required once counts exist  

## Import rules
- Columns: **SKU**, **Product Name**, **Quantity**  
- Products and components only — **sets rejected**  
- Match by SKU first, then Product Name if needed  
- Only products enabled at the **session location**  
- Other locations are never changed  

