import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

// Generate a random session secret on server start (not hardcoded)
const SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const tokens = new Map<string, { expires: number }>(); // in-memory token store

// Hash password with SHA-256 + salt
function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

// The app password is set via environment variable or defaults to requiring setup
const APP_PASSWORD_HASH = process.env.APP_PASSWORD 
  ? hashPassword(process.env.APP_PASSWORD, "signal-engine-salt")
  : null;

export function generateToken(): string {
  const token = crypto.randomBytes(48).toString("hex");
  tokens.set(token, { expires: Date.now() + 24 * 60 * 60 * 1000 }); // 24h expiry
  return token;
}

export function validatePassword(password: string): boolean {
  if (!APP_PASSWORD_HASH) return false;
  return hashPassword(password, "signal-engine-salt") === APP_PASSWORD_HASH;
}

export function isPasswordSet(): boolean {
  return APP_PASSWORD_HASH !== null;
}

// Middleware: check Authorization header for Bearer token
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // If no password is configured, skip all auth (local-only mode)
  if (!APP_PASSWORD_HASH) { next(); return; }

  // Allow webhook endpoint without auth (TradingView needs it open, but add HMAC later)
  if (req.path === "/api/webhooks/tradingview") { next(); return; }
  
  // Allow login endpoint
  if (req.path === "/api/auth/login" || req.path === "/api/auth/status") { next(); return; }
  
  // Allow all GET requests to non-sensitive endpoints (read-only data)
  const sensitiveReadPaths = ["/api/settings", "/api/alpaca/"];
  const isSensitiveRead = sensitiveReadPaths.some(p => req.path.startsWith(p));
  if (req.method === "GET" && !isSensitiveRead) { next(); return; }
  
  // All POST/PATCH/DELETE and sensitive GETs require auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return;
  }
  
  const token = authHeader.slice(7);
  const session = tokens.get(token);
  if (!session || session.expires < Date.now()) {
    tokens.delete(token);
    res.status(401).json({ error: "Token expired or invalid", code: "TOKEN_INVALID" });
    return;
  }
  
  next();
}

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of tokens) {
    if (session.expires < now) tokens.delete(token);
  }
}, 60000); // every minute
