# Signal Engine — Security & Architecture Audit

**Date:** 2026-03-29  
**Auditor:** Senior Security Engineer / Software Architect  
**Scope:** Full codebase review of the Signal Engine trading application  
**Overall Grade: D+**

> **Verdict:** This application has multiple critical and high-severity vulnerabilities that must be fixed before any live or paper trading with real broker credentials. The lack of authentication on all API endpoints means anyone with network access can execute trades, steal API keys, and manipulate the trading pipeline.

---

## Executive Summary

The Signal Engine is a well-structured trading application with a solid domain model, but it treats security as an afterthought. The most dangerous findings:

1. **Zero authentication** on all 50+ API endpoints — including order execution and API key management
2. **Broker API secrets stored as plaintext** in SQLite, with a masking bug that exposes the Alpaca secret key via the GET /api/settings endpoint
3. **POST /api/settings returns the full plaintext secret** in its response body
4. **No rate limiting** anywhere — an attacker (or a bug) can place unlimited orders
5. **No duplicate order prevention** — the execute endpoint can be called repeatedly for the same opportunity
6. **The kill switch is advisory only** — it's checked in `convictionSize()` but never enforced at the order execution layer
7. **The TradingView webhook endpoint has no authentication** — anyone can inject fake alerts
8. **Command injection risk** via `execSync` in 6 server files

---

## 1. SECURITY — Grade: F

### CRITICAL: No Authentication or Authorization (routes.ts, all endpoints)

**Every single API endpoint is completely unauthenticated.** There is no middleware, no session management, no API key check, no JWT, nothing. The Express server in `server/index.ts` sets up `express.json()`, a logging middleware, an error handler, and that's it.

This means:
- Anyone on the network can call `POST /api/alpaca/execute/:id` to place broker orders
- Anyone can call `POST /api/alpaca/close-all` to liquidate all positions
- Anyone can call `POST /api/settings` to overwrite or read API keys
- Anyone can call `POST /api/pipeline/run` to trigger the full autonomous pipeline
- Anyone can call `DELETE /api/opportunities/:id` to destroy data

**Files affected:** `server/index.ts` (lines 14–61), `server/routes.ts` (all 1461 lines)  
**Fix:** Add authentication middleware (at minimum, a session-based auth with password login; ideally JWT or OAuth). Protect all `/api/alpaca/*`, `/api/pipeline/*`, `/api/settings`, and mutation endpoints behind auth.

---

### CRITICAL: API Keys Stored as Plaintext in SQLite (storage.ts:156–161, schema.ts:175–180)

Alpaca API keys (`alpaca_api_key`, `alpaca_secret_key`) are stored as plaintext strings in the `app_settings` SQLite table. The database file `data.db` sits in the project root with no file-level encryption.

```sql
-- app_settings table
key TEXT NOT NULL UNIQUE,
value TEXT NOT NULL,  -- PLAINTEXT
```

Anyone with filesystem access (or a path traversal bug) can read `data.db` and extract broker credentials.

**Fix:** Encrypt secrets at rest using AES-256-GCM with a key derived from an environment variable (e.g., `ENCRYPTION_KEY`). Alternatively, use OS-level secret storage or a vault service.

---

### CRITICAL: Secret Key Exposed via GET /api/settings (routes.ts:761–773)

The masking logic on the GET `/api/settings` endpoint has a critical bug:

```typescript
value: s.key.includes("api_key") && s.value.length > 8
  ? s.value.slice(0, 4) + "..." + s.value.slice(-4)
  : s.value,
```

The Alpaca secret is stored under the key `alpaca_secret_key`. The string `"alpaca_secret_key"` does **NOT** contain the substring `"api_key"` — it contains `"secret_key"`. Therefore, the masking is bypassed and **the full plaintext Alpaca secret key is returned in the API response**.

Verified:
```javascript
"alpaca_secret_key".includes("api_key") // → false
"alpaca_api_key".includes("api_key")    // → true
```

**File:** `server/routes.ts`, line 766  
**Fix:** Change the masking condition to:
```typescript
value: (s.key.includes("api_key") || s.key.includes("secret")) && s.value.length > 8
  ? s.value.slice(0, 4) + "..." + s.value.slice(-4)
  : s.value,
```
Better yet, never return secret values at all — return a boolean `isConfigured` flag instead.

---

### CRITICAL: POST /api/settings Returns Full Secret in Response (routes.ts:778–785)

