# AvgExchange — Code Review, Bot Audit & Fixes (2026‑06‑17)

This document covers, in detail:

1. **Part A — The Market‑Maker Bot**: a full read‑through of every bot file, the
   APIs and libraries it uses, how the pieces fit together, and a correctness
   verdict (including the bugs/operational gaps found).
2. **Part B — The code review**: how the review was run and the 10 findings.
3. **Part C — The 10 fixes**: what each fix changed, in which file, and *why*.
4. **Part D — The "two things to flag"**: a plain‑English explanation of the two
   caveats attached to the fixes (#1 the matching‑engine change, #10 the pairs
   de‑duplication).

> Scope note: this is documentation of *the review + fix session* plus a bot
> audit. No bot code was modified in this session — the bot section is an audit.
> All backend/frontend fixes from Part C are in the working tree, uncommitted.

---

# Part A — The Market‑Maker Bot

The bot lives in `bot/` and is a **separate Node process** from the backend. Its
job is to keep the order book of each trading pair populated with bids and asks
so the exchange always looks liquid and real users can trade. It does this by
acting as an ordinary authenticated user that constantly cancels and re‑places a
"grid" of limit orders around the current market price.

## A.1 Libraries used (`bot/package.json`)

| Package | Version | Why it's used |
|---|---|---|
| `axios` | ^1.13.5 | All HTTP calls to the backend REST API and to the CoinGecko proxy. Every bot module uses an axios instance. |
| `dotenv` | ^16.0.1 | Loads `bot/.env` into `process.env` (credentials, tuning knobs). |
| `socket.io-client` | ^4.8.3 | Declared as a dependency but **not currently imported** by any bot source file — the bot is poll‑based, not socket‑based. (Candidate for removal, or for a future push‑based rewrite.) |
| `nodemon` | ^3.1.14 (dev) | `npm run dev` auto‑restarts the bot on file change. |

There is **no** order‑matching library in the bot — matching happens entirely on
the backend (`nodejs-order-book`, see Part C). The bot only *submits* orders.

## A.2 Configuration (`bot/config.js` + `bot/.env`)

`config.js` reads environment variables (via `dotenv`) and exports a plain
object. `required(key)` throws immediately at startup if a mandatory var is
missing, so the bot fails fast instead of half‑starting.

