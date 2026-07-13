# AvgExchange — CoinMarketCap Market Data API

Public market-data endpoints in CoinMarketCap standardized format.
No authentication required. All endpoints return `application/json`.

**Base URL (production):**
```
https://avg-exchange-production.up.railway.app/api/cmc
```

Responses are cached for **60 seconds** in-memory. The `X-Cache` response header
indicates `HIT`, `MISS`, or `STALE age=Xs`.

---

## 1. `GET /api/cmc/summary`

Summary ticker for every active trading pair — 24-hour rolling statistics plus
live best bid/ask from the order book.

**Response:** Array of objects, one per supported pair.

```json
[
  {
    "trading_pairs":             "BTC_USDT",
    "base_currency":             "BTC",
    "quote_currency":            "USDT",
    "last_price":                64321.50,
    "lowest_ask":                64322.00,
    "highest_bid":               64321.00,
    "base_volume":               1.25,
    "quote_volume":              80401.88,
    "price_change_percent_24h":  1.42,
    "highest_price_24h":         65000.00,
    "lowest_price_24h":          63100.00
  }
]
```

| Field | Type | Description |
|---|---|---|
| `trading_pairs` | string | Pair key (underscore, e.g. `BTC_USDT`) |
| `base_currency` | string | Base asset symbol |
| `quote_currency` | string | Quote asset symbol |
| `last_price` | number | Price of the most recent trade; mid-price if no trades |
| `lowest_ask` | number | Best ask from the live order book (`0` if no liquidity) |
| `highest_bid` | number | Best bid from the live order book (`0` if no liquidity) |
| `base_volume` | number | 24h sum of trade quantities in base currency |
| `quote_volume` | number | 24h sum of `price × quantity` in USDT |
| `price_change_percent_24h` | number | `(last − first_trade_price) / first_trade_price × 100` |
| `highest_price_24h` | number | Max trade price in the last 24 hours |
| `lowest_price_24h` | number | Min trade price in the last 24 hours |

---

## 2. `GET /api/cmc/assets`

Metadata for every supported asset.

**Response:** Object keyed by symbol.