When saving a setting via `POST /api/settings`, the response returns the full `AppSetting` object including the unmasked `value`:

```typescript
const setting = await storage.upsertSetting(key, value);
res.json(setting); // Returns { key: "alpaca_secret_key", value: "THE_FULL_SECRET", ... }
```

Even if the GET endpoint were properly masked, the POST response leaks the secret to the frontend.

**File:** `server/routes.ts`, line 782  
**Fix:** Return only `{ ok: true, key }` for secret-type settings, never the value.

---

### HIGH: No Rate Limiting on Any Endpoint

There is no rate limiting middleware installed. The `package.json` does not include `express-rate-limit` or any similar package as a dependency. The `script/build.ts` file references it as an external, suggesting it was planned but never implemented.

Critical endpoints that need rate limiting:
- `POST /api/alpaca/execute/:id` — can place unlimited orders
- `POST /api/pipeline/run` — can trigger expensive pipeline runs
- `POST /api/settings` — can brute-force or flood settings
- `POST /api/webhooks/tradingview` — can be DoS'd
- `POST /api/alpaca/close-all` — can be called repeatedly

**Fix:** Install `express-rate-limit` and apply strict limits:
```typescript
import rateLimit from 'express-rate-limit';
const tradingLimiter = rateLimit({ windowMs: 60000, max: 5 }); // 5 trades/minute
app.post("/api/alpaca/execute/:id", tradingLimiter, handler);
```

---

### HIGH: Unauthenticated TradingView Webhook (routes.ts:524–548)

The `POST /api/webhooks/tradingview` endpoint accepts any POST body with no verification. TradingView supports webhook secrets, but this endpoint doesn't validate any shared secret or signature. An attacker can inject fake alerts to manipulate trading signals.

Additionally, the endpoint always returns HTTP 200 even on error (to prevent TradingView retries), which makes it impossible to detect abuse via HTTP status monitoring.

**File:** `server/routes.ts`, lines 524–548  
**Fix:** Add a webhook secret validation:
```typescript
const WEBHOOK_SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET;
if (WEBHOOK_SECRET && req.body.secret !== WEBHOOK_SECRET) {
  return res.status(401).json({ error: "Invalid webhook secret" });
}
```

---

### HIGH: Potential Command Injection via execSync (6 files)

Six server files use `execSync` to call `external-tool`:

- `server/auto-signals.ts:23`
- `server/screeners.ts:23`
- `server/macro-monitor.ts:11`
- `server/intelligence-service.ts:7, 135`
- `server/execution-engine.ts:37`

The pattern is:
```typescript
const escaped = params.replace(/'/g, "'\\''");
execSync(`external-tool call '${escaped}'`, { timeout: 30000, encoding: "utf-8" });
```

While the single-quote escaping provides basic protection, the `params` variable is constructed from `JSON.stringify()` of arguments that may include user-controllable data (ticker symbols from the database, for example). If a ticker symbol contains crafted characters, the escaping could be bypassed.

**Risk:** Medium-High. The immediate path requires an attacker to inject a malicious ticker into the database first, but given the lack of authentication, this is trivial via `POST /api/opportunities`.

**Fix:** Use `execFileSync` instead of `execSync` to avoid shell interpretation entirely:
```typescript
const result = execFileSync('external-tool', ['call', params], { timeout: 30000, encoding: 'utf-8' });
```

---

### HIGH: Alpaca URL Path Injection (alpaca-service.ts:46, 54–56, 89–91)

Ticker symbols are interpolated directly into Alpaca API URL paths without sanitization:

```typescript
// alpaca-service.ts:46
return await alpacaRequest("GET", `/v2/positions/${symbol}`);

// alpaca-service.ts:54–56
return alpacaRequest("GET", `/v2/orders?status=${status}&limit=${limit}`);

// alpaca-service.ts:89–91
return alpacaRequest("DELETE", `/v2/positions/${symbol}`);
```

A crafted `symbol` value like `../account` could cause path traversal against the Alpaca API. The `status` parameter from `getOrders` is taken directly from the query string (`req.query.status`) with no validation.

**File:** `server/alpaca-service.ts`, lines 46, 55, 90  
**Fix:** Validate symbol against a strict regex (`/^[A-Z]{1,5}$/`) and whitelist the `status` parameter:
```typescript
if (!/^[A-Z]{1,5}$/.test(symbol)) throw new Error("Invalid symbol");
```

