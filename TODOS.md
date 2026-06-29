# TODOS

Deferred work captured during reviews. Each item has enough context to pick up cold.

## Perf: batch the counterparty lookup in settleFill (N+1)
- **What:** Replace the per-fill `SELECT user_id, price FROM orders WHERE id = $1` with one batched `WHERE id = ANY($1)` lookup before settling an order's fills.
- **Why:** For an order crossing N resting orders, settlement issues N counterparty lookups inside the transaction, scaling linearly with fan-out.
- **Pros:** Fewer round-trips inside the (already lock-holding) settle transaction; shorter transaction.
- **Cons:** None significant; small refactor of the unified settle helper.
- **Context:** Today in `backend/services/engineService.js:152` (`_settleFills`) and mirrored in recovery at `:255`. After the Approach-C hardening unifies these into one settle helper, batch the lookup there.
- **Depends on / blocked by:** Best done with the settle-helper unification (Eng review Issue 3). Not blocking MVP correctness.

## Ops: startup ledger-invariant / reconciliation self-check
- **What:** On startup (and optionally a periodic job), assert the ledger is internally consistent before the engine accepts orders: sum/relationship of `locked_balance` reconciles with open-order lock obligations, and no balance row violates its CHECK. Log loudly / refuse to start on mismatch.
- **Why:** The engine is single-process with no failover; silent ledger drift after a crash or a bug should surface loudly to an operator, not accumulate.
- **Pros:** Operator confidence; catches corruption before it compounds; cheap to run at boot.
- **Cons:** Needs a precise definition of the invariant (lock obligation per open order = price*remaining for buys, remaining for sells); a false alarm could block startup, so thresholds/dust tolerance must be set carefully.
- **Context:** Runs at boot alongside `recoverFromDB` (`backend/services/engineService.js:217`), sharing the open-orders query. The ledger invariant is already the spec for the test suite (see eng-review test plan), so the runtime check reuses that definition.
- **Depends on / blocked by:** Pairs naturally with the recovery unification (Eng review Issue 3).
