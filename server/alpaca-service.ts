import { storage } from "./storage";

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";

async function getAlpacaKeys(): Promise<{ apiKey: string; secretKey: string } | null> {
  const apiKey = await storage.getSetting("alpaca_api_key");
  const secretKey = await storage.getSetting("alpaca_secret_key");
  if (!apiKey?.value || !secretKey?.value) return null;
  return { apiKey: apiKey.value, secretKey: secretKey.value };
}

async function alpacaRequest(method: string, path: string, body?: any): Promise<any> {
  const keys = await getAlpacaKeys();
  if (!keys) throw new Error("Alpaca API keys not configured");

  const resp = await fetch(`${ALPACA_PAPER_URL}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": keys.apiKey,
      "APCA-API-SECRET-KEY": keys.secretKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Alpaca ${method} ${path}: ${resp.status} — ${err}`);
  }

  return resp.json();
}

// Get account info (balance, buying power, etc.)
export async function getAccount(): Promise<any> {
  return alpacaRequest("GET", "/v2/account");
}

// Get all open positions
export async function getPositions(): Promise<any[]> {
  return alpacaRequest("GET", "/v2/positions");
}

// Get position for a specific symbol
export async function getPosition(symbol: string): Promise<any> {
  try {
    return await alpacaRequest("GET", `/v2/positions/${symbol}`);
  } catch {
    return null;
  }
}

// Get all orders (open and recent)
export async function getOrders(status: string = "all", limit: number = 50): Promise<any[]> {
  return alpacaRequest("GET", `/v2/orders?status=${status}&limit=${limit}`);
}

// Place a bracket order (BUY with take-profit + stop-loss)
export async function placeBracketOrder(
  symbol: string,
  notional: number, // dollar amount to invest
  takeProfitPrice: number,
  stopLossPrice: number
): Promise<any> {
  return alpacaRequest("POST", "/v2/orders", {
    symbol: symbol.toUpperCase(),
    notional: notional.toFixed(2), // fractional dollar amount
    side: "buy",
    type: "market",
    time_in_force: "day",
    order_class: "bracket",
    take_profit: { limit_price: takeProfitPrice.toFixed(2) },
    stop_loss: { stop_price: stopLossPrice.toFixed(2) },
  });
}

// Place a simple market sell order (close entire position)
export async function placeSellOrder(symbol: string, qty: string): Promise<any> {
  return alpacaRequest("POST", "/v2/orders", {
    symbol: symbol.toUpperCase(),
    qty,
    side: "sell",
    type: "market",
    time_in_force: "day",
  });
}

// Close a position entirely
export async function closePosition(symbol: string): Promise<any> {
  return alpacaRequest("DELETE", `/v2/positions/${symbol}`);
}

// Close all positions
export async function closeAllPositions(): Promise<any> {
  return alpacaRequest("DELETE", "/v2/positions");
}

// Check if Alpaca is connected
export async function isAlpacaConnected(): Promise<boolean> {
  try {
    const account = await getAccount();
    return !!account?.id;
  } catch {
    return false;
  }
}