---

### MEDIUM: No CORS Configuration

There is no CORS middleware configured. In development, Vite's proxy handles same-origin, but in production the Express server serves both static files and API. Without explicit CORS headers, the API may be vulnerable to cross-site requests from malicious pages if the user has the app open.

**Fix:** Add `cors` middleware with a strict origin whitelist.

---

### MEDIUM: No CSRF Protection

No CSRF tokens are used. Since the app serves both frontend and API on the same origin, and there's no authentication, CSRF is currently a secondary concern — but once authentication is added, CSRF protection must be included.

---

### MEDIUM: No Input Validation on Most Endpoints

Despite importing `insertOpportunitySchema` from Zod, it is **never used for validation** in the routes. The `POST /api/opportunities` route directly spreads `req.body`:

```typescript
const data = { ...req.body, createdAt: now, updatedAt: now };
const opp = await storage.createOpportunity(data);
```

Similarly:
- `PATCH /api/opportunities/:id` — spreads `req.body` directly (line 135)
- `PATCH /api/weights/:domain` — passes `req.body` directly to `updateWeights` (line 356)
- `PATCH /api/portfolio` — spreads `req.body` directly (line 376)
- `POST /api/market-data/seed` — no validation on the `data` array (line 497)
- `POST /api/settings` — accepts arbitrary key/value pairs with no whitelist (line 779)

**Risk:** Mass assignment, data corruption, unexpected field injection into the database.

**File:** `server/routes.ts`, lines 38–42, 135, 356, 376, 497, 779  
**Fix:** Use the Zod schemas already defined in `shared/schema.ts` to validate all request bodies:
```typescript
const parsed = insertOpportunitySchema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: parsed.error });
```

---

### MEDIUM: Settings Key Not Whitelisted (routes.ts:779)

`POST /api/settings` accepts any `key` string. An attacker could write arbitrary settings that might be used by future code paths, or overwrite existing settings like `alpaca_api_key` with malicious values.

**Fix:** Whitelist allowed setting keys:
```typescript
const ALLOWED_KEYS = ["alpaca_api_key", "alpaca_secret_key", "benzinga_api_key"];
if (!ALLOWED_KEYS.includes(key)) return res.status(400).json({ error: "Invalid key" });
```

---

### LOW: Error Messages Leak Internal Details

Many catch blocks return `e.message` directly, which can expose internal paths, database errors, and stack traces:
```typescript
res.status(400).json({ error: e.message });
```

**Fix:** Log the full error server-side and return a generic message to the client.

---

## 2. ARCHITECTURE — Grade: B-

### Separation of Concerns: B+

The codebase has a clean modular structure:
- `scoring-engine.ts` — pure scoring math, no side effects
- `risk-manager.ts` — pure risk rules, no side effects  
- `alpaca-service.ts` — broker API abstraction
- `execution-engine.ts` — pipeline orchestration
- `storage.ts` — data access layer
- `routes.ts` — HTTP routing

The separation is good. The main issue is that `routes.ts` at 1461 lines is a monolithic file handling all 50+ endpoints. This should be broken into route modules (trading-routes, pipeline-routes, settings-routes, etc.).

### Circular Dependencies: A

No circular dependencies detected. The dependency graph flows cleanly: routes → services → storage/schema.

### Error Handling: C

**Inconsistent patterns:**
- Some routes return 400 for all errors, even server errors (should be 500)
- The webhook endpoint always returns 200, even on failure (intentional but poorly documented)
- The `callFinanceTool` helpers silently swallow errors and return `null`, making it hard to diagnose data issues
- No structured error types or error codes

### Database Atomicity: D

**No transactions anywhere.** Multiple operations that should be atomic are not:

1. **Creating an opportunity + scoring + creating a prediction** (routes.ts, `POST /api/opportunities`, lines 38–120): If scoring succeeds but prediction creation fails, the opportunity exists without an audit trail.

2. **Pipeline execution** (execution-engine.ts, `runDailyPipeline`, lines 186–320): The pipeline updates dozens of opportunities and creates predictions in a loop with no transaction boundary. A failure mid-loop leaves the database in a partial state.

3. **Auto-tune weights** (routes.ts, `POST /api/feedback/auto-tune`, lines 1218–1295): Updates weights across all domains and rescores all opportunities — if it fails mid-way, some domains have new weights and some have old.