```json
{
  "BTC": {
    "name":                   "Bitcoin",
    "unified_cryptoasset_id": 1,
    "can_withdraw":           false,
    "can_deposit":            true,
    "min_withdraw":           0,
    "max_withdraw":           0,
    "maker_fee":              0,
    "taker_fee":              0
  }
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Full asset name |
| `unified_cryptoasset_id` | integer | CoinMarketCap's canonical asset ID |
| `can_withdraw` | boolean | `false` — withdrawals are currently admin-gated |
| `can_deposit` | boolean | `true` for supported deposit currencies |
| `min_withdraw` | number | Minimum withdrawal amount (`0` = N/A) |
| `max_withdraw` | number | Maximum withdrawal amount (`0` = N/A) |
| `maker_fee` | number | Maker trading fee (`0`) |
| `taker_fee` | number | Taker trading fee (`0`) |

**Supported assets:** BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, MATIC, LTC,
DOT, LINK, UNI, ATOM, TRX, USDT.

---

## 3. `GET /api/cmc/ticker`

Compact 24-hour ticker for all pairs. Keyed by CMC-format pair (underscore).

**Response:** Object keyed by pair.

```json
{
  "BTC_USDT": {
    "base_id":      1,
    "quote_id":     825,
    "last_price":   64321.50,
    "base_volume":  1.25,
    "quote_volume": 80401.88,
    "isFrozen":     0
  }
}
```

| Field | Type | Description |
|---|---|---|
| `base_id` | integer | CMC `unified_cryptoasset_id` of the base asset |
| `quote_id` | integer | CMC `unified_cryptoasset_id` of the quote asset (`825` = USDT) |
| `last_price` | number | Most recent trade price |
| `base_volume` | number | 24h volume in base currency |
| `quote_volume` | number | 24h volume in USDT |
| `isFrozen` | 0\|1 | `1` if the pair has no active book and no 24h trades |

---

## 4. `GET /api/cmc/orderbook/:market_pair`

Live order book snapshot from the matching engine's in-memory book.
The book reflects resting limit orders only; it does not include the last-trade
price.

**URL parameter:** `market_pair` — underscore pair, e.g. `BTC_USDT`.

**Query parameters:**

| Param | Default | Max | Description |
|---|---|---|---|
| `depth` | 50 | 200 | Max price levels per side |

**Response:**

```json
{
  "timestamp": 1719700000000,
  "bids": [
    ["64321.00", "0.5"],
    ["64320.00", "1.2"]
  ],
  "asks": [
    ["64322.00", "0.3"],
    ["64325.00", "2.0"]
  ]
}
```

Each level is `[price_string, amount_string]`. Bids are sorted highest-first,
asks lowest-first (best price at index 0).

---

## 5. `GET /api/cmc/trades/:market_pair`

Recent executed trades for a pair, from the `trades` table.

**URL parameter:** `market_pair` — underscore pair, e.g. `BTC_USDT`.

**Query parameters:**

| Param | Default | Max | Description |
|---|---|---|---|
| `limit` | 200 | 500 | Max number of trades returned |
| `window_hours` | 24 | 72 | Look-back window in hours |

**Response:** Array of trade objects, newest first.

```json
[
  {
    "trade_id":     12345,
    "price":        "64321.50",
    "base_volume":  "0.15",
    "quote_volume": "9648.23",
    "timestamp":    1719700000000,
    "type":         "buy"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `trade_id` | integer | Unique trade ID |
| `price` | string | Execution price |
| `base_volume` | string | Quantity traded in base currency |
| `quote_volume` | string | `price × base_volume` in USDT |
| `timestamp` | integer | Unix epoch milliseconds |
| `type` | `"buy"` \| `"sell"` | Taker (aggressor) side |

`type` is derived at read-time: the order with the later `created_at` is
treated as the taker. Resting maker orders are always placed before the
incoming taker, so this is accurate in normal operation.

---

## Supported Trading Pairs

All 15 base assets trade against USDT:

`BTC/USDT` · `ETH/USDT` · `BNB/USDT` · `SOL/USDT` · `XRP/USDT` ·
`ADA/USDT` · `DOGE/USDT` · `AVAX/USDT` · `MATIC/USDT` · `LTC/USDT` ·
`DOT/USDT` · `LINK/USDT` · `UNI/USDT` · `ATOM/USDT` · `TRX/USDT`

Use underscore form in URL parameters: `BTC_USDT`, `ETH_USDT`, etc.

---

## Error Responses

| HTTP | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Unknown market pair: XYZ_USDT" }` | Invalid / unsupported pair |
| `500` | `{ "error": "Failed to build summary" }` | Database or engine error |

---

*AvgExchange — centralized spot trading, crypto only.*

---

# CoinMarketCap Listing — Readiness Checklist

The table below maps every non-personal CMC exchange-listing form field to
what AvgExchange already has. Personal/relationship questions ("who are you to
the project", team bios, proof of identity) are excluded.

**Live deployment confirmed:**
- Frontend: `https://avgexchange.io` (Vercel)
- Backend: `https://avg-exchange-production.up.railway.app` (Railway)
- OxaPay sandbox: **false** (real crypto deposits wired)

---

## ✅ Done — answerable today

| CMC form field | Status | Source / URL |
|---|---|---|
| Type of request | Exchange integration | — |
| Project Name | AvgExchange | — |
| Previous names / aliases | NA | — |
| Website URL (all pairs, no login) | `https://avgexchange.io` | Public — Markets + Trade pages require no login |
| Trading pairs (count + list) | 15 pairs (BTC/USDT … TRX/USDT) | `config/pairs.js`; Trade page is public |
| Order book endpoint (public) | `GET /api/cmc/orderbook/:pair` ✅ | Built this session |
| Summary endpoint (public) | `GET /api/cmc/summary` ✅ | Built this session |
| Ticker endpoint (public) | `GET /api/cmc/ticker` ✅ | Built this session |
| Assets endpoint (public) | `GET /api/cmc/assets` ✅ | Built this session |
| Recent trades endpoint (public) | `GET /api/cmc/trades/:pair` ✅ | Built this session |
| API documentation URL | This file (host at public URL) | `backend/docs/cmc-api.md` |
| KYC | Yes — full KYC flow | `routes/kycRoutes.js` |
| Spot / Derivatives / OTC | Spot only; Derivatives = No; OTC = No | — |
| Open Interest methodology | NA (no futures) | — |
| Fiat deposits | NA — crypto/USDT only | Declare on form |
| Fiat withdrawals | NA — crypto only | Declare on form |
| Factory contract / chain / DEX | NA — CEX | — |
| Regulation / licence | NA (unless one exists — you confirm) | — |
| Cybersecurity measures | JWT, 2FA OTP, bcrypt, HMAC webhook verification, rate limiters, helmet, SQL `BEGIN/COMMIT` integrity, admin-gated withdrawals | Write a short blurb for the form |
| Trading incentives / wash trading | None — zero fees, no incentivized trading | — |
| Crypto deposits live | Yes | OxaPay, `OXAPAY_SANDBOX=false` |
| Shared liquidity / affiliated exchange | NA — own `nodejs-order-book` engine | — |
| Proof of Reserves & Liabilities | NA | Declare on form (see blockers below) |

---

## 🟡 Need a short write-up (data exists, not drafted)

| CMC form field | What's needed |
|---|---|
| Project Description (~500 words) | "Launched on [**you provide date**], AvgExchange is a CEX with 15 USDT spot pairs, full KYC, zero trading fees, crypto-only deposits via OxaPay." Draft and paste into the form. |
| Unique features | Admin static-coin feature, live matching engine, 2FA, zero fees. Write 2–3 sentences. |
| Trading fee structure | Fees are 0 — needs a hosted page that says so. |
| Deposit / withdrawal fee structure | Deposits via OxaPay (network fees apply); withdrawals currently admin-gated. Needs a hosted page. |
| Launch date, country, geography | **You provide** — not in code. |
| Office location | **You provide** — not in code. |

---

## ❌ Missing — must be built or gathered before submitting

| Item | Why it's required | Priority |
|---|---|---|
| **Twitter/X account** | Required field on CMC form | High |
| **Telegram or Discord** | Required "Chat 1" field on CMC form | High |
| **200×200 transparent PNG logo** | CMC rejects non-PNG / wrong-size logos | High |
| **Replace KuCoin favicon** | Current `favicon.ico` is leftover `kucoin-logo.jpg` — obvious copy-paste tell on a live site | High |
| **Hosted Terms of Service page** | Footer links are dead (`href="#"`) | Medium |
| **Fee schedule page** | Needed for fee fields; even "0% maker/taker" must be published | Medium |
| **Brand casing — pick one form** | UI shows Avg / AVG / AvgExchange / "Avg Exchange" inconsistently; CMC will see the live site | Medium |
| **Fix overstated marketing copy** | Copy claims "350+ cryptocurrencies" and fiat support — we have 15 USDT pairs and no fiat. CMC visits the live site. | High |
| **System status / health page** | Optional but requested on the CMC form | Low |

---

## ⚠️ Blockers — these need product decisions, not code

These cannot be papered over with form fields or endpoints. CMC's vetting
specifically targets them:

1. **Liquidity is bot-provided, backed by unbacked virtual USDT.**
   The order book is quoted by the market-maker bot and the rebalancer credits
   paper USDT — there are no real reserves behind it. CMC asks you to prove
   volume is real; this is exactly what they reject. *(Self-trade prevention is
   on, so it's not wash trading — but it's not organic volume either.)*
   **Fix:** real external settlement / real user liquidity.

2. **Withdrawals are disabled.**
   `processWithdrawal` fails closed unless an admin approves; there is no
   user-facing withdrawal route. Deposit-but-can't-withdraw is a red flag.
   *(The admin-gated security rule stays — this is a CMC-readiness note.)*
   **Fix:** enable user-initiated withdrawals with the admin-approval flow wired
   to a UI.

3. **Proof of Reserves can only be "NA"** — a direct consequence of (1).
   This itself is a negative signal to CMC reviewers.

**Bottom line:** even with every form field filled and every endpoint live, CMC
listing is gated on real traffic, organic liquidity, and working withdrawals —
not on form completeness. Close the blockers first, then submit.

---

## What was built this session

| File | What it does |
|---|---|
| `backend/services/cmcMarketData.js` | SQL aggregation (24h stats, last price, recent trades with taker-side derivation, orderbook reshaping) |
| `backend/routes/cmcRoutes.js` | All 6 public CMC endpoints + 60s `ApiCache` + `X-Cache` headers + pair validation |
| `backend/docs/cmc-api.md` | This file — full API reference + listing readiness inventory |
| `backend/server.js` | Mounted `cmcRoutes` at `/api/cmc` |