| Config key | Env var | Default | Meaning |
|---|---|---|---|
| `API_URL` | `API_URL` | `http://localhost:4000` | Base URL of the backend. |
| `BOT_EMAIL` | `BOT_EMAIL` | **required** | The exchange account the bot trades as. |
| `BOT_PASSWORD` | `BOT_PASSWORD` | **required** | That account's password. |
| `BOT_SECRET` | `BOT_SECRET` | **required** | Shared secret that unlocks `POST /api/user/bot-login` (must equal the backend's `BOT_SECRET`). |
| `BOT_PAIRS` | `BOT_PAIRS` (or legacy `BOT_PAIR`) | `BTC/USDT` | Comma‑separated list of pairs to make markets on. Parsed into an array. |
| `BOT_PAIR` | — | `BOT_PAIRS[0]` | Back‑compat single pair, used as the default by `marketData.getMidPrice`. |
| `BOT_SPREAD_PCT` | `BOT_SPREAD_PCT` | `0.3` | Half‑spread per side, in percent. The innermost order on each side sits this far from mid. |
| `BOT_ORDER_VALUE_USD` | `BOT_ORDER_VALUE_USD` | `10` | USD notional per order for the *regular* maker. Quantity = value ÷ price, so it auto‑scales to any coin price. |
| `BOT_STATIC_ORDER_VALUE_USD` | `BOT_STATIC_ORDER_VALUE_USD` | `200` | USD notional per order for the *static‑coin* maker (kept separate so it can be tuned without touching the real‑coin maker). |
| `BOT_LEVELS` | `BOT_LEVELS` | `3` | Number of orders per side (grid depth). |
| `BOT_LEVEL_STEP_PCT` | `BOT_LEVEL_STEP_PCT` | `0.1` | Extra percent added to the spread for each level deeper into the book. |
| `BOT_INTERVAL_MS` | `BOT_INTERVAL_MS` | `30000` | How often (ms) each maker cancels and re‑quotes its grid. |

## A.3 File‑by‑file walkthrough

### `bot/index.js` — entry point / process orchestrator
1. `require('dotenv').config()` then prints a banner of the active config.
2. `await login()` (one shared session) → `const client = await getClient()`.
3. Creates **one `MarketMaker` per pair** in `BOT_PAIRS`, calling `bot.start()`
   for each **staggered 2 s apart** (`await new Promise(r => setTimeout(r,2000))`)
   so all pairs don't hammer the API at the same instant and the logs stay
   readable.
4. Creates **one `StaticCoinMaker`** (no‑ops if no static coin is configured).
5. Installs `SIGINT`/`SIGTERM` handlers that call `stop()` on every maker via
   `Promise.allSettled(...)` so a Ctrl‑C cleanly cancels all resting orders
   before `process.exit(0)`.
6. The top‑level `main().catch(...)` logs `err.response.status`/`body` when the
   failure was an HTTP error — useful because axios errors otherwise hide the
   server's message.

### `bot/src/auth.js` — session management
- `login()` calls **`POST /api/user/bot-login`** with `{ email, password, botSecret }`
  and `validateStatus: () => true` (so non‑2xx doesn't throw — it inspects the
  status manually). On success it extracts the `token=...` cookie from the
  `set-cookie` response header and caches it in the module‑level `sessionCookie`.
- `getClient()` returns a pre‑configured axios instance with the `Cookie`
  header set, and installs a **response interceptor**: if any response is `401`,
  it re‑logs‑in, swaps in the fresh cookie, and **retries the request once** via
  raw `axios(res.config)` (raw axios, not the intercepted client, so there's no
  infinite re‑auth loop).
- Why `bot-login` and not the normal `login`? Because the normal `/api/user/login`
  now triggers the **2FA / OTP** flow (it emails a code and returns
  `{ otpSent: true }` with no session). `bot-login` is the headless bypass that
  exchanges the shared `BOT_SECRET` + password for a JWT directly. (This is the
  endpoint Part C hardens with a rate‑limiter + constant‑time secret compare.)

### `bot/src/marketData.js` — price source
- `getMidPrice(pair)` maps the base symbol → a CoinGecko id via the `GECKO_IDS`
  table, then fetches **`GET /api/markets`** (the backend's *cached CoinGecko
  proxy*, `vs_currency=usd&per_page=50&page=1`) and finds the coin by `id`.
- **Resilience**: up to `MAX_RETRIES = 3` attempts with **exponential backoff +
  jitter** (`BASE_DELAY=2s`, capped at `MAX_DELAY=30s`). On HTTP `429` it honours
  the `Retry-After` header. If all retries fail it returns the **last known
  price** for that pair (`lastKnownPrices[pair]`) instead of crashing the cycle;
  only if there's never been a successful fetch does it throw.
- Note: it reads the *aggregated markets* endpoint (top 50 by market cap), so
  the mid price is a real‑world reference price, not the exchange's own book.

### `bot/src/orderManager.js` — order placement & bookkeeping
Holds `openOrderIds` (a `Set`) for the pair. Key methods:
- **`place(side, price, quantity)`** — rounds the price with `_pricePrecision()`
  (a tiered heuristic: 2 dp ≥ \$10, 4 dp ≥ \$1, 5 dp ≥ \$0.1, else 6 dp, so the
  spread is always ≥ 1 tick), rounds qty to 8 dp, then **`POST /api/trade/order`**
  with `type: 'limit'`. On `201` it records the order id *only if it's still
  resting* (not immediately `filled`/`cancelled`). Because the axios client uses
  `validateStatus: () => true`, a `400/500` does **not** throw — it's logged in
  the `else` branch. (This is why the earlier "unhandled rejection in place()"
  review candidate was **dropped** — HTTP errors can't throw here.)
- **`getBalances()`** — **`GET /api/user/balance`**, returns `{ base, quote }`
  available floats, or `null` if the call fails (callers then fall back to
  "blind" placement).
- **`placeGrid(midPrice)`** — the regular maker's grid:
  1. Fetches balances and computes an **inventory skew** (±0.1 % max, with a
     ±10 % dead‑zone): too much quote → shift mid up so buys are more aggressive;
     too much base → shift down. This nudges the bot back toward a balanced
     inventory without dumping.
  2. `orderSize = BOT_ORDER_VALUE_USD / midPrice` (constant notional per order).
  3. For each level it places a buy below and a sell above, **size‑gating** each
     order against the *remaining* budget (`balances.quote - usedQuote`, etc.) so
     it skips orders it can't afford instead of eating a backend 400.
- **`cancelAll()`** — cancels the orders it *thinks* it has open (`openOrderIds`),
  clearing the set first so concurrent calls don't double‑cancel.
- **`cancelAllOpen()`** — the robust cleanup: **`GET /api/trade/orders?status=open,partially_filled&pair=…&limit=1000`**
  to discover *every* resting order for the pair on the server (even ones from a
  previous bot process whose in‑memory set is gone), then `DELETE`s each via
  `Promise.allSettled`. Used on startup and shutdown.

### `bot/src/marketMaker.js` — the real‑coin loop
A `MarketMaker` owns one pair and one `OrderManager`. `tick()` (wrapped in a
`try/catch`) does: `cancelAll()` → `getMidPrice()` → `placeGrid(mid)` →
log resting count. `start()` first calls `cancelAllOpen()` to clear ghosts, runs
one tick immediately, then `setInterval(tick, BOT_INTERVAL_MS)`. `stop()` clears
the interval and calls `cancelAllOpen()` (server‑sourced, so it works even if the
in‑memory set is empty).

### `bot/src/staticCoinMaker.js` — the synthetic‑coin loop
For an **admin‑configured "static coin"** that isn't a real market. It reads
**`GET /api/admin/static-coin`** (an *admin‑only* endpoint) for
`{ symbol, min_price, max_price, current_price, enabled }`, then quotes a grid
*inside* the `[min_price, max_price]` band using `current_price` as the mid:
- `buyStep = (mid - min) / levels`, `sellStep = (max - mid) / levels`.
- Each level's quantity is **randomised ±40 %** (`0.6 + Math.random()*0.8`) so
  every row of the book shows a different size (looks more organic).
- Orders are only placed while `buyPrice > minPrice` / `sellPrice < maxPrice`
  (keeps the book strictly inside the band) and are size‑gated against balances.
- The price itself is *not* moved by the bot here — the backend
  `jobs/staticCoinOscillator.js` random‑walks `current_price` (the job Part C
  fixes against NaN). The bot just follows whatever `current_price` is.

### `bot/setup.js` — one‑time account bootstrap (⚠ now broken, see A.4)
Intended to: sign up (or log in) the bot account, deposit large dummy balances
(USDT/BTC/ETH/SOL/BNB/XRP/DOGE/ADA) via **`POST /api/user/deposit`**, and print
the resulting balances. Uses `validateStatus: () => true` and pulls the session
cookie from `set-cookie`.

### `bot/purge-orphans.js` — locked‑funds recovery tool
Stand‑alone maintenance script. Logs in via `bot-login`, snapshots balances,
then **pages** through `GET /api/trade/orders?status=open,partially_filled&limit=1000`
and `DELETE`s every order (each cancel runs through the backend engine's
`cancelOrder()`, which unlocks the reserved funds inside a DB transaction),
looping until a page returns `< 1000` rows. Prints before/after balances so you
can watch `locked` → `available`. Use it when a previous crash left funds stuck
in stale orders.

## A.4 Bot correctness verdict

**The core *runtime* loop is correct and notably well‑engineered.** The
cancel‑then‑requote cycle, the staggered multi‑pair startup, the 401
re‑auth‑and‑retry interceptor, the price‑fetch backoff with last‑known‑price
fallback, the inventory skew, the per‑order budget gating, and the
server‑sourced `cancelAllOpen()` cleanup are all sound and handle the obvious
failure modes gracefully.

However, the audit surfaced the following **issues/operational gaps** (none of
these were changed in this session — they are reported for follow‑up):

1. **🔴 `setup.js` is broken by the new OTP login.** It authenticates via
   `POST /api/user/signup` then `POST /api/user/login`, but both endpoints now
   return `{ otpSent: true }` with **no session cookie** (they email an OTP
   instead). `extractCookie()` therefore returns `null`, and the script exits at
   *"No session cookie received"*. **Consequence:** the documented bootstrap
   (`node setup.js`) can no longer create/fund the bot account. *Fix options:*
   rewrite `setup.js` to use `bot-login` (after the account exists) for the
   funding step, or seed the account + admin flag + balances with a backend DB
   script (`backend/scripts/`).

2. **🔴 The bot account must be `is_admin = true`.** Three separate dependencies
   require it:
   - `POST /api/user/deposit` is behind `requireAdmin` → setup funding needs admin.
   - `GET /api/admin/static-coin` is behind `router.use(requireAuth, requireAdmin)`
     → the static‑coin maker can't read its config without admin.
   - `POST /api/trade/order` exempts only `is_admin` from the **KYC gate** (and the
     order rate‑limiter `skip: skipAdmins`) → a non‑admin bot gets **403 "KYC
     required"** on *every* order.
   So the bot account has to be promoted to admin in the DB before anything
   works. This is implicit and easy to miss — worth documenting in `.env.example`
   or automating in the (to‑be‑fixed) setup.

3. **🟡 `StaticCoinMaker.tick()` has no `try/catch`** (unlike `MarketMaker.tick()`
   which does). HTTP status errors can't throw here (`validateStatus: () => true`),
   but a **network‑level** error (backend down → `ECONNREFUSED`) inside
   `getBalances()`/`place()` would reject the promise, and since `tick` is driven
   by `setInterval(() => this.tick(), …)` with no `.catch`, that becomes an
   **unhandled rejection**. Recommend wrapping the static tick body in the same
   `try/catch` the real maker uses.

4. **🟡 `BOT_LEVELS = 0` mis‑config** → `buyStep/sellStep = range / 0 = Infinity`
   in the static maker (and an empty grid in the regular maker). It defaults to
   `3`, so this only bites on an explicit bad value; a `Math.max(1, …)` guard
   would make it bullet‑proof.

5. **🟢 Minor:** `GECKO_IDS` still maps `TON`/`SHIB` (not in the supported‑pairs
   list) and `MATIC → matic-network` (CoinGecko is migrating MATIC→POL; watch for
   breakage). `socket.io-client` is a declared dependency that nothing imports.

---

# Part B — The Code Review

## B.1 How it was run
The review (`/code-review`, high effort) targeted the working‑tree diff
(`git diff HEAD`, ~8,200 lines) — a large refactor that split `backend/db.js`
into `backend/db/*`, slimmed `server.js`, rewrote routes/services, added a
centralized frontend API layer, and changed the bot.

Seven independent **finder** passes were run in parallel:
line‑by‑line scan, removed‑behavior audit, cross‑file tracer, reuse,
simplification, efficiency, and altitude. Their candidates were then
**verified** by reading the actual files (engine, settlement, funds, payment,
auth, OTP, oscillator, socket hook, auth slice). Confirmed/plausible findings
were kept; refuted ones dropped.

## B.2 Notably what the refactor got *right* (no regression)
The `db.js → db/` split is clean: `require('../db')` resolves to the new
`db/index.js`, which re‑exports the identical symbol set, and every consumer
uses the correct names. `lockFunds`/`unlockFunds` (`FOR UPDATE` + insufficient
check + `ROLLBACK`), `settleFill` (Decimal math, deadlock‑safe ascending
`user_id` ordering), the OxaPay HMAC verification + idempotent crediting, the
admin gate, and the startup `SECRET` guard were all preserved faithfully.

## B.3 The 10 findings (ranked)
| # | Severity | File | One‑liner |
|---|---|---|---|
| 1 | 🔴 High | `services/engineService.js` | Settlement skipped *after* the in‑memory book already matched → book/DB desync + stranded locked funds. |
| 2 | 🔴 High | `routes/paymentRoutes.js` | Empty `tx_id` idempotency key silently drops a second genuine deposit. |
| 3 | 🟠 Med | `controllers/userController.js` | Login OTP has no attempt counter → brute‑forceable 2FA. |
| 4 | 🟠 Med | `routes/user.js` | `/bot-login` unthrottled + bypasses 2FA + non‑constant‑time secret compare. |
| 5 | 🟠 Med | `routes/tradeRoutes.js` | `!price` guard rejects every market order. |
| 6 | 🟠 Med | `jobs/staticCoinOscillator.js` | `min == max` → divide‑by‑zero writes `NaN` into the price. |
| 7 | 🟡 Low | `hooks/useTradeSocket.js` | Stale‑closure callbacks; live updates act on stale state. |
| 8 | 🟡 Low | `features/authSlice.js` | `refreshUser` race → "logged‑in" user with `token: null`. |
| 9 | 🟢 Cleanup | `routes/tradeRoutes.js` | Re‑implements `validatePositiveDecimal`/`parsePair`. |
| 10 | 🟢 Cleanup | `constants/pairs.js` | Duplicates the backend's canonical pairs list. |

---

# Part C — The 10 Fixes (what changed and why)

### Fix #1 — Matching‑engine settlement desync
**Files:** `backend/services/engineService.js`
**Problem:** `nodejs-order-book` *consumes* a resting (maker) order from the
in‑memory book the moment it matches. `_settleFills()` then sometimes **declined
to settle** a matched fill — for a **self‑trade** (you matched your own order) or
for **slippage** (a market buy whose running cost exceeded the locked budget) —
by `continue`‑ing the loop. But the book had *already* removed that maker. Result:
the maker's DB row stayed `open` with its funds **locked**, while its liquidity
had vanished from the live book; the taker's accounting was off too.
**Fix:**
- The self‑trade **pre‑check** now also covers **market orders** (previously
  `type === 'limit'` only). A market order crosses any price, so we cancel *all*
  of the user's own resting orders on the opposite side before matching. This
  prevents the common self‑trade path entirely.
- Added `_restoreFill(fill, ctx)`: when a fill is *still* skipped (rare race or
  slippage), it **re‑inserts the consumed maker quantity back into the book**
  (`book.limit({ side: makerSide, id, size, price })`) so the book matches the
  still‑`open` DB row.
- `_settleFills` now returns `{ executedTrades, skippedQty }`; `placeOrder` adds
  `skippedQty` back onto `quantityLeft` so the route's unlock math treats skipped
  quantity as **unfilled** (the funds get released, not stranded).

### Fix #2 — Empty `tx_id` deposit drop
**File:** `backend/routes/paymentRoutes.js` (static deposit callback)
**Problem:** `tx_id` is the idempotency key (`NOT NULL UNIQUE`). It defaulted to
`''` when OxaPay omitted `txId`. The first empty‑tx deposit inserted a row with
`tx_id = ''`; a *second* genuine empty‑tx deposit then matched the dup‑check and
was silently rolled back — **lost funds**.
**Fix:** if `txId` is empty after reading both `body.txId` and `body.tx_id`,
**refuse to credit** and log a warning, instead of inserting an empty key. Real
"Paid" callbacks always carry a tx hash, so this rejects only the ambiguous case
that could double‑book the key.

### Fix #3 — OTP brute‑force
**Files:** `backend/middleware/rateLimiters.js`, `backend/routes/user.js`
**Problem:** `verifyLoginOtp` had no per‑OTP attempt counter and didn't
invalidate the code on wrong guesses; the only throttle was the IP‑keyed
`authLimiter` (100/15 min), which an attacker defeats by rotating IPs to brute
the 6‑digit (1,000,000‑space) code within its validity window.
**Fix:** added `otpVerifyLimiter` — **keyed by email** (not IP),
`max: 5` per 15 min, `skipSuccessfulRequests: true` (so only *failed* attempts
count and a legitimate user is unaffected). Wired onto both
`/verify-login-otp` and `/verify-signup-otp`.

### Fix #4 — Harden `/bot-login`
**File:** `backend/routes/user.js`
**Problem:** the route had **no rate limiter** and compared the shared secret
with `!==` (timing‑sensitive). It also bypasses 2FA for a trading‑privileged
account.
**Fix:** added `authLimiter` to the route and replaced the secret comparison
with a **constant‑time** `crypto.timingSafeEqual` (length‑checked first to avoid
throwing on mismatched buffer lengths).

### Fix #5 — Market orders blocked by `!price`
**File:** `backend/routes/tradeRoutes.js`
**Problem:** `if (!pair || !side || !price || !quantity)` required a `price` even
for **market** orders — which legitimately have none (the route derives the lock
price from `engine.getBestPrice`). Every market order returned 400, making the
whole market‑order path dead.
**Fix:** the required‑field check no longer includes `price`; a separate guard
requires `price` **only when `type === 'limit'`**. The limit branch still
validates the price is a positive number.

### Fix #6 — Oscillator `NaN`
**File:** `backend/jobs/staticCoinOscillator.js`
**Problem:** `bias = (centre - current) / (max - min) * 0.002`. If an admin set
`min_price === max_price`, the divisor is `0`; with `centre === current` that's
`0/0 = NaN`, which flows into `current_price` (Postgres `numeric` *accepts* the
literal `NaN`) and corrupts the price feed for every downstream consumer, tick
after tick.
**Fix:** guard the divide (`range > 0 ? … : 0`), recover a previously‑corrupted
price (`if (!Number.isFinite(current)) current = centre`), and clamp the result
(`if (!Number.isFinite(next)) next = centre`).

### Fix #7 — Socket stale closures
**File:** `frontend/src/hooks/useTradeSocket.js`
**Problem:** the socket effect ran on `[userId, pair]` only, capturing the
callback props (`onDepthUpdate`, `onBalanceUpdate`, `onBinance*`, …) **once**.
If a parent passed inline handlers closing over changing state, the socket kept
calling the *stale* versions → the UI silently stopped reflecting reality.
**Fix:** the latest callbacks are stored in a `handlersRef` updated on every
render; each socket handler reads from `handlersRef.current`, so it always
invokes the current props while still subscribing only once per `[userId, pair]`.

### Fix #8 — `refreshUser` zombie session
**File:** `frontend/src/features/authSlice.js`
**Problem:** `refreshUser` re‑read the token from `localStorage` and
`refreshUser.fulfilled` set `state.user` unconditionally. If a `logout` /
`sessionExpired` cleared storage *while the request was in flight*, the thunk
wrote back a user object with `token: null` → the app looked "logged in" but
every request went out tokenless (repeated 401s, a half‑dead session).
**Fix:** after `getMe()` resolves, if the stored `token` is gone, the thunk
`rejectWithValue(null)` (which the `rejected` reducer already turns into a clean
logout) instead of resurrecting the session.

### Fix #9 — Reuse validation helpers
**File:** `backend/routes/tradeRoutes.js`
**Problem:** the order route hand‑rolled quantity/price validation
(`new Decimal(...)` in try/catch, `lte(0)`, `gt(MAX)`) and `pair.split('/')`,
duplicating `utils/validation.js` (`validatePositiveDecimal`, `parsePair`) added
in the same diff — two sources that can drift, and `pair.split('/')` yields
`undefined` currencies on a malformed pair whereas `parsePair` throws.
**Fix:** imported and used `validatePositiveDecimal(quantity, MAX_ORDER_QUANTITY)`,
`validatePositiveDecimal(price)`, and `parsePair(pair)`.

### Fix #10 — Pairs single source of truth
**Files:** `backend/routes/marketRoutes.js`, `frontend/src/api/market.js`,
`frontend/src/constants/pairs.js`
**Problem:** the frontend re‑declared the supported‑pairs list that
`backend/config/pairs.js` already owns — two hand‑maintained lists that can
drift (a pair the UI offers but the backend rejects, or vice versa).
**Fix (partial — see Part D):** added **`GET /api/markets/pairs`** sourced from
`config/pairs.js` (the single backend authority), a `marketApi.getPairs()`
client method, and a `fetchSupportedPairs()` helper in the frontend constants
that fetches the canonical list (falling back to the static array). The static
list is retained as a render‑time fallback and now carries a contract comment
pointing at the backend as the source of truth.

## C.1 Verification performed
- `node --check` passed on all 7 edited backend files.
- No new frontend import cycle (`constants/pairs.js → api` does not loop back).
- ESLint on the changed frontend files surfaced only **two pre‑existing** errors
  in `authSlice.js` (the `logoutUser` `catch (_) {}` block) — left untouched as
  out of scope.

---

# Part D — The "Two Things to Flag", explained

These are the two caveats attached to the fixes — neither is a defect in the
fix, they're honest disclosures about *confidence* (#1) and *scope* (#10).

## D.1 Flag on Fix #1 — the matching engine is the highest‑risk change, and untested
- **Why it's the consequential one:** #1 touches the **money‑movement core** —
  how trades settle and how locked funds are released. A subtle error here
  doesn't just render a UI wrong; it can **strand real balances** or desync the
  in‑memory book from the database. It's also the trickiest fix (it reasons
  about *when* `nodejs-order-book` removes an order from memory relative to when
  we persist the trade).
- **What "verified against consume‑on‑match behavior" means:** the fix assumes
  the library **removes a maker order from the book at the moment it matches**
  (so once matched, that liquidity is gone from memory unless we put it back).
  The fix is built on that assumption — the new `_restoreFill()` re‑adds the
  consumed quantity, and `skippedQty` corrects the taker's leftover. If the
  library's semantics differ in some edge (e.g. how it reports a *partially*
  consumed resting order's id), the restore could behave differently.
- **Why the caveat exists:** there is **no automated test coverage** for the
  engine, so the reasoning was verified by reading code, not by running it.
- **The recommended manual check (before production):**
  1. As one user, place a resting **limit** order (e.g. a sell).
  2. As the *same* user, place a **market** order that would cross it (a buy).
  3. Confirm: the maker order **stays in the book** (self‑trade was prevented),
     **no trade is recorded**, and the account's `locked`/`available` balances
     are **unchanged** (nothing stranded). Repeat with the slippage case (a
     market buy into a thin book that moves >5 %) and confirm any unfilled
     remainder is **unlocked**, not stuck.
- **Suggested follow‑up:** add unit/integration tests around `placeOrder` /
  `_settleFills` (self‑trade, slippage, partial fills, multi‑maker fills) so this
  path stops relying on manual checks.

## D.2 Flag on Fix #10 — it's a deliberate *partial* fix
- **What was done:** a single authoritative endpoint (`GET /api/markets/pairs`)
  now serves the canonical list from `backend/config/pairs.js`, plus a
  `fetchSupportedPairs()` helper the frontend *can* call at runtime.
- **What was *not* done:** the existing frontend consumers
  (Markets page, Trade page, the socket hook, etc.) still import the **static**
  `SUPPORTED_PAIRS` array synchronously. Migrating them all to the async
  `fetchSupportedPairs()` means adding **loading states** and reworking those
  components — a meaningfully larger change with its own regression surface.
- **Why stop there:** #10 is the **lowest‑severity** finding (a cleanup /
  maintainability item, not a bug). The two lists are **currently in sync**, so
  doing a risky multi‑component refactor for a cosmetic duplication would be
  disproportionate — the cost/benefit doesn't justify it inside a fix pass.