**Fix:** Use SQLite transactions for multi-step operations:
```typescript
sqlite.exec("BEGIN");
try {
  // ... multiple operations
  sqlite.exec("COMMIT");
} catch (e) {
  sqlite.exec("ROLLBACK");
  throw e;
}
```

### Execution Engine Idempotency: F

`runDailyPipeline()` is **not idempotent**. Each run:
- Creates new prediction records (duplicates if run twice)
- Updates opportunity scores and statuses
- May add new opportunities from the scanner

Running the pipeline twice in succession will generate duplicate predictions with different timestamps, potentially doubling buy signals.

**File:** `server/execution-engine.ts`, lines 186–320  
**Fix:** Add a pipeline run ID and check for existing runs within a time window. Or use a lock:
```typescript
let pipelineRunning = false;
export async function runDailyPipeline() {
  if (pipelineRunning) throw new Error("Pipeline already running");
  pipelineRunning = true;
  try { /* ... */ } finally { pipelineRunning = false; }
}
```

---

## 3. FINANCIAL SAFETY — Grade: D

### CRITICAL: No Duplicate Order Prevention (routes.ts:1125–1156)

The `POST /api/alpaca/execute/:id` endpoint has **zero protection against duplicate execution**. If a user (or the frontend's "Execute All" button, which loops through opportunities) clicks execute twice:

1. The opportunity is fetched — it exists ✓
2. It has a ticker and allocation ✓  
3. A bracket order is placed with Alpaca ✓
4. The status is set to "buy" ✓

Nothing prevents step 3 from being called again — the status check only verifies the opportunity exists, not whether an order has already been placed. The status is set to "buy" *after* order placement, creating a race condition where two rapid clicks both see the pre-"buy" status.

**File:** `server/routes.ts`, lines 1125–1156  
**Fix:** 
1. Check `opp.status !== "buy"` before placing the order
2. Use an order ID tracking field to detect duplicates
3. Query Alpaca for existing open orders for the same symbol before placing

---

### CRITICAL: No Daily Trade Limit

There is no mechanism to limit the number of trades per day. The `apiCallCount` in `execution-engine.ts` tracks API calls but does not cap them. There is no `maxTradesPerDay` setting anywhere in the codebase.

An attacker or bug could trigger unlimited orders via:
- Repeatedly calling `POST /api/alpaca/execute/:id` 
- Repeatedly calling `POST /api/pipeline/run` (which generates buy signals)
- The frontend's "Execute All" button

**Fix:** Add a daily trade counter:
```typescript
let dailyTradeCount = 0;
const MAX_DAILY_TRADES = 20;
// Reset at midnight
setInterval(() => { dailyTradeCount = 0; }, 86400000);

// In execute endpoint:
if (dailyTradeCount >= MAX_DAILY_TRADES) {
  return res.status(429).json({ error: "Daily trade limit reached" });
}
```

---

### CRITICAL: Kill Switch Not Enforced at Execution Layer

The `evaluatePortfolioRisk()` function in `risk-manager.ts` computes `killSwitchActive: currentDrawdown >= 10.0`, and `convictionSize()` returns 0 when the kill switch is active. However:

1. The `/api/alpaca/execute/:id` endpoint **never checks the kill switch**. It reads `opp.suggestedAllocation` and places the order directly.
2. The kill switch only affects the `convictionSize()` function, which is only called if someone explicitly evaluates risk first.
3. There is no persistent kill switch state — it's computed on the fly and not stored.

**This means the kill switch cannot actually prevent trades.** A user can always manually execute via the Trading page regardless of portfolio drawdown.

**File:** `server/routes.ts`, lines 1125–1156; `server/risk-manager.ts`, lines 109–123  
**Fix:** Add a kill switch check in the execute endpoint:
```typescript
app.post("/api/alpaca/execute/:id", async (req, res) => {
  // Check kill switch FIRST
  const portfolio = await storage.getPortfolio();
  const opps = await storage.getOpportunities();
  const openCount = opps.filter(o => o.status === "buy").length;
  const risk = evaluatePortfolioRisk(
    portfolio?.cashRemaining || 0,
    portfolio?.totalBudget || 0,
    openCount
  );
  if (risk.killSwitchActive) {
    return res.status(403).json({ error: "KILL SWITCH ACTIVE: Portfolio drawdown exceeds 10%. No new trades allowed." });
  }
  // ... rest of handler
});
```

---

### HIGH: No Maximum Loss Limit Before Halting

While the kill switch triggers at 10% portfolio drawdown, it's advisory only (see above). There is no hard stop that:
- Halts all trading when cumulative losses exceed a threshold
- Closes all positions when drawdown exceeds a severe threshold (e.g., 15%)
- Sends an alert/notification when the kill switch would activate

**Fix:** Implement an enforced circuit breaker in the execute endpoint and also in the pipeline.

---

### HIGH: Maximum Position Limit Not Enforced at Execution

`convictionSize()` caps at 10 positions, but the execute endpoint doesn't check this limit. You can execute orders for 15+ opportunities if they all have allocations.

**File:** `server/routes.ts`, lines 1125–1156  
**Fix:** Check open position count before allowing new executions.

---

### MEDIUM: Floating Point Precision

Financial calculations use JavaScript's native floating point (`number` type). While the code applies `Math.round(x * 100) / 100` for dollar amounts (2 decimal places), this is applied inconsistently:

- `scoring-engine.ts` rounds allocation to 2 decimal places ✓
- `execution-engine.ts:152` rounds `currentValue` and `pnl` ✓
- `alpaca-service.ts:67–68` uses `toFixed(2)` for prices ✓
- But intermediate calculations in `risk-manager.ts` and P&L routes use raw floating point

For a $100 budget this is tolerable, but as budget increases, accumulated rounding errors could compound.

**Fix:** Consider using integer-cent arithmetic (`amount * 100` stored as integers) for all financial values, or a library like `decimal.js`.

---

### MEDIUM: Fallback Defaults for Missing Price Data

In `routes.ts` line 1139:
```typescript
const targetPrice = opp.targetPrice || opp.entryPrice! * 1.1;
const stopLoss = opp.stopLoss || opp.entryPrice! * 0.95;
```

If `opp.entryPrice` is null (the `!` non-null assertion fails silently at runtime — it becomes `NaN * 1.1 = NaN`), the bracket order is submitted with NaN values to Alpaca. Alpaca will reject it, but this is a data integrity issue.

**Fix:** Validate all price fields are present and positive before placing orders:
```typescript
if (!opp.entryPrice || opp.entryPrice <= 0) {
  return res.status(400).json({ error: "Entry price required" });
}
```

---

## 4. DATA INTEGRITY — Grade: C+

### Predictions Immutability: B+

The predictions table is append-only — `createPrediction()` is the only write operation, and there is no `updatePrediction()` or `deletePrediction()` method in the storage interface. The schema marks the `timestamp` field as immutable in comments.

**However**, there is nothing preventing direct SQL access to modify predictions, and there are no database-level triggers or constraints preventing updates. The `predictions` table has no `UNIQUE` constraint on `(opportunityId, timestamp)` to prevent exact duplicates.

**Fix:** Add a database trigger to prevent updates/deletes on the predictions table.

---

### Audit Trail Completeness: C

Predictions are created on:
- New opportunity creation ✓
- Signal updates ✓
- Pipeline auto-scoring ✓

But they are **NOT** created on:
- Manual order execution (`POST /api/alpaca/execute/:id`) — no prediction or audit record
- Position closure (`POST /api/alpaca/sell/:id`) — no audit record
- Close-all action (`POST /api/alpaca/close-all`) — no audit record
- Pipeline approval (`POST /api/pipeline/approve`) — no audit record

This means actual trading actions leave no trace in the audit trail.

**Fix:** Create audit records for all trading actions (executions, closures, approvals).

---

### Screener Attribution Trustworthiness: B

Screener hits are stored as a JSON array in `screenerFlags` with metadata including `screenerId`, `screenerName`, `reason`, `confidence`, and `detectedAt`. The `addScannedOpportunity` function in `universe-scanner.ts` constructs this correctly.

**Issue:** The `POST /api/universe/scan/add` endpoint (routes.ts) accepts screener data from the frontend, meaning an attacker could attribute fake screener hits:

```typescript
const { ticker, name, screeners } = req.body;
```

**Fix:** Screener data should only be generated server-side, never accepted from the client.

---

### Data Modification Risks: C-

- `PATCH /api/opportunities/:id` allows modifying any field, including `status`, `entryPrice`, `screenerFlags`, and `createdAt` — no field whitelist
- `PATCH /api/portfolio` allows modifying `totalBudget`, `totalPnl`, `winRate` directly — financial records should be derived, not manually editable
- `DELETE /api/opportunities/:id` permanently deletes data with no soft-delete or archive mechanism

---

## Summary of Issues by Severity

### CRITICAL (Must fix before any trading)

| # | Issue | File | Line |
|---|-------|------|------|
| C1 | No authentication on any endpoint | `server/index.ts` | all |
| C2 | API keys stored as plaintext in SQLite | `server/storage.ts` | 156–161 |
| C3 | Secret key exposed via GET /api/settings (masking bug) | `server/routes.ts` | 766 |
| C4 | POST /api/settings returns full plaintext secret | `server/routes.ts` | 782 |
| C5 | No duplicate order prevention | `server/routes.ts` | 1125–1156 |
| C6 | No daily trade limit | — | — |
| C7 | Kill switch not enforced at execution layer | `server/routes.ts` | 1125–1156 |

### HIGH (Should fix soon)

| # | Issue | File | Line |
|---|-------|------|------|
| H1 | No rate limiting on any endpoint | `server/index.ts` | — |
| H2 | Unauthenticated TradingView webhook | `server/routes.ts` | 524–548 |
| H3 | Command injection risk via execSync | 6 server files | various |
| H4 | Alpaca URL path injection | `server/alpaca-service.ts` | 46, 55, 90 |
| H5 | No maximum loss halt | — | — |
| H6 | Max position limit not enforced at execution | `server/routes.ts` | 1125 |
| H7 | No transactions for multi-step database operations | `server/storage.ts` | all |
| H8 | Pipeline not idempotent (creates duplicates on re-run) | `server/execution-engine.ts` | 186 |

### MEDIUM (Improve when possible)

| # | Issue | File | Line |
|---|-------|------|------|
| M1 | No CORS configuration | `server/index.ts` | — |
| M2 | No CSRF protection | `server/index.ts` | — |
| M3 | No input validation (Zod schemas imported but unused) | `server/routes.ts` | 38, 135, 356 |
| M4 | Settings key not whitelisted | `server/routes.ts` | 779 |
| M5 | Error messages leak internal details | `server/routes.ts` | various |
| M6 | Floating point precision for financial math | various | various |
| M7 | NaN price values possible in bracket orders | `server/routes.ts` | 1139 |
| M8 | No audit trail for actual trade executions | `server/routes.ts` | 1125, 1159, 1179 |
| M9 | Opportunity PATCH allows modification of any field | `server/routes.ts` | 135 |
| M10 | No soft-delete for opportunities | `server/routes.ts` | 227 |
| M11 | Portfolio financials manually editable | `server/routes.ts` | 374 |
| M12 | Screener data accepted from client | `server/routes.ts` | 1041 |

---

## Recommended Fix Priority

### Phase 1: Stop the Bleeding (before any trading)
1. Add authentication middleware to all mutation endpoints
2. Fix the secret key masking bug (change `includes("api_key")` to also check `"secret"`)
3. Stop returning secret values in POST /api/settings response
4. Add duplicate order check in execute endpoint
5. Enforce kill switch in execute endpoint
6. Add daily trade limit

### Phase 2: Harden (within 1 week)
7. Add rate limiting via `express-rate-limit`
8. Replace `execSync` with `execFileSync`
9. Validate Alpaca symbol format
10. Add webhook secret validation
11. Encrypt API keys at rest
12. Add database transactions for multi-step operations

### Phase 3: Strengthen (within 1 month)
13. Implement Zod validation on all request bodies
14. Add CORS and CSRF protection
15. Add audit trail for trade executions
16. Add pipeline idempotency (run lock + dedup)
17. Whitelist settings keys
18. Add structured error handling with error codes
19. Break routes.ts into modular route files

---

## Per-Category Grade Summary

| Category | Grade | Key Issue |
|----------|-------|-----------|
| **Security** | **F** | Zero authentication, plaintext secrets, secret exposure bug |
| **Architecture** | **B-** | Clean modules but no transactions, monolithic routes file |
| **Financial Safety** | **D** | No duplicate prevention, no trade limits, broken kill switch |
| **Data Integrity** | **C+** | Good prediction immutability, but no trade execution audit trail |
| **Overall** | **D+** | Not safe for live or paper trading with real broker credentials |

---

*This audit was conducted via static code analysis. No dynamic testing or penetration testing was performed. All line numbers reference the codebase as of 2026-03-29.*
