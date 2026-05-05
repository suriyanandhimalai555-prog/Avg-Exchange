# Role and Context
You are a Senior Backend Engineer building the core trading engine for "AvgExchange", a centralized cryptocurrency exchange MVP. 

**Tech Stack:** Node.js, Express, PostgreSQL (`pg`), and `socket.io`.
**Constraints:** 1. The code must be highly robust and handle high concurrency (e.g., 500 simultaneous users) without double-spending.
2. Rely strictly on SQL `BEGIN/COMMIT` transactions for financial integrity.
3. The actual blockchain wallet integration will be built later. For now, we are using "Virtual Balances" and stubbed wallet services.

Please generate the code for this backend sequentially across the following 5 phases. Provide the code blocks clearly labeled with their file names.

---

### Phase 1: The Immutable Ledger (Database & Stubbed Wallet)
First, generate the database schema and utility functions to ensure money cannot be double-spent.

1. **`schema.sql`:** - Create a `users` table (include a `referral_code` column).
   - Create a `balances` table (`user_id`, `currency`, `available_balance`, `locked_balance`).
   - Create an `orders` table (`id`, `user_id`, `side`, `price`, `quantity`, `remaining_quantity`, `status` [open, filled, cancelled]).
   - Create a `trades` table to record successful matches.

2. **`db.js`:**
   - Write standard PostgreSQL connection logic.
   - Write a strictly robust function `lockFunds(userId, currency, amount)` that uses SQL `BEGIN` and `COMMIT` transactions to safely deduct the `amount` from `available_balance` and add it to `locked_balance`. It MUST throw an error and `ROLLBACK` if the user has insufficient funds.

3. **`services/walletService.js`:**
   - Write a stubbed `processWithdrawal(userId, amount, address)` function. For now, make it simply deduct the available balance in the database and return "Success". We will add external API logic here next month.

---

### Phase 2: The Core Matching Engine
We are using the npm package `nodejs-order-book` to handle the complex math of price-time priority matching. 

1. **`services/engineService.js`:**
   - Initialize a Singleton instance of the order book so the entire Express application shares it.
   - Write a `placeOrder(userOrder)` function that passes new orders to the library.
   - **The Parser:** The library returns match results (partial fills, full fills). Write the logic that takes these results and generates the correct SQL transaction to simultaneously update the buyer's and seller's balances in PostgreSQL (e.g., deduct locked INR, add available ETH).
   - **Recovery Script:** Write a function `reloadOpenOrders()` that queries the database for all 'open' orders and loads them into the `nodejs-order-book` memory. We will call this when the server starts so orders survive a reboot.

---

### Phase 3: The Trading Gateway (Express Routes)
Wire the database locks and the engine together.

1. **`routes/tradeRoutes.js`:**
   - Create a `POST /api/trade/order` route.
   - The route must execute in this exact sequence:
     1. Await the `lockFunds` database transaction from `db.js`.
     2. Pass the order to `engineService.placeOrder()`.
     3. Save the initial order to the `orders` table.
   - Implement robust `try/catch` error handling so if the engine fails, the database lock is rolled back.

---

### Phase 4: Real-Time State (WebSockets)
We need to push live updates to the frontend so users don't have to refresh their browsers.

1. **`server.js` (Socket Setup):**
   - Integrate `socket.io` into the Express server.
2. **Socket Emitters:**
   - Inside your `tradeRoutes.js`, immediately after a successful database commit for a trade, emit two events:
     - `io.emit('orderbook_update', newBookData)` (broadcast to everyone).
     - `io.to(userId).emit('balance_update', newBalances)` (targeted explicitly to the buyer and seller).

---

### Phase 5: User Onboarding & Referrals
Finalize the user creation logic to support our marketing efforts.

1. **`controllers/userController.js`:**
   - Write a utility function that generates a unique referral code for every new user upon signup.
   - **Rule:** The referral code MUST strictly begin with the prefix 'MAX', followed by 6 random uppercase alphanumeric characters (e.g., `MAX8F2A9B`).
   - Ensure this code is saved to the `users` table during the signup process.

---
**Final Request:** Please provide the code for Phase 1 and Phase 2 first. Wait for my confirmation before generating Phases 3, 4, and 5 to ensure we get the foundation perfect.