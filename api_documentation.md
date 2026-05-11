# Avg-Exchange — Backend API Documentation

> **Base URL:** `https://your-domain.com/api`  
> **Protocol:** HTTPS + WSS  
> **Auth:** Session token set at login. Protected routes accept the token in **two ways**:
> - **Cookie** (web): HTTP-only cookie named `token` — pass `withCredentials: true` on every request
> - **Bearer header** (mobile/app): `Authorization: Bearer <token>` — use the `token` field returned in the login response body  
> **Session Expiry:** 3 hours (regular users), 30 days (bot accounts)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User](#2-user)
3. [KYC](#3-kyc)
4. [Market Data](#4-market-data)
5. [Trading](#5-trading)
6. [Payment & Deposits](#6-payment--deposits)
7. [Admin](#7-admin)
8. [WebSocket Events](#8-websocket-events)
9. [Error Format](#9-error-format)
10. [Rate Limits](#10-rate-limits)

---

## 1. Authentication

All auth endpoints are rate-limited: **100 requests per 15 minutes per IP**.

Authentication uses a **2-step OTP flow**. After submitting credentials, a 6-digit OTP is emailed. You must verify the OTP to receive the session cookie.

---

### `POST /api/user/signup` — Step 1: Register

Validates credentials, sends a 6-digit OTP to the email. OTP expires in **10 minutes**.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass@123",
  "referralCode": "MAXABC123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Full name |
| `email` | string | ✅ | Must be valid email |
| `password` | string | ✅ | Min 8 chars, must include uppercase, lowercase, number, symbol |
| `referralCode` | string | ❌ | Referral code of an existing user |

**Response `200`:**
```json
{ "otpSent": true, "email": "john@example.com" }
```

**Error responses:**
- `400` — Email already in use / invalid email / weak password

---

### `POST /api/user/verify-signup-otp` — Step 2: Verify & Create Account

**Request Body:**
```json
{
  "email": "john@example.com",
  "code": "482910"
}
```

**Response `200`:** Sets `token` cookie and returns:
```json
{
  "id": 42,
  "email": "john@example.com",
  "name": "John Doe",
  "referralCode": "MAXABC123",
  "isAdmin": false,
  "token": "<jwt>"
}
```

**Error responses:**
- `400` — Invalid OTP / OTP expired / already used

---

### `POST /api/user/login` — Step 1: Login

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass@123"
}
```

**Response `200`:**
```json
{ "otpSent": true, "email": "john@example.com" }
```

**Error responses:**
- `400` — Invalid credentials

---

### `POST /api/user/verify-login-otp` — Step 2: Verify Login OTP

**Request Body:**
```json
{
  "email": "john@example.com",
  "code": "391047"
}
```

**Response `200`:** Sets `token` cookie and returns:
```json
{
  "id": 42,
  "email": "john@example.com",
  "name": "John Doe",
  "referralCode": "MAXABC123",
  "isAdmin": false,
  "token": "<jwt>"
}
```

---

### `POST /api/user/logout`

Clears the session cookie.

**Response `200`:**
```json
{ "success": true }
```

---

### `POST /api/user/forgot-password`

Rate-limited: **5 requests per 15 minutes**. Always returns `200` to prevent email enumeration.

**Request Body:**
```json
{ "email": "john@example.com" }
```

**Response `200`:**
```json
{ "success": true, "message": "If an account with that email exists, a reset code has been sent." }
```

---

### `POST /api/user/reset-password`

Rate-limited: **5 requests per 15 minutes**.

**Request Body:**
```json
{
  "email": "john@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass@456"
}
```

**Response `200`:**
```json
{ "success": true, "message": "Password has been reset successfully. You can now log in." }
```

**Error responses:**
- `400` — Invalid/expired/already-used code, weak password

---

## 2. User

All routes require authentication — send `token` cookie (web) **or** `Authorization: Bearer <token>` header (mobile).

---

### `GET /api/user/me` — Get Current User Profile

**Response `200`:**
```json
{
  "id": 42,
  "name": "John Doe",
  "email": "john@example.com",
  "is_admin": false,
  "referral_code": "MAXABC123",
  "referral_count": 3,
  "created_at": "2025-01-01T00:00:00Z",
  "kyc_status": "approved",
  "kyc_submitted_at": "2025-01-02T00:00:00Z",
  "kyc_reviewed_at": "2025-01-03T00:00:00Z",
  "kyc_reviewer_note": null
}
```

| `kyc_status` values | Meaning |
|---|---|
| `null` | Not submitted |
| `pending` | Under review |
| `approved` | KYC passed — trading enabled |
| `rejected` | KYC rejected — can resubmit |

---

### `GET /api/user/balance` — Get Wallet Balances

**Response `200`:**
```json
{
  "USDT": { "available": 1000.50, "locked": 250.00 },
  "BTC":  { "available": 0.5, "locked": 0.0 },
  "ETH":  { "available": 2.3, "locked": 0.0 }
}
```

- `available` — funds free to trade/withdraw
- `locked` — funds reserved for open orders

---

### `POST /api/user/change-password`

**Request Body:**
```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewPass@456"
}
```

**Response `200`:**
```json
{ "success": true }
```

**Error responses:**
- `400` — Current password incorrect / new password too weak

---

## 3. KYC

All routes require authentication — send `token` cookie (web) **or** `Authorization: Bearer <token>` header (mobile). KYC approval is required before trading.

---

### `GET /api/kyc/status` — Get KYC Status

**Response `200`:**
```json
{
  "status": "pending",
  "submitted_at": "2025-01-02T00:00:00Z",
  "reviewed_at": null,
  "reviewer_note": null
}
```

Returns `{ "status": "none" }` if never submitted.

---

### `GET /api/kyc/upload-url` — Get Presigned S3 Upload URL

The client uses this URL to upload the ID document **directly to S3** (no file goes through the backend server).

**Query Parameters:**

| Param | Type | Required | Example |
|---|---|---|---|
| `filename` | string | ✅ | `passport.jpg` |
| `contentType` | string | ✅ | `image/jpeg` |

**Response `200`:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/kyc/42/1234567890.jpg?...",
  "key": "kyc/42/1234567890.jpg"
}
```

**Upload flow:**
1. Call this endpoint to get `uploadUrl` and `key`
2. `PUT` the file bytes directly to `uploadUrl` with the correct `Content-Type` header
3. Submit the `key` to `/api/kyc/submit`

---

### `POST /api/kyc/submit` — Submit KYC Application

**Request Body (JSON):**
```json
{
  "full_name": "John Doe",
  "date_of_birth": "1990-05-15",
  "document_type": "passport",
  "document_number": "A12345678",
  "document_key": "kyc/42/1234567890.jpg"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `full_name` | string | ✅ | Legal name |
| `date_of_birth` | string | ✅ | `YYYY-MM-DD` format |
| `document_type` | string | ✅ | `passport`, `national_id`, `driver_license` |
| `document_number` | string | ✅ | ID number |
| `document_key` | string | ✅ | S3 key from `/upload-url` |

**Response `200`:**
```json
{
  "success": true,
  "submission": { "id": 10, "status": "pending", "submitted_at": "2025-01-02T00:00:00Z" }
}
```

**Error responses:**
- `400` — Missing fields / invalid document type / KYC already approved

---

## 4. Market Data

Public endpoints — no authentication required.

---

### `GET /api/markets` — CoinGecko Market List (Cached 60s)

**Query Parameters:**

| Param | Default | Notes |
|---|---|---|
| `vs_currency` | `usd` | Quote currency |
| `per_page` | `15` | Max 250 |
| `page` | `1` | Pagination |
| `order` | `market_cap_desc` | Sort order |

**Response `200`:** Array of CoinGecko coin objects:
```json
[
  {
    "id": "bitcoin",
    "symbol": "btc",
    "name": "Bitcoin",
    "image": "https://...",
    "current_price": 65000,
    "price_change_percentage_24h": 2.5,
    "high_24h": 66000,
    "low_24h": 63000,
    "total_volume": 28000000000,
    "market_cap": 1270000000000
  }
]
```

Response header `X-Cache: HIT | MISS | STALE` indicates cache status.

---

### `GET /api/markets/live` — Real-Time Binance Tickers

**Response `200`:**
```json
{
  "BTC": {
    "symbol": "BTC",
    "price": 65123.45,
    "open24h": 63600.00,
    "change24h": 2.31,
    "high24h": 66000,
    "low24h": 63500,
    "volume24h": 12345.67,
    "ts": 1746700000000
  },
  "ETH": { ... }
}
```

**Response `503`** — Stream still connecting (retry in ~1 second).

---

### `GET /api/markets/static-coin` — Custom Static Coin Price

Returns the custom coin configured by the admin (e.g., AVG token).

**Response `200`:**
```json
{
  "symbol": "AVG",
  "min_price": "0.50",
  "max_price": "2.00",
  "current_price": "1.25",
  "price_24h_ago": "1.10"
}
```

Returns `null` if no static coin is enabled.

---

### `GET /api/crypto/listings` — CoinMarketCap Price List (Cached 60s)

Returns top coins from CoinMarketCap. Primarily used on the Markets page to show prices in INR.

**Query Parameters:**

| Param | Default | Max |
|---|---|---|
| `convert` | `INR` | Any CMC-supported currency (e.g. `USD`, `INR`) |
| `limit` | `50` | `200` |

**Response `200`:** Array of CoinMarketCap coin objects:
```json
[
  {
    "id": 1,
    "name": "Bitcoin",
    "symbol": "BTC",
    "quote": {
      "INR": {
        "price": 5400000.0,
        "percent_change_24h": 2.31,
        "market_cap": 105000000000000,
        "volume_24h": 2300000000000
      }
    }
  }
]
```

Response header `X-Cache: HIT | MISS | STALE` indicates cache status.

---

## 5. Trading

All routes require authentication — send `token` cookie (web) **or** `Authorization: Bearer <token>` header (mobile). **KYC approval is required to place orders** (admin accounts exempt).

Rate limit: **300 orders per minute** per user (unlimited for admin).

---

### `GET /api/trade/orderbook` — Get Order Book (Public)

**Query Parameters:**

| Param | Required | Example |
|---|---|---|
| `pair` | ✅ | `BTC/USDT` |

**Supported pairs:**
`BTC/USDT`, `ETH/USDT`, `BNB/USDT`, `SOL/USDT`, `XRP/USDT`, `ADA/USDT`, `DOGE/USDT`, `AVAX/USDT`, `MATIC/USDT`, `LTC/USDT`, `DOT/USDT`, `LINK/USDT`, `UNI/USDT`, `ATOM/USDT`, `TRX/USDT`

**Response `200`:**
```json
{
  "asks": [
    [65200.00, 0.5],
    [65250.00, 1.2]
  ],
  "bids": [
    [65100.00, 0.8],
    [65050.00, 2.0]
  ]
}
```

Each entry is `[price, quantity]`. Asks are sorted ascending, bids descending.

---

### `POST /api/trade/order` — Place Order

**Request Body:**
```json
{
  "pair": "BTC/USDT",
  "side": "buy",
  "type": "limit",
  "price": "65000",
  "quantity": "0.01"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `pair` | string | ✅ | e.g. `BTC/USDT` |
| `side` | string | ✅ | `buy` or `sell` |
| `type` | string | ✅ | `limit` or `market` |
| `price` | string/number | ✅ for limit | Price per unit in USDT |
| `quantity` | string/number | ✅ | Amount of base currency |

**Balance locked on order placement:**
- **Buy:** `price × quantity` USDT is locked
- **Sell:** `quantity` of the base coin is locked

**Response `201`:**
```json
{
  "order": {
    "id": 1001,
    "user_id": 42,
    "pair": "BTC/USDT",
    "side": "buy",
    "type": "limit",
    "price": "65000.0000000000",
    "quantity": "0.0100000000",
    "remaining_quantity": "0.0100000000",
    "status": "open",
    "created_at": "2025-01-01T12:00:00Z"
  },
  "executedTrades": [
    {
      "id": 500,
      "pair": "BTC/USDT",
      "price": "65000",
      "quantity": "0.01",
      "buyer_id": 42,
      "seller_id": 7,
      "executed_at": "2025-01-01T12:00:00Z"
    }
  ],
  "quantityLeft": 0
}
```

- `executedTrades` — trades that matched immediately
- `quantityLeft` — quantity still resting in the book (limit) or unfilled (market)

**Error responses:**
- `400` — Insufficient balance / invalid pair or side / no liquidity (market order)
- `403` — KYC not approved

---

### `DELETE /api/trade/order/:id` — Cancel Order

Rate limit: **600 requests per minute**.

**Response `200`:**
```json
{ "success": true, "refunded": { "currency": "USDT", "amount": 650 } }
```

**Error responses:**
- `404` — Order not found
- `403` — Not your order

---

### `GET /api/trade/orders` — My Orders (Last 50)

**Response `200`:** Array of order objects:
```json
[
  {
    "id": 1001,
    "pair": "BTC/USDT",
    "side": "buy",
    "type": "limit",
    "price": "65000.0000000000",
    "quantity": "0.0100000000",
    "remaining_quantity": "0.0000000000",
    "status": "filled",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:05Z"
  }
]
```

| `status` values | Meaning |
|---|---|
| `open` | Resting in the order book |
| `partially_filled` | Some quantity matched |
| `filled` | Fully executed |
| `cancelled` | Cancelled by user |

---

### `GET /api/trade/trades` — My Trade History (Last 50)

**Response `200`:**
```json
[
  {
    "id": 500,
    "buy_order_id": 1001,
    "sell_order_id": 990,
    "buyer_id": 42,
    "seller_id": 7,
    "pair": "BTC/USDT",
    "price": "65000.0000000000",
    "quantity": "0.0100000000",
    "executed_at": "2025-01-01T12:00:05Z"
  }
]
```

---

## 6. Payment & Deposits

All routes (except `/callback` and `/static/callback`) require authentication.

Rate limit: **5 invoice/whitelabel requests per minute** per user.

---

### `POST /api/payment/whitelabel` — Create Crypto Deposit (Recommended)

User stays on site. Returns a blockchain address and QR code to send funds to.

**Request Body:**
```json
{
  "currency": "USDT",
  "network": "TRX",
  "amount": 100
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | ✅ | `USDT`, `BTC`, `ETH`, `BNB`, `SOL`, `TRX`, `LTC` |
| `network` | string | ✅ | Blockchain network (see table below) |
| `amount` | number | ✅ | Amount in **USD** — OxaPay converts to crypto at live rate |

**Supported currency/network combinations:**

| Currency | Networks |
|---|---|
| USDT | TRX, ETH, BSC |
| BTC | BTC |
| ETH | ETH |
| BNB | BSC |
| SOL | SOL |
| TRX | TRX |
| LTC | LTC |

**Response `200`:**
```json
{
  "trackId": "abc123xyz",
  "address": "TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "memo": null,
  "payAmount": "100.500000",
  "payCurrency": "USDT",
  "network": "Tron (TRC-20)",
  "networkCode": "TRX",
  "qrCode": "data:image/png;base64,...",
  "expiredAt": 1746703600,
  "rate": "1.00"
}
```

- Poll `/api/payment/status/:trackId` every 5 seconds to check payment confirmation.

---

### `POST /api/payment/invoice` — Create OxaPay Invoice (Redirect Flow)

Redirects user to OxaPay checkout page.

**Request Body:**
```json
{
  "currency": "USDT",
  "amount": 100
}
```

**Response `200`:**
```json
{
  "trackId": "abc123xyz",
  "payLink": "https://oxapay.com/pay/abc123xyz",
  "currency": "USDT",
  "amount": 100
}
```

Redirect the user to `payLink`. Poll `/api/payment/status/:trackId` after return.

---

### `GET /api/payment/status/:trackId` — Poll Payment Status

**Response `200`:**
```json
{
  "track_id": "abc123xyz",
  "currency": "USDT",
  "amount": "100.5000000000",
  "status": "Paid",
  "credited": true,
  "payment_url": "https://oxapay.com/pay/abc123xyz",
  "created_at": "2025-01-01T12:00:00Z",
  "payment_type": "whitelabel"
}
```

| `status` values | Meaning |
|---|---|
| `pending` / `Waiting` | Awaiting payment |
| `Paid` | Payment confirmed — balance credited |
| `Underpaid` | Amount received was less than expected |
| `Expired` | Payment window closed |
| `Error` | Payment failed |

When `status === "Paid"` and `credited === true`, the user's wallet balance has been updated.

---

### `GET /api/payment/networks` — Supported Networks

**Response `200`:**
```json
{
  "USDT": ["TRX", "ETH", "BSC"],
  "BTC": ["BTC"],
  "ETH": ["ETH"],
  "BNB": ["BSC"],
  "SOL": ["SOL"],
  "TRX": ["TRX"],
  "LTC": ["LTC"]
}
```

---

### `POST /api/payment/callback` ⚠️ Internal — OxaPay Only

Public webhook called by OxaPay servers. HMAC-verified. Do not call from client.

---

## 7. Admin

All routes require authentication **and** admin privileges (`is_admin = true`). Send `token` cookie (web) **or** `Authorization: Bearer <token>` header (mobile).

---

### `GET /api/admin/stats` — Dashboard Statistics

**Response `200`:**
```json
{
  "totalUsers": 120,
  "openOrders": 340,
  "totalTrades": 5600,
  "pendingKyc": 8,
  "totalVolumeUSD": 2500000.00
}
```

---

### `GET /api/admin/users` — List All Users (Last 200)

**Response `200`:** Array of user objects with balances:
```json
[
  {
    "id": 42,
    "name": "John Doe",
    "email": "john@example.com",
    "is_admin": false,
    "created_at": "2025-01-01T00:00:00Z",
    "kyc_status": "approved",
    "balances": { "USDT": "1250.50", "BTC": "0.5" }
  }
]
```

---

### `GET /api/admin/users/:userId` — Full User Detail

**Response `200`:**
```json
{
  "user": { "id": 42, "name": "John Doe", "email": "...", "kyc_status": "approved", ... },
  "balances": [
    { "currency": "USDT", "available": 1000.0, "locked": 250.0 }
  ],
  "orders": [ ...last 20 orders... ],
  "trades": [ ...last 20 trades... ]
}
```

---

### `PATCH /api/admin/users/:userId/toggle-admin` — Toggle Admin Status

Cannot be used on your own account.

**Response `200`:**
```json
{ "success": true, "is_admin": true }
```

---

### `POST /api/admin/users/:userId/add-balance` — Manually Credit User Balance

**Request Body:**
```json
{
  "currency": "USDT",
  "amount": 500
}
```

**Response `200`:**
```json
{ "success": true }
```

---

### `GET /api/admin/kyc` — List KYC Submissions

Returns pending submissions first, then others. Max 200 records.

**Response `200`:** Array of KYC records including user email, document details, and review status.

---

### `POST /api/admin/kyc/:userId/approve` — Approve KYC

**Response `200`:**
```json
{ "success": true }
```

---

### `POST /api/admin/kyc/:userId/reject` — Reject KYC

**Request Body:**
```json
{ "note": "Document image is blurry" }
```

**Response `200`:**
```json
{ "success": true }
```

---

### `GET /api/admin/kyc/:userId/document` — View KYC Document

Redirects to a presigned S3 URL for the user's uploaded ID document. Link is short-lived.

---

### `GET /api/admin/orders` — Paginated Order List

**Query Parameters:**

| Param | Default | Max |
|---|---|---|
| `page` | `1` | — |
| `limit` | `50` | `100` |

**Response `200`:**
```json
{
  "orders": [ ...order objects with user email/name... ],
  "total": 5600,
  "page": 1,
  "limit": 50,
  "pages": 112
}
```

---

### `GET /api/admin/static-coin` — Get Custom Coin Config

**Response `200`:**
```json
{
  "id": 1,
  "symbol": "AVG",
  "min_price": 0.50,
  "max_price": 2.00,
  "current_price": 1.25,
  "enabled": true,
  "price_24h_ago": 1.10,
  "updated_at": "2025-01-01T00:00:00Z"
}
```

Returns `null` if not configured.

---

### `PUT /api/admin/static-coin` — Create or Update Custom Coin

**Request Body:**
```json
{
  "symbol": "AVG",
  "min_price": 0.50,
  "max_price": 2.00,
  "current_price": 1.25,
  "enabled": true
}
```

**Validation rules:**
- `min_price` must be > 0
- `max_price` must be > `min_price`
- `current_price` must be between `min_price` and `max_price`

**Response `200`:** Updated static coin config object.

---

## 8. WebSocket Events

Connect to the WebSocket server at the same host.

**Web (cookie auth):**
```js
const socket = io('https://your-domain.com', { withCredentials: true });
```

**Mobile/App (token auth):**
```js
const socket = io('https://your-domain.com', {
  auth: { token: '<jwt_token_from_login_response>' }
});
```

If authenticated, the socket automatically joins the user's private room and receives private events.

---

### Public Events (received by all connected clients)

| Event | Payload | Description |
|---|---|---|
| `depth_update` | `{ pair, asks: [[price,qty],...], bids: [[price,qty],...] }` | Internal order book snapshot — fires after every order place/cancel/fill |
| `binance:ticker` | `{ symbol, price, open24h, high24h, low24h, volume24h, change24h, ts }` | Binance real-time price ticker (fires on every price change) |
| `binance:depth` | `{ symbol, bids: [[price,qty],...], asks: [[price,qty],...] }` | Binance top-10 order book snapshot (100ms cadence) |
| `binance:trade` | `{ symbol, price, qty, isBuyerMaker, time }` | Individual trade from Binance — `isBuyerMaker: true` = red (sell), `false` = green (buy) |
| `binance:kline` | `{ symbol, interval, time, open, high, low, close, volume, closed }` | 1-minute OHLCV candle — `closed: true` means candle period is final |
| `admin:refresh` | _(no payload)_ | Fires after any order event — admin dashboard should refresh its stats |

---

### Private Events (received only by the authenticated user)

| Event | Payload | Description |
|---|---|---|
| `balance_update` | `{ userId }` | Fires when one of the user's orders is filled — re-fetch `/api/user/balance` |

---

## 9. Error Format

All errors return a consistent JSON object:

```json
{ "error": "Human-readable error message" }
```

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — validation failed |
| `401` | Not authenticated |
| `403` | Forbidden — requires admin / KYC not approved |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service temporarily unavailable |

---

## 10. Rate Limits

| Route Group | Limit | Window |
|---|---|---|
| Auth (login, signup, OTP) | 100 requests | 15 minutes |
| Forgot/reset password | 5 requests | 15 minutes |
| Order placement | 300 requests | 1 minute |
| Order cancellation | 600 requests | 1 minute |
| Payment/invoice creation | 5 requests | 1 minute |

Rate limit headers are included in responses:
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

When exceeded: `429 Too Many Requests` with `{ "error": "Too many requests..." }`.
