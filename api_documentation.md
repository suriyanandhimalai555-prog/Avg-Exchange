# AvgExchange — API Documentation

**Version:** 1.0  
**Base URL:** `https://<your-domain>`  
**API Prefix:** `/api`  
**Content-Type:** `application/json`  
**Last Updated:** August 2026

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Error Handling](#2-error-handling)
3. [Rate Limiting](#3-rate-limiting)
4. [User & Auth Endpoints](#4-user--auth-endpoints)
5. [KYC Endpoints](#5-kyc-endpoints)
6. [Trading Endpoints](#6-trading-endpoints)
7. [Market Data Endpoints](#7-market-data-endpoints)
8. [Payment & Deposit Endpoints](#8-payment--deposit-endpoints)
9. [Crypto Listings Endpoints](#9-crypto-listings-endpoints)
10. [DEX Swap (1inch) Endpoints](#10-dex-swap-1inch-endpoints)
11. [CoinMarketCap Public Data Endpoints](#11-coinmarketcap-public-data-endpoints)
12. [Admin Endpoints](#12-admin-endpoints)
13. [WebSocket (Real-Time) Events](#13-websocket-real-time-events)
14. [Data Models & Enums](#14-data-models--enums)
15. [Supported Trading Pairs & Currencies](#15-supported-trading-pairs--currencies)

---

## 1. Authentication

All authenticated endpoints require a JWT token. The token can be provided in **two ways** (mobile clients should use the Bearer header):

| Method | Format | Notes |
|---|---|---|
| **Authorization Header** | `Authorization: Bearer <token>` | **Recommended for mobile** |
| **Cookie** | `token=<jwt>` | Set automatically by login endpoints |

### Token Lifecycle

| Property | Value |
|---|---|
| Algorithm | HS256 (JWT) |
| User Session Expiry | 3 hours |
| OTP Code Expiry | 10 minutes |
| Password Reset Code Expiry | 15 minutes |

### Auth Flow (OTP-Based — Two-Step)

The authentication uses a **two-step OTP verification** flow for both login and signup:

```
┌─────────────────────────────────────────────────────┐
│                    LOGIN FLOW                       │
│                                                     │
│  Step 1: POST /api/user/login                       │
│          → Validates credentials                    │
│          → Sends 6-digit OTP to email               │
│          → Returns { otpSent: true }                │
│                                                     │
│  Step 2: POST /api/user/verify-login-otp            │
│          → Validates OTP code                       │
│          → Returns user object + JWT token          │
│          → Sets httpOnly cookie                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   SIGNUP FLOW                       │
│                                                     │
│  Step 1: POST /api/user/signup                      │
│          → Validates input + checks uniqueness      │
│          → Sends 6-digit OTP to email               │
│          → Returns { otpSent: true }                │
│                                                     │
│  Step 2: POST /api/user/verify-signup-otp           │
│          → Validates OTP code                       │
│          → Creates user account                     │
│          → Returns user object + JWT token          │
│          → Sets httpOnly cookie                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. Error Handling

All error responses follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

### Standard HTTP Status Codes

| Code | Meaning | When |
|---|---|---|
| `200` | Success | Request completed successfully |
| `201` | Created | New resource created (e.g., order placed) |
| `400` | Bad Request | Validation errors, insufficient funds, invalid input |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | KYC not approved / not your resource / admin-only |
| `404` | Not Found | Resource does not exist |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | External service not ready (e.g., Binance stream connecting) |

---

## 3. Rate Limiting

Rate limits are enforced per endpoint group. When exceeded, a `429` response is returned.

| Endpoint Group | Window | Max Requests | Key |
|---|---|---|---|
| Auth (login/signup/OTP) | 15 minutes | 100 | IP address |
| OTP Verification | 15 minutes | 5 (failures only) | Email address |
| Forgot/Reset Password | 15 minutes | 5 | IP address |
| Place Order | 1 minute | 300 | User ID |
| Cancel Order | 1 minute | 600 | User ID |
| Create Invoice | 1 minute | 5 | User ID |
| CMC Market Data | 1 minute | 120 | IP address |

Rate limit response headers (standard `RateLimit-*` headers):
- `RateLimit-Limit` — max requests allowed
- `RateLimit-Remaining` — requests remaining
- `RateLimit-Reset` — seconds until window resets

---

## 4. User & Auth Endpoints

### 4.1 Login — Step 1 (Request OTP)

```
POST /api/user/login
```

**Auth Required:** No  
**Rate Limit:** authLimiter (100 req / 15 min)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | User's email address |
| `password` | string | ✅ | User's password |

**Success Response (200):**

```json
{
  "otpSent": true,
  "email": "user@example.com"
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"All fields must be filled"` |
| `400` | `"Invalid credentials"` |

---

### 4.2 Login — Step 2 (Verify OTP)

```
POST /api/user/verify-login-otp
```

**Auth Required:** No  
**Rate Limit:** authLimiter + otpVerifyLimiter (5 failed attempts / 15 min per email)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | Email used in Step 1 |
| `code` | string | ✅ | 6-digit OTP received via email |

**Success Response (200):**

```json
{
  "id": 42,
  "email": "user@example.com",
  "name": "John Doe",
  "referralCode": "MAX8F2A9B",
  "isAdmin": false,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

> **Mobile Note:** Store the `token` value from the response body and include it as `Authorization: Bearer <token>` in all subsequent authenticated requests.

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"Email and OTP code are required"` |
| `400` | `"Invalid or expired OTP"` |
| `400` | `"This OTP has already been used. Please log in again."` |
| `400` | `"OTP has expired. Please log in again."` |
| `400` | `"Invalid OTP code"` |

---

### 4.3 Signup — Step 1 (Request OTP)

```
POST /api/user/signup
```

**Auth Required:** No  
**Rate Limit:** authLimiter (100 req / 15 min)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | User's full name |
| `email` | string | ✅ | User's email address |
| `password` | string | ✅ | Must be strong (min 8 chars, uppercase, lowercase, number, symbol) |
| `referralCode` | string | ❌ | Optional referral code (format: `MAX` + 6 alphanumeric chars) |

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 symbol

**Success Response (200):**

```json
{
  "otpSent": true,
  "email": "newuser@example.com"
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"All fields must be filled"` |
| `400` | `"Email not valid"` |
| `400` | `"Password not strong enough"` |
| `400` | `"Email already in use"` |

---

### 4.4 Signup — Step 2 (Verify OTP)

```
POST /api/user/verify-signup-otp
```

**Auth Required:** No  
**Rate Limit:** authLimiter + otpVerifyLimiter

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | Email used in Step 1 |
| `code` | string | ✅ | 6-digit OTP received via email |

**Success Response (200):**

```json
{
  "id": 43,
  "email": "newuser@example.com",
  "name": "Jane Smith",
  "referralCode": "MAXK7R3P2",
  "isAdmin": false,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"Email and OTP code are required"` |
| `400` | `"Invalid or expired OTP"` |
| `400` | `"This OTP has already been used. Please sign up again."` |
| `400` | `"OTP has expired. Please sign up again."` |
| `400` | `"Invalid OTP code"` |
| `400` | `"Email already in use"` |

---

### 4.5 Logout

```
POST /api/user/logout
```

**Auth Required:** No

**Success Response (200):**

```json
{
  "success": true
}
```

> **Mobile Note:** On logout, clear the stored JWT token from local storage / keychain.

---

### 4.6 Get Profile

```
GET /api/user/me
```

**Auth Required:** ✅

**Success Response (200):**

```json
{
  "id": 42,
  "name": "John Doe",
  "email": "user@example.com",
  "is_admin": false,
  "referral_code": "MAX8F2A9B",
  "referral_count": 5,
  "created_at": "2026-01-15T08:30:00.000Z",
  "kyc_status": "approved",
  "kyc_submitted_at": "2026-01-16T10:00:00.000Z",
  "kyc_reviewed_at": "2026-01-17T12:00:00.000Z",
  "kyc_reviewer_note": null
}
```

> **Note:** `kyc_status` can be `null` (never submitted), `"pending"`, `"approved"`, or `"rejected"`.

---

### 4.7 Get Balances

```
GET /api/user/balance
```

**Auth Required:** ✅

**Success Response (200):**

```json
{
  "USDT": {
    "available": 1500.25,
    "locked": 200.00
  },
  "BTC": {
    "available": 0.5,
    "locked": 0.1
  },
  "ETH": {
    "available": 10.0,
    "locked": 0.0
  }
}
```

> **Note:** Only currencies with non-zero balances are returned. Each currency has an `available` balance (for trading/withdrawal) and a `locked` balance (funds reserved by open orders).

---

### 4.8 Change Password

```
POST /api/user/change-password
```

**Auth Required:** ✅

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `currentPassword` | string | ✅ | The user's current password |
| `newPassword` | string | ✅ | Must meet strong password requirements |

**Success Response (200):**

```json
{
  "success": true
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"Both current and new password are required"` |
| `400` | `"New password must be at least 8 characters and include uppercase, lowercase, number, and symbol"` |
| `400` | `"Current password is incorrect"` |

---

### 4.9 Forgot Password — Request Reset Code

```
POST /api/user/forgot-password
```

**Auth Required:** No  
**Rate Limit:** forgotPasswordLimiter (5 req / 15 min)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | The account email address |

**Success Response (200):**

```json
{
  "success": true,
  "message": "If an account with that email exists, a reset code has been sent."
}
```

> **Security Note:** This endpoint always returns success (even for non-existent emails) to prevent email enumeration.

---

### 4.10 Reset Password — Verify Code & Set New Password

```
POST /api/user/reset-password
```

**Auth Required:** No  
**Rate Limit:** forgotPasswordLimiter (5 req / 15 min)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | The account email address |
| `code` | string | ✅ | 6-digit reset code from email |
| `newPassword` | string | ✅ | Must meet strong password requirements |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password has been reset successfully. You can now log in."
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"Email, code, and new password are required"` |
| `400` | `"Password must be at least 8 characters and include uppercase, lowercase, number, and symbol"` |
| `400` | `"Invalid or expired reset code"` |
| `400` | `"This reset code has already been used. Please request a new one."` |
| `400` | `"Reset code has expired. Please request a new one."` |
| `400` | `"Invalid reset code"` |

---

## 5. KYC Endpoints

All KYC endpoints require authentication. KYC must be approved before a user can trade.

### 5.1 Get KYC Status

```
GET /api/kyc/status
```

**Auth Required:** ✅

**Success Response (200) — Not Submitted:**

```json
{
  "status": "none"
}
```

**Success Response (200) — Submitted:**

```json
{
  "status": "pending",
  "submitted_at": "2026-03-10T14:30:00.000Z",
  "reviewed_at": null,
  "reviewer_note": null
}
```

**Possible `status` values:** `"none"`, `"pending"`, `"approved"`, `"rejected"`

---

### 5.2 Get Presigned Upload URL

```
GET /api/kyc/upload-url
```

**Auth Required:** ✅

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `filename` | string | ✅ | Original file name (e.g., `passport.jpg`) |
| `contentType` | string | ✅ | MIME type (e.g., `image/jpeg`, `image/png`, `application/pdf`) |

**Success Response (200):**

```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/kyc/42/1693000000.jpg?X-Amz-...",
  "key": "kyc/42/1693000000.jpg"
}
```

**Upload Flow:**
1. Call this endpoint to get a presigned S3 URL.
2. `PUT` the file directly to the `uploadUrl` with the `Content-Type` header matching `contentType`.
3. Use the `key` value in the `POST /api/kyc/submit` request.

---

### 5.3 Submit KYC

```
POST /api/kyc/submit
```

**Auth Required:** ✅

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `full_name` | string | ✅ | Legal full name as shown on document |
| `date_of_birth` | string | ✅ | Date of birth (ISO format: `YYYY-MM-DD`) |
| `document_type` | string | ✅ | One of: `passport`, `national_id`, `driver_license` |
| `document_number` | string | ✅ | Document identification number |
| `document_key` | string | ✅ | S3 key from the upload-url step |

**Success Response (200):**

```json
{
  "success": true,
  "submission": {
    "id": 15,
    "status": "pending",
    "submitted_at": "2026-03-10T14:35:00.000Z"
  }
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"All fields are required"` |
| `400` | `"Document upload is required — upload the file first"` |
| `400` | `"Invalid document type. Must be one of: passport, national_id, driver_license"` |
| `400` | `"Invalid document key"` |
| `400` | `"KYC already approved. Contact support if you need to update your documents."` |

> **Note:** If a previous submission was rejected, re-submitting will overwrite the old submission and reset status to `"pending"`.

---

## 6. Trading Endpoints

All trading endpoints (except the public orderbook) require authentication.

### 6.1 Get Order Book (Public)

```
GET /api/trade/orderbook
```

**Auth Required:** No

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `pair` | string | ✅ | Trading pair (e.g., `BTC/USDT`) |

**Success Response (200):**

```json
{
  "asks": [
    [67150.50, 0.25],
    [67200.00, 1.50]
  ],
  "bids": [
    [67100.00, 0.80],
    [67050.00, 2.10]
  ]
}
```

> Each entry is `[price, quantity]`. `asks` are sorted low → high, `bids` are sorted high → low.

**Error Response:**

| Code | Error |
|---|---|
| `400` | `"pair query param required (e.g. ?pair=BTC/USDT)"` |

---

### 6.2 Place Order

```
POST /api/trade/order
```

**Auth Required:** ✅  
**Rate Limit:** orderLimiter (300 req / 1 min per user)  
**KYC Required:** ✅ (must have `approved` KYC status)

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `pair` | string | ✅ | Trading pair (e.g., `BTC/USDT`) |
| `side` | string | ✅ | `"buy"` or `"sell"` |
| `type` | string | ❌ | `"limit"` (default) or `"market"` |
| `price` | string/number | ✅ for limit | Order price (required for limit orders, ignored for market) |
| `quantity` | string/number | ✅ | Amount of base currency to buy/sell |

**How Locking Works:**
- **Buy orders:** `price × quantity` of the quote currency (USDT) is locked.
- **Sell orders:** `quantity` of the base currency is locked.

**Success Response (201):**

```json
{
  "order": {
    "id": 1234,
    "user_id": 42,
    "pair": "BTC/USDT",
    "side": "buy",
    "type": "limit",
    "price": "67000.0000000000",
    "quantity": "0.5000000000",
    "remaining_quantity": "0.5000000000",
    "status": "open",
    "created_at": "2026-08-21T10:30:00.000Z",
    "updated_at": "2026-08-21T10:30:00.000Z"
  },
  "executedTrades": [
    {
      "id": 567,
      "buy_order_id": 1234,
      "sell_order_id": 1200,
      "buyer_id": 42,
      "seller_id": 55,
      "pair": "BTC/USDT",
      "price": "67000.0000000000",
      "quantity": "0.2000000000",
      "executed_at": "2026-08-21T10:30:00.100Z"
    }
  ],
  "quantityLeft": 0.3
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"pair, side, and quantity are required"` |
| `400` | `"side must be \"buy\" or \"sell\""` |
| `400` | `"type must be \"limit\" or \"market\""` |
| `400` | `"price is required for limit orders"` |
| `400` | `"Pair must be in format SYMBOL/USDT (e.g. BTC/USDT)"` |
| `400` | `"Insufficient {CURRENCY} balance (available: X, required: Y)"` |
| `400` | `"No liquidity on the {side} side for a market order"` |
| `400` | `"Market order could not be filled — insufficient liquidity"` |
| `403` | `"KYC verification required to trade. Please complete your KYC in Account settings."` |

---

### 6.3 Cancel Order

```
DELETE /api/trade/order/:id
```

**Auth Required:** ✅  
**Rate Limit:** cancelLimiter (600 req / 1 min per user)

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | integer | ✅ | The order ID to cancel |

**Success Response (200):**

```json
{
  "cancelled": true,
  "orderId": 1234,
  "unlockedAmount": "33500.0000000000",
  "currency": "USDT"
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `404` | `"Order not found"` |
| `403` | `"Not your order"` |

---

### 6.4 Get My Orders

```
GET /api/trade/orders
```

**Auth Required:** ✅

**Query Parameters (all optional):**

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Comma-separated statuses: `open`, `partially_filled`, `filled`, `cancelled` |
| `pair` | string | — | Exact pair filter (e.g., `BTC/USDT`) |
| `limit` | integer | 50 | Max rows to return (range: 1–1000) |

**Example:** `GET /api/trade/orders?status=open,partially_filled&pair=BTC/USDT&limit=20`

**Success Response (200):**

```json
[
  {
    "id": 1234,
    "user_id": 42,
    "pair": "BTC/USDT",
    "side": "buy",
    "type": "limit",
    "price": "67000.0000000000",
    "quantity": "0.5000000000",
    "remaining_quantity": "0.3000000000",
    "status": "partially_filled",
    "created_at": "2026-08-21T10:30:00.000Z",
    "updated_at": "2026-08-21T10:31:00.000Z"
  }
]
```

---

### 6.5 Get My Trade History

```
GET /api/trade/trades
```

**Auth Required:** ✅

**Success Response (200):**

```json
[
  {
    "id": 567,
    "buy_order_id": 1234,
    "sell_order_id": 1200,
    "buyer_id": 42,
    "seller_id": 55,
    "pair": "BTC/USDT",
    "price": "67000.0000000000",
    "quantity": "0.2000000000",
    "executed_at": "2026-08-21T10:30:00.100Z"
  }
]
```

> Returns the most recent 50 trades where the authenticated user is either the buyer or the seller.

---

## 7. Market Data Endpoints

### 7.1 Get Market Listings

```
GET /api/markets
```

**Auth Required:** No

**Query Parameters (all optional):**

| Param | Type | Default | Description |
|---|---|---|---|
| `vs_currency` | string | `usd` | Quote currency for prices |
| `per_page` | integer | 15 | Results per page (max: 100) |
| `page` | integer | 1 | Page number |
| `order` | string | `market_cap_desc` | Sort order |

**Success Response (200):**

```json
[
  {
    "id": "bitcoin",
    "symbol": "btc",
    "name": "Bitcoin",
    "image": "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
    "current_price": 67150.50,
    "market_cap": 1320000000000,
    "market_cap_rank": 1,
    "fully_diluted_valuation": 1410000000000,
    "total_volume": 25000000000,
    "high_24h": null,
    "low_24h": null,
    "price_change_24h": 2.35,
    "price_change_percentage_24h": 2.35,
    "circulating_supply": 19500000,
    "total_supply": 19500000,
    "max_supply": 21000000,
    "last_updated": "2026-08-21T10:00:00.000Z"
  }
]
```

> **Cache:** 60-second server-side cache. Response includes `X-Cache` header (`HIT` or `MISS`).

---

### 7.2 Get Live Prices (Binance)

```
GET /api/markets/live
```

**Auth Required:** No

**Success Response (200):**

```json
{
  "BTC": {
    "symbol": "BTC",
    "price": 67155.20,
    "open24h": 65800.00,
    "high24h": 67500.00,
    "low24h": 65500.00,
    "volume24h": 45000.50,
    "change24h": 2.06,
    "ts": 1692617400000
  },
  "ETH": {
    "symbol": "ETH",
    "price": 3450.75,
    "open24h": 3380.00,
    "high24h": 3470.00,
    "low24h": 3360.00,
    "volume24h": 180000.25,
    "change24h": 2.09,
    "ts": 1692617400000
  }
}
```

**Error Response:**

| Code | Error |
|---|---|
| `503` | `"Live prices not yet available — Binance stream is connecting"` |

---

### 7.3 Get Trading Pairs

```
GET /api/markets/pairs
```

**Auth Required:** No

**Success Response (200):**

```json
{
  "quote": "USDT",
  "symbols": ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "MATIC", "LTC", "DOT", "LINK", "UNI", "ATOM", "TRX"],
  "pairs": ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "MATIC/USDT", "LTC/USDT", "DOT/USDT", "LINK/USDT", "UNI/USDT", "ATOM/USDT", "TRX/USDT"]
}
```

---

### 7.4 Get Static Coin Config

```
GET /api/markets/static-coin
```

**Auth Required:** No

**Success Response (200):**

```json
{
  "symbol": "AVG",
  "min_price": "0.0100000000",
  "max_price": "1.0000000000",
  "current_price": "0.5000000000",
  "price_24h_ago": "0.4800000000"
}
```

> Returns `null` if no static coin is enabled.

---

## 8. Payment & Deposit Endpoints

### 8.1 Create Invoice (Deposit)

```
POST /api/payment/invoice
```

**Auth Required:** ✅  
**Rate Limit:** invoiceLimiter (5 req / 1 min per user)

**Request Body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `currency` | string | ❌ | `USDT` | Deposit currency |
| `amount` | number | ✅ | — | Amount to deposit (must be positive) |

**Supported Currencies:** `USDT`, `BTC`, `ETH`, `BNB`, `SOL`, `TRX`, `LTC`

**Success Response (200):**

```json
{
  "trackId": "OXA_abc123def456",
  "payLink": "https://pay.oxapay.com/abc123",
  "currency": "USDT",
  "amount": 100.0
}
```

**Error Responses:**

| Code | Error |
|---|---|
| `400` | `"amount must be a positive number"` |
| `400` | `"Unsupported currency. Supported: USDT, BTC, ETH, BNB, SOL, TRX, LTC"` |

---

### 8.2 Create White-Label Payment

```
POST /api/payment/whitelabel
```

**Auth Required:** ✅  
**Rate Limit:** invoiceLimiter (5 req / 1 min per user)

**Request Body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `currency` | string | ❌ | `USDT` | Pay currency |
| `network` | string | ❌ | — | Blockchain network (e.g., `TRX`, `ETH`) |
| `amount` | number | ✅ | — | USD amount to deposit (must be positive) |

**Success Response (200):**

```json
{
  "trackId": "OXA_wl_789xyz",
  "address": "TXyz...abc",
  "memo": null,
  "payAmount": "100.50",
  "payCurrency": "USDT",
  "network": "TRX",
  "networkCode": "TRX",
  "qrCode": "https://pay.oxapay.com/qr/abc",
  "expiredAt": 1692620400,
  "rate": "1.005"
}
```

---

### 8.3 Check Invoice Status

```
GET /api/payment/status/:trackId
```

**Auth Required:** ✅

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `trackId` | string | ✅ | The trackId returned by the invoice/whitelabel endpoint |

**Success Response (200):**

```json
{
  "track_id": "OXA_abc123def456",
  "currency": "USDT",
  "amount": "100.0000000000",
  "status": "Paid",
  "credited": true,
  "payment_url": "https://pay.oxapay.com/abc123",
  "created_at": "2026-08-21T10:00:00.000Z",
  "payment_type": "invoice"
}
```

**Possible `status` values:** `"pending"`, `"Waiting"`, `"Paid"`, `"Underpaid"`, `"Expired"`, `"Error"`

**Error Response:**

| Code | Error |
|---|---|
| `404` | `"Invoice not found"` |

---

### 8.4 Get Deposit Address (Static Address)

```
GET /api/payment/address/:currency/:network
```

**Auth Required:** ✅

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `currency` | string | ✅ | Currency symbol (e.g., `USDT`) |
| `network` | string | ✅ | Blockchain network (e.g., `TRX`) |

**Supported Currency/Network Combinations:**

| Currency | Networks |
|---|---|
| `USDT` | `TRX`, `ETH`, `BSC` |
| `BTC` | `BTC` |
| `ETH` | `ETH` |
| `BNB` | `BSC` |
| `SOL` | `SOL` |
| `TRX` | `TRX` |
| `LTC` | `LTC` |

**Success Response (200):**

```json
{
  "address": "TXyz...abc123",
  "currency": "USDT",
  "network": "TRX"
}
```

> **Note:** Each user gets one permanent address per currency/network combination. The first call generates the address; subsequent calls return the same one.

**Error Response:**

| Code | Error |
|---|---|
| `400` | `"Unsupported currency/network: {CURRENCY}/{NETWORK}"` |

---

### 8.5 Get Supported Networks

```
GET /api/payment/networks
```

**Auth Required:** No

**Success Response (200):**

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

### 8.6 Payment Callback (Server-to-Server)

```
POST /api/payment/callback
```

> ⚠️ **This endpoint is called by OxaPay's servers, not by clients.** Listed here for completeness only — do not call from mobile.

---

### 8.7 Static Address Callback (Server-to-Server)

```
POST /api/payment/static/callback
```

> ⚠️ **This endpoint is called by OxaPay's servers, not by clients.** Listed here for completeness only — do not call from mobile.

---

## 9. Crypto Listings Endpoints

### 9.1 Get Crypto Listings

```
GET /api/crypto/listings
```

**Auth Required:** No

**Query Parameters (all optional):**

| Param | Type | Default | Description |
|---|---|---|---|
| `convert` | string | `INR` | Fiat conversion currency |
| `limit` | integer | 50 | Number of coins to return (max: 200) |

**Success Response (200):**

Returns the raw CoinMarketCap `listings/latest` data array, converted to the requested fiat currency. Each object contains fields like `id`, `name`, `symbol`, `slug`, `cmc_rank`, `circulating_supply`, `total_supply`, `max_supply`, `quote.{convert}.*` with `price`, `volume_24h`, `market_cap`, `percent_change_24h`, etc.

> **Cache:** 60-second server-side cache. Response includes `X-Cache` header.

---

## 10. DEX Swap (1inch) Endpoints

These endpoints proxy requests to the 1inch DEX aggregator API.

### Supported Chain IDs

| Chain ID | Network |
|---|---|
| `1` | Ethereum Mainnet |
| `56` | BNB Smart Chain |
| `137` | Polygon |
| `42161` | Arbitrum |
| `10` | Optimism |
| `8453` | Base |
| `43114` | Avalanche |

### 10.1 Get Token List

```
GET /api/1inch/tokens
```

**Auth Required:** No

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `chainId` | integer | `1` | Blockchain chain ID |

**Success Response (200):**

```json
[
  {
    "symbol": "USDC",
    "name": "USD Coin",
    "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "decimals": 6,
    "logoURI": "https://tokens.1inch.io/0xa0b86991..."
  }
]
```

---

### 10.2 Get Swap Quote

```
GET /api/1inch/swap/quote
```

**Auth Required:** No

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `src` | string | ✅ | Source token contract address |
| `dst` | string | ✅ | Destination token contract address |
| `amount` | string | ✅ | Amount in smallest denomination (wei) |
| `chainId` | integer | ❌ | Chain ID (default: 1) |

**Success Response (200):** Returns the raw 1inch quote response.

**Error Response:**

| Code | Error |
|---|---|
| `400` | `"src, dst, and amount are required"` |

---

### 10.3 Build Swap Transaction

```
GET /api/1inch/swap/build
```

**Auth Required:** No

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `src` | string | ✅ | Source token contract address |
| `dst` | string | ✅ | Destination token contract address |
| `amount` | string | ✅ | Amount in smallest denomination (wei) |
| `from` | string | ✅ | User's wallet address |
| `slippage` | number | ❌ | Slippage tolerance in % (default: 1) |
| `chainId` | integer | ❌ | Chain ID (default: 1) |

**Success Response (200):** Returns the raw 1inch swap transaction data (to, data, value, gas).

**Error Response:**

| Code | Error |
|---|---|
| `400` | `"src, dst, amount, and from are required"` |

---

### 10.4 Get DEX Orderbook

```
GET /api/1inch/orderbook/:chainId
```

**Auth Required:** No

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chainId` | integer | ✅ | Blockchain chain ID |

**Success Response (200):** Returns the raw 1inch limit orderbook data.

---

## 11. CoinMarketCap Public Data Endpoints

These are fully public endpoints conforming to the CoinMarketCap listing standard. No authentication required.

**Base Path:** `/api/cmc`  
**Rate Limit:** 120 req / min (IP-based)  
**Pair Format:** Underscore-separated (e.g., `BTC_USDT`)  
**Cache:** 60 seconds (all endpoints)

### 11.1 API Index

```
GET /api/cmc/
```

Returns a self-describing JSON listing all available endpoints with descriptions.

---

### 11.2 Market Summary

```
GET /api/cmc/summary
```

**Success Response (200):**

```json
[
  {
    "trading_pairs": "BTC_USDT",
    "base_currency": "BTC",
    "quote_currency": "USDT",
    "last_price": 67150.50,
    "lowest_ask": 67155.00,
    "highest_bid": 67148.00,
    "base_volume": 45.25,
    "quote_volume": 3038531.25,
    "price_change_percent_24h": 2.35,
    "highest_price_24h": 67500.00,
    "lowest_price_24h": 65500.00
  }
]
```

---

### 11.3 Asset Metadata

```
GET /api/cmc/assets
```

**Success Response (200):**

```json
{
  "BTC": {
    "name": "Bitcoin",
    "unified_cryptoasset_id": null,
    "can_withdraw": false,
    "can_deposit": true,
    "min_withdraw": "0",
    "max_withdraw": "0",
    "maker_fee": "0",
    "taker_fee": "0"
  }
}
```

---

### 11.4 Compact Ticker

```
GET /api/cmc/ticker
```

**Success Response (200):**

```json
{
  "BTC_USDT": {
    "base_id": 1,
    "quote_id": 825,
    "last_price": "67150.50",
    "quote_volume": "3038531.25",
    "base_volume": "45.25",
    "isFrozen": "0"
  }
}
```

---

### 11.5 Order Book

```
GET /api/cmc/orderbook/:market_pair
```

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `market_pair` | string | ✅ | Pair in CMC format (e.g., `BTC_USDT`) |

**Query Parameters:**

| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `depth` | integer | 50 | 200 | Max levels per side |

**Success Response (200):**

```json
{
  "timestamp": 1692617400000,
  "bids": [
    ["67100.0000000000", "0.8000000000"],
    ["67050.0000000000", "2.1000000000"]
  ],
  "asks": [
    ["67150.5000000000", "0.2500000000"],
    ["67200.0000000000", "1.5000000000"]
  ]
}
```

> Entries are `[price_string, quantity_string]`.

---

### 11.6 Recent Trades

```
GET /api/cmc/trades/:market_pair
```

**URL Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `market_pair` | string | ✅ | Pair in CMC format (e.g., `BTC_USDT`) |

**Query Parameters:**

| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | integer | 200 | 500 | Max trades to return |
| `window_hours` | integer | 24 | 72 | Lookback window in hours |

**Success Response (200):**

```json
[
  {
    "trade_id": 567,
    "price": "67000.0000000000",
    "base_volume": "0.2000000000",
    "quote_volume": "13400.0000000000",
    "timestamp": 1692617400000,
    "type": "buy"
  }
]
```

---

## 12. Admin Endpoints

All admin endpoints require authentication **and** admin privileges.

**Auth Required:** ✅ (must have `is_admin: true`)  
**Error when not admin:** `403 — { "error": "Admin access required" }`

### 12.1 Get Platform Stats

```
GET /api/admin/stats
```

**Response (200):**

```json
{
  "totalUsers": 1250,
  "openOrders": 340,
  "totalTrades": 15600,
  "pendingKyc": 12,
  "totalVolumeUSD": 45000000.50
}
```

---

### 12.2 List Users

```
GET /api/admin/users
```

**Response (200):** Array of up to 200 users:

```json
[
  {
    "id": 42,
    "name": "John Doe",
    "email": "user@example.com",
    "is_admin": false,
    "created_at": "2026-01-15T08:30:00.000Z",
    "kyc_status": "approved",
    "balances": {
      "USDT": 1700.25,
      "BTC": 0.6
    }
  }
]
```

---

### 12.3 Get User Details

```
GET /api/admin/users/:userId
```

**Response (200):**

```json
{
  "user": {
    "id": 42,
    "name": "John Doe",
    "email": "user@example.com",
    "is_admin": false,
    "created_at": "2026-01-15T08:30:00.000Z",
    "referral_code": "MAX8F2A9B",
    "kyc_status": "approved",
    "kyc_full_name": "John Michael Doe",
    "document_type": "passport",
    "document_number": "A12345678",
    "kyc_submitted_at": "2026-01-16T10:00:00.000Z",
    "kyc_reviewed_at": "2026-01-17T12:00:00.000Z",
    "reviewer_note": null
  },
  "balances": [
    { "currency": "BTC", "available": 0.5, "locked": 0.1 },
    { "currency": "USDT", "available": 1500.25, "locked": 200.00 }
  ],
  "orders": [
    {
      "id": 1234,
      "pair": "BTC/USDT",
      "side": "buy",
      "type": "limit",
      "price": "67000.0000000000",
      "quantity": "0.5000000000",
      "remaining_quantity": "0.3000000000",
      "status": "partially_filled",
      "created_at": "2026-08-21T10:30:00.000Z"
    }
  ],
  "trades": [
    {
      "id": 567,
      "pair": "BTC/USDT",
      "price": "67000.0000000000",
      "quantity": "0.2000000000",
      "executed_at": "2026-08-21T10:30:00.100Z",
      "side": "buy"
    }
  ]
}
```

---

### 12.4 Toggle Admin Status

```
PATCH /api/admin/users/:userId/toggle-admin
```

**Response (200):**

```json
{
  "success": true,
  "is_admin": true
}
```

> Cannot toggle your own admin status.

---

### 12.5 Add Balance to User

```
POST /api/admin/users/:userId/add-balance
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `currency` | string | ✅ | Currency symbol (e.g., `USDT`) |
| `amount` | number | ✅ | Amount to credit (must be positive) |

**Response (200):**

```json
{
  "success": true
}
```

---

### 12.6 List KYC Submissions

```
GET /api/admin/kyc
```

**Response (200):** Array of KYC submissions (pending first, up to 200):

```json
[
  {
    "user_id": 42,
    "full_name": "John Michael Doe",
    "date_of_birth": "1990-05-15",
    "document_type": "passport",
    "document_number": "A12345678",
    "document_path": "kyc/42/1693000000.jpg",
    "status": "pending",
    "submitted_at": "2026-01-16T10:00:00.000Z",
    "reviewed_at": null,
    "reviewer_note": null,
    "email": "user@example.com",
    "user_name": "John Doe"
  }
]
```

---

### 12.7 Approve KYC

```
POST /api/admin/kyc/:userId/approve
```

**Response (200):**

```json
{
  "success": true
}
```

---

### 12.8 Reject KYC

```
POST /api/admin/kyc/:userId/reject
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `note` | string | ❌ | Rejection reason (defaults to `"Rejected by admin"`) |

**Response (200):**

```json
{
  "success": true
}
```

---

### 12.9 View KYC Document

```
GET /api/admin/kyc/:userId/document
```

**Response:** `302 Redirect` to a presigned S3 download URL.

---

### 12.10 List All Orders (Paginated)

```
GET /api/admin/orders
```

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Results per page (max: 100) |

**Response (200):**

```json
{
  "orders": [
    {
      "id": 1234,
      "pair": "BTC/USDT",
      "side": "buy",
      "type": "limit",
      "price": "67000.0000000000",
      "quantity": "0.5000000000",
      "remaining_quantity": "0.3000000000",
      "status": "partially_filled",
      "created_at": "2026-08-21T10:30:00.000Z",
      "email": "user@example.com",
      "name": "John Doe"
    }
  ],
  "total": 5000,
  "page": 1,
  "limit": 50,
  "pages": 100
}
```

---

### 12.11 Get Static Coin Config

```
GET /api/admin/static-coin
```

**Response (200):** Full `static_coin_config` row or `null`.

---

### 12.12 Update Static Coin Config

```
PUT /api/admin/static-coin
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | ✅ | Coin symbol (e.g., `AVG`) |
| `min_price` | number | ✅ | Minimum price (must be positive) |
| `max_price` | number | ✅ | Maximum price (must be > min_price) |
| `current_price` | number | ✅ | Current mid price (must be within [min, max]) |
| `enabled` | boolean | ❌ | Whether the coin is active (default: true) |

**Response (200):** Full updated `static_coin_config` row.

---

### 12.13 List Referrals

```
GET /api/admin/referrals
```

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Search by name, email, or referral code |
| `sort` | string | `direct` | Sort by: `direct`, `total`, `recent` |

**Response (200):**

```json
[
  {
    "id": 42,
    "name": "John Doe",
    "email": "user@example.com",
    "referral_code": "MAX8F2A9B",
    "created_at": "2026-01-15T08:30:00.000Z",
    "referred_by": null,
    "referrer_name": null,
    "referrer_email": null,
    "referrer_code": null,
    "direct_count": 12,
    "total_count": 45
  }
]
```

---

### 12.14 Get Referral Tree

```
GET /api/admin/referrals/:userId/tree
```

**Response (200):**

```json
{
  "root": {
    "id": 42,
    "name": "John Doe",
    "email": "user@example.com",
    "referral_code": "MAX8F2A9B",
    "referred_by": null,
    "created_at": "2026-01-15T08:30:00.000Z",
    "depth": 0,
    "direct_count": 5
  },
  "nodes": [
    { "id": 42, "depth": 0, "...": "..." },
    { "id": 55, "depth": 1, "referred_by": 42, "...": "..." },
    { "id": 78, "depth": 2, "referred_by": 55, "...": "..." }
  ],
  "totalCount": 15,
  "maxDepth": 4
}
```

---

## 13. WebSocket (Real-Time) Events

The server uses **Socket.IO** for real-time communication.

### Connection

```
URL: wss://<your-domain>
Transport: Socket.IO (default: WebSocket with polling fallback)
```

**Authentication:** The socket connection authenticates via cookie (set during login). For mobile, include credentials in the connection options.

**Socket.IO Client Setup (JavaScript/React Native):**

```javascript
import { io } from "socket.io-client";

const socket = io("https://<your-domain>", {
  withCredentials: true,
  // OR for mobile where cookies are not available:
  // extraHeaders: { Cookie: "token=<jwt>" }
});

// Subscribe to user-specific events after connecting
socket.emit("subscribe", { userId: 42 });
```

**Socket.IO Client Setup (Swift — iOS):**

```swift
import SocketIO

let manager = SocketManager(
    socketURL: URL(string: "https://<your-domain>")!,
    config: [
        .extraHeaders(["Cookie": "token=\(jwtToken)"]),
        .forceWebsockets(true)
    ]
)
let socket = manager.defaultSocket

socket.on(clientEvent: .connect) { data, ack in
    socket.emit("subscribe", ["userId": userId])
}

socket.connect()
```

**Socket.IO Client Setup (Kotlin — Android):**

```kotlin
import io.socket.client.IO
import io.socket.client.Socket

val options = IO.Options().apply {
    extraHeaders = mapOf("Cookie" to listOf("token=$jwtToken"))
    forceNew = true
}

val socket = IO.socket("https://<your-domain>", options)

socket.on(Socket.EVENT_CONNECT) {
    socket.emit("subscribe", JSONObject().put("userId", userId))
}

socket.connect()
```

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `subscribe` | `{ userId: number }` | Subscribe to user-specific room for balance/order updates. Server validates that `socket.userId === payload.userId`. |

### Server → Client Events (Broadcast — All Clients)

#### `depth_update`
Fired when the exchange order book changes (new order placed, order cancelled, trade executed).

```json
{
  "pair": "BTC/USDT",
  "asks": [[67155.00, 0.25], [67200.00, 1.50]],
  "bids": [[67100.00, 0.80], [67050.00, 2.10]]
}
```

#### `binance:ticker`
Real-time Binance ticker for each supported symbol. Fires continuously (~1/sec per symbol).

```json
{
  "symbol": "BTC",
  "price": 67155.20,
  "open24h": 65800.00,
  "high24h": 67500.00,
  "low24h": 65500.00,
  "volume24h": 45000.50,
  "change24h": 2.06,
  "ts": 1692617400000
}
```

#### `binance:depth`
Binance depth snapshot (top 10 levels) per symbol.

```json
{
  "symbol": "BTC",
  "bids": [[67100.00, 0.80], [67050.00, 2.10]],
  "asks": [[67155.00, 0.25], [67200.00, 1.50]]
}
```

#### `binance:trade`
Individual Binance trade events.

```json
{
  "symbol": "BTC",
  "price": 67150.00,
  "qty": 0.015,
  "isBuyerMaker": false,
  "time": 1692617400123
}
```

#### `binance:kline`
Binance 1-minute candlestick data.

```json
{
  "symbol": "BTC",
  "interval": "1m",
  "time": 1692617400000,
  "open": 67100.00,
  "high": 67160.00,
  "low": 67090.00,
  "close": 67150.00,
  "volume": 12.5,
  "closed": true
}
```

#### `admin:refresh`
Fired when orders/trades change. Admin dashboards should refetch data.

```
(no payload)
```

### Server → Client Events (Targeted — Specific User)

These events are sent only to the authenticated user's room (`user:{userId}`).

#### `balance_update`
Fired when a user's balance changes due to a trade execution.

```json
{
  "userId": 42
}
```

> **Implementation Note:** Upon receiving this event, the mobile client should call `GET /api/user/balance` to fetch the updated balance. This event is a **notification trigger**, not a full balance payload.

---

## 14. Data Models & Enums

### Order Side

```
"buy" | "sell"
```

### Order Type

```
"limit" | "market"
```

### Order Status

```
"open" | "partially_filled" | "filled" | "cancelled"
```

### KYC Status

```
"none" | "pending" | "approved" | "rejected"
```

> `"none"` is returned by `GET /api/kyc/status` when no submission exists. The database column holds `"pending"`, `"approved"`, or `"rejected"`.

### KYC Document Type

```
"passport" | "national_id" | "driver_license"
```

### Payment Status

```
"pending" | "Waiting" | "Paid" | "Underpaid" | "Expired" | "Error"
```

### Payment Type

```
"invoice" | "whitelabel"
```

### Referral Code Format

```
MAX + 6 uppercase alphanumeric characters
Example: MAX8F2A9B, MAXK7R3P2
Pattern: /^MAX[A-Z0-9]{6}$/
```

### Numeric Precision

All financial amounts are stored with `NUMERIC(28, 10)` precision (28 total digits, 10 decimal places). API responses may return these as strings to preserve precision — mobile clients should use decimal/BigNumber libraries rather than floating-point for display and calculations.

---

## 15. Supported Trading Pairs & Currencies

### Trading Pairs

All pairs are quoted against **USDT**. The pair format is `SYMBOL/USDT`.

| Symbol | Pair | Full Name |
|---|---|---|
| BTC | BTC/USDT | Bitcoin |
| ETH | ETH/USDT | Ethereum |
| BNB | BNB/USDT | BNB |
| SOL | SOL/USDT | Solana |
| XRP | XRP/USDT | Ripple |
| ADA | ADA/USDT | Cardano |
| DOGE | DOGE/USDT | Dogecoin |
| AVAX | AVAX/USDT | Avalanche |
| MATIC | MATIC/USDT | Polygon |
| LTC | LTC/USDT | Litecoin |
| DOT | DOT/USDT | Polkadot |
| LINK | LINK/USDT | Chainlink |
| UNI | UNI/USDT | Uniswap |
| ATOM | ATOM/USDT | Cosmos |
| TRX | TRX/USDT | TRON |

> **Note:** A custom static coin (e.g., `AVG/USDT`) may also be active. Check `GET /api/markets/static-coin` and `GET /api/markets/pairs` for the current live list.

### Deposit Currencies & Networks

| Currency | Supported Networks |
|---|---|
| USDT | TRX, ETH, BSC |
| BTC | BTC |
| ETH | ETH |
| BNB | BSC |
| SOL | SOL |
| TRX | TRX |
| LTC | LTC |

---

## Quick Reference — All Endpoints

### Public (No Auth)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/user/login` | Login step 1 — request OTP |
| `POST` | `/api/user/verify-login-otp` | Login step 2 — verify OTP |
| `POST` | `/api/user/signup` | Signup step 1 — request OTP |
| `POST` | `/api/user/verify-signup-otp` | Signup step 2 — verify OTP |
| `POST` | `/api/user/logout` | Clear session |
| `POST` | `/api/user/forgot-password` | Request password reset code |
| `POST` | `/api/user/reset-password` | Reset password with code |
| `GET` | `/api/trade/orderbook?pair=` | Public order book |
| `GET` | `/api/markets` | Market listings (CMC data) |
| `GET` | `/api/markets/live` | Live Binance prices |
| `GET` | `/api/markets/pairs` | Supported trading pairs |
| `GET` | `/api/markets/static-coin` | Static coin config |
| `GET` | `/api/crypto/listings` | Crypto listings (CMC raw) |
| `GET` | `/api/1inch/tokens` | 1inch token list |
| `GET` | `/api/1inch/swap/quote` | 1inch swap quote |
| `GET` | `/api/1inch/swap/build` | 1inch swap transaction |
| `GET` | `/api/1inch/orderbook/:chainId` | 1inch limit orderbook |
| `GET` | `/api/payment/networks` | Supported deposit networks |
| `GET` | `/api/cmc/` | CMC API index |
| `GET` | `/api/cmc/summary` | CMC market summary |
| `GET` | `/api/cmc/assets` | CMC asset metadata |
| `GET` | `/api/cmc/ticker` | CMC compact ticker |
| `GET` | `/api/cmc/orderbook/:pair` | CMC order book |
| `GET` | `/api/cmc/trades/:pair` | CMC recent trades |
| `GET` | `/health` | Health check |

### Authenticated (Bearer Token Required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/user/me` | Get user profile |
| `GET` | `/api/user/balance` | Get all balances |
| `POST` | `/api/user/change-password` | Change password |
| `GET` | `/api/kyc/status` | Get KYC status |
| `GET` | `/api/kyc/upload-url` | Get S3 presigned upload URL |
| `POST` | `/api/kyc/submit` | Submit KYC documents |
| `POST` | `/api/trade/order` | Place an order |
| `DELETE` | `/api/trade/order/:id` | Cancel an order |
| `GET` | `/api/trade/orders` | Get my orders |
| `GET` | `/api/trade/trades` | Get my trade history |
| `POST` | `/api/payment/invoice` | Create deposit invoice |
| `POST` | `/api/payment/whitelabel` | Create white-label payment |
| `GET` | `/api/payment/status/:trackId` | Check invoice status |
| `GET` | `/api/payment/address/:cur/:net` | Get deposit address |

### Admin Only (Bearer Token + Admin Role)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | Platform statistics |
| `GET` | `/api/admin/users` | List all users |
| `GET` | `/api/admin/users/:userId` | User details |
| `PATCH` | `/api/admin/users/:userId/toggle-admin` | Toggle admin role |
| `POST` | `/api/admin/users/:userId/add-balance` | Credit balance |
| `GET` | `/api/admin/kyc` | List KYC submissions |
| `POST` | `/api/admin/kyc/:userId/approve` | Approve KYC |
| `POST` | `/api/admin/kyc/:userId/reject` | Reject KYC |
| `GET` | `/api/admin/kyc/:userId/document` | View KYC document |
| `GET` | `/api/admin/orders` | All orders (paginated) |
| `GET` | `/api/admin/static-coin` | Static coin config |
| `PUT` | `/api/admin/static-coin` | Update static coin |
| `GET` | `/api/admin/referrals` | Referral leaderboard |
| `GET` | `/api/admin/referrals/:userId/tree` | Referral tree |
