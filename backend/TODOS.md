# AvgExchange — Backend TODOs

Gaps identified during the CMC endpoint engineering review (2026-06-30).
Items marked ✅ were fixed in the same review session.

---

## CMC Listing Blockers (must fix before submitting to CoinMarketCap)

- [ ] **Withdrawal user-facing flow** — `processWithdrawal` fails closed (admin-gated by design). Users need a withdrawal request page + admin approval UI before CMC will list the exchange. Real withdrawals also require real on-chain settlement.
- [ ] **Real settlement layer** — current liquidity is bot-provided, backed by unbacked virtual USDT. CMC vetting specifically flags non-organic volume. Real user deposits + real reserves required before submission.
- [ ] **Proof of Reserves** — can only be declared "NA" while settlement is virtual. Blocked by real settlement.

---

## Database

- ✅ **Composite index `idx_trades_pair_time`** — `trades(pair, executed_at DESC)` added to `schema.sql`. Apply to production with `psql -c "CREATE INDEX IF NOT EXISTS idx_trades_pair_time ON trades(pair, executed_at DESC);"`.
- [ ] **`taker_side` column on `trades`** — currently derived at read-time by comparing `buy_order.created_at` vs `sell_order.created_at` (heuristic, not DB-enforced). Add `taker_side VARCHAR(4)` to `trades` and set it in `db/settlement.js` at insert time for authoritative data.

---

## Code Quality

- ✅ **`ARRAY_AGG` → correlated subquery** for `open_price` in `get24hStats()`.
- ✅ **`$3 || ' hours'` → `$3 * INTERVAL '1 hour'`** in `getRecentTrades()`.
- ✅ **Shared `_rawStatsCache`** — `buildSummary()` and `buildTicker()` now share one DB round-trip per 60-second window.
- ✅ **Double-cache staleness** — removed route-level `cache.wrap()` for `/summary` and `/ticker`; `_rawStatsCache` is the single caching layer.
- ✅ **CMC rate limiter** — `cmcLimiter` (120 req/min, IP-keyed) added to `cmcRoutes.js`.

---

## Testing

- [ ] **Test framework** — no `jest`/`vitest` etc. All tests are manual `node test/e2e.js` scripts. Adopt a real framework when the project matures.
- ✅ **CMC e2e section** — §9 added to `backend/test/e2e.js` covering all 6 endpoints, bad-pair 400, and X-Cache HIT.
- [ ] **taker=sell derivation test** — extend e2e.js §9: place market sell after a resting bid, assert `type='sell'`.
- [ ] **DB error → 500 test** — no fault-injection test for CMC endpoint DB errors.

---

## Infrastructure / Deployment

- [ ] **`FRONTEND_URL` env var** — `backend/.env` still points to `avg-exchange.vercel.app`. Update to Hostinger domain after DNS is live.
- [ ] **Hostinger SPA routing** — `frontend/vercel.json` was deleted (Hostinger migration). Configure Hostinger's equivalent catch-all rewrite (`/* → /index.html`) to prevent 404 on direct page loads.
- ✅ **Root `.gitignore`** — created with `.DS_Store` and `**/.DS_Store` to prevent macOS metadata from being committed.
- ✅ **`.DS_Store` unstaged** — root `.DS_Store` and `backend/.DS_Store` removed from git index.

---

## CMC Submission Checklist (non-code items)

- [ ] Twitter/X account (required field)
- [ ] Telegram or Discord (required "Chat 1" field)
- [ ] 200×200 transparent PNG logo
- [ ] Hosted Terms of Service page
- [ ] Fee schedule page (even "0% maker/taker" must be a public URL)
- [ ] Consistent brand casing (AVG / Avg / AvgExchange — pick one)
- [ ] Project description ~500 words for CMC form
- [ ] Launch date + country (not in code — fill from team knowledge)