- **Net effect now:** there is one backend source of truth and a documented
  contract (the comment in `constants/pairs.js`), which **reduces future drift**
  even though the static mirror still exists.
- **Suggested follow‑up:** when convenient, migrate the pair‑consuming
  components to `fetchSupportedPairs()` (with a loading state) and delete the
  static array, so the frontend has no independent list at all.

---

## Appendix — Backend APIs the bot relies on
| Endpoint | Method | Auth | Bot use |
|---|---|---|---|
| `/api/user/bot-login` | POST | `BOT_SECRET` + password | Headless login (bypasses OTP). |
| `/api/user/balance` | GET | session | Read available base/quote for budget gating. |
| `/api/user/deposit` | POST | **admin** | Setup funding (dummy balances). |
| `/api/markets` | GET | public | CoinGecko‑proxied mid price (regular maker). |
| `/api/admin/static-coin` | GET | **admin** | Static‑coin config (range + current price). |
| `/api/trade/order` | POST | session (+admin to skip KYC) | Place a limit order. |
| `/api/trade/orders` | GET | session | List open/partially‑filled orders (paged) for cleanup. |
| `/api/trade/order/:id` | DELETE | session | Cancel an order (engine unlocks funds). |
| `/api/markets/pairs` | GET | public | *(new in Fix #10)* canonical supported pairs. |
