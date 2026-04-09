import {
  type Opportunity, type InsertOpportunity, opportunities,
  type Prediction, type InsertPrediction, predictions,
  type Performance, type InsertPerformance, performance,
  type WeightConfig, type InsertWeightConfig, weightConfig,
  type Portfolio, portfolio,
  type MarketData, type InsertMarketData, marketData,
  type WebhookAlert, type InsertWebhookAlert, webhookAlerts,
  type PublishedPrediction, type InsertPublishedPrediction, publishedPredictions,
  type BenzingaNews, type InsertBenzingaNews, benzingaNews,
  type AppSetting, type InsertAppSetting, appSettings,
  type Watchlist, type InsertWatchlist, watchlists,
  type WatchlistItem, type InsertWatchlistItem, watchlistItems,
  type Notification, type InsertNotification, notifications,
  DEFAULT_WEIGHTS, DOMAINS,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, sql, and } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto-utils";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Initialize tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ticker TEXT,
    domain TEXT NOT NULL,
    description TEXT,
    momentum REAL NOT NULL DEFAULT 50,
    mean_reversion REAL NOT NULL DEFAULT 50,
    quality REAL NOT NULL DEFAULT 50,
    flow REAL NOT NULL DEFAULT 50,
    risk REAL NOT NULL DEFAULT 50,
    crowding REAL NOT NULL DEFAULT 50,
    composite_score REAL,
    probability_of_success REAL,
    expected_edge REAL,
    kelly_fraction REAL,
    conviction_band TEXT,
    suggested_allocation REAL,
    entry_price REAL,
    target_price REAL,
    stop_loss REAL,
    status TEXT NOT NULL DEFAULT 'watch',
    screener_flags TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    composite_score REAL NOT NULL,
    probability_of_success REAL NOT NULL,
    expected_edge REAL NOT NULL,
    kelly_fraction REAL NOT NULL,
    conviction_band TEXT NOT NULL,
    suggested_allocation REAL NOT NULL,
    entry_price REAL,
    target_price REAL,
    stop_loss REAL,
    current_price REAL,
    reasoning TEXT,
    signal_snapshot TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL,
    prediction_id INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL NOT NULL,
    pnl REAL NOT NULL,
    pnl_percent REAL NOT NULL,
    holding_days INTEGER NOT NULL,
    status TEXT NOT NULL,
    closed_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weight_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    momentum REAL NOT NULL DEFAULT 0.20,
    mean_reversion REAL NOT NULL DEFAULT 0.15,
    quality REAL NOT NULL DEFAULT 0.25,
    flow REAL NOT NULL DEFAULT 0.15,
    risk REAL NOT NULL DEFAULT 0.15,
    crowding REAL NOT NULL DEFAULT 0.10
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_budget REAL NOT NULL DEFAULT 100,
    allocated_amount REAL NOT NULL DEFAULT 0,
    cash_remaining REAL NOT NULL DEFAULT 100,
    total_pnl REAL NOT NULL DEFAULT 0,
    total_pnl_percent REAL NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume INTEGER,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    raw_payload TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS published_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id INTEGER NOT NULL,
    opportunity_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    post_content TEXT NOT NULL,
    published_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS benzinga_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benzinga_id TEXT NOT NULL,
    ticker TEXT,
    title TEXT NOT NULL,
    body TEXT,
    url TEXT,
    author TEXT,
    source TEXT,
    channels TEXT,
    tags TEXT,
    sentiment REAL,
    is_wiim INTEGER NOT NULL DEFAULT 0,
    published_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    added_at TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    ticker TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    shares REAL NOT NULL,
    avg_entry_price REAL NOT NULL,
    current_price REAL,
    side TEXT NOT NULL DEFAULT 'long',
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    realized_pnl REAL,
    status TEXT NOT NULL DEFAULT 'open'
  );

  CREATE TABLE IF NOT EXISTS paper_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    action TEXT NOT NULL,
    shares REAL NOT NULL,
    price REAL NOT NULL,
    opportunity_id INTEGER,
    status TEXT NOT NULL DEFAULT 'filled',
    created_at TEXT NOT NULL
  );
`);

// Migrate: add screener_flags column if it doesn't exist
try {
  sqlite.exec(`ALTER TABLE opportunities ADD COLUMN screener_flags TEXT`);
} catch (_e) {
  // Column already exists — ignore
}

// Migrate: add thesis column if it doesn't exist
try {
  sqlite.exec(`ALTER TABLE opportunities ADD COLUMN thesis TEXT`);
} catch (_e) {
  // Column already exists — ignore
}

// Seed default weights if empty
const existingWeights = db.select().from(weightConfig).all();
if (existingWeights.length === 0) {
  for (const domain of DOMAINS) {
    db.insert(weightConfig).values({
      domain,
      momentum: DEFAULT_WEIGHTS.momentum,
      meanReversion: DEFAULT_WEIGHTS.mean_reversion,
      quality: DEFAULT_WEIGHTS.quality,
      flow: DEFAULT_WEIGHTS.flow,
      risk: DEFAULT_WEIGHTS.risk,
      crowding: DEFAULT_WEIGHTS.crowding,
    }).run();
  }
}

// Seed portfolio if empty
const existingPortfolio = db.select().from(portfolio).all();
if (existingPortfolio.length === 0) {
  db.insert(portfolio).values({
    totalBudget: 100,
    allocatedAmount: 0,
    cashRemaining: 100,
    totalPnl: 0,
    totalPnlPercent: 0,
    winRate: 0,
    totalTrades: 0,
    updatedAt: new Date().toISOString(),
  }).run();
}

export interface IStorage {
  // Opportunities
  getOpportunities(): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  createOpportunity(opp: InsertOpportunity): Promise<Opportunity>;
  updateOpportunity(id: number, data: Partial<Opportunity>): Promise<Opportunity | undefined>;
  deleteOpportunity(id: number): Promise<void>;

  // Predictions
  getPredictions(opportunityId?: number): Promise<Prediction[]>;
  createPrediction(pred: InsertPrediction): Promise<Prediction>;

  // Performance
  getPerformance(opportunityId?: number): Promise<Performance[]>;
  createPerformance(perf: InsertPerformance): Promise<Performance>;
  updatePerformance(id: number, data: Partial<Performance>): Promise<Performance | undefined>;

  // Weights
  getWeights(domain: string): Promise<WeightConfig | undefined>;
  getAllWeights(): Promise<WeightConfig[]>;
  updateWeights(domain: string, data: Partial<WeightConfig>): Promise<WeightConfig | undefined>;

  // Portfolio
  getPortfolio(): Promise<Portfolio | undefined>;
  updatePortfolio(data: Partial<Portfolio>): Promise<Portfolio | undefined>;

  // Market Data
  getMarketData(ticker: string): Promise<MarketData[]>;
  getLatestMarketData(ticker: string): Promise<MarketData | undefined>;
  upsertMarketData(data: InsertMarketData): Promise<MarketData>;
  seedMarketData(ticker: string, rows: InsertMarketData[]): Promise<void>;

  // Webhook Alerts
  createWebhookAlert(alert: InsertWebhookAlert): Promise<WebhookAlert>;
  getWebhookAlerts(limit?: number): Promise<WebhookAlert[]>;
  markAlertProcessed(id: number): Promise<void>;

  // Published Predictions
  createPublishedPrediction(pub: InsertPublishedPrediction): Promise<PublishedPrediction>;
  getPublishedPredictions(): Promise<PublishedPrediction[]>;

  // Benzinga News
  getBenzingaNews(ticker?: string, limit?: number): Promise<BenzingaNews[]>;
  saveBenzingaNews(news: InsertBenzingaNews): Promise<BenzingaNews>;
  getNewsForTicker(ticker: string, limit?: number): Promise<BenzingaNews[]>;

  // App Settings
  getSetting(key: string): Promise<AppSetting | undefined>;
  upsertSetting(key: string, value: string): Promise<AppSetting>;
  getAllSettings(): Promise<AppSetting[]>;
}

export class DatabaseStorage implements IStorage {
  async getOpportunities(): Promise<Opportunity[]> {
    return db.select().from(opportunities).orderBy(desc(opportunities.compositeScore)).all();
  }

  async getOpportunity(id: number): Promise<Opportunity | undefined> {
    return db.select().from(opportunities).where(eq(opportunities.id, id)).get();
  }

  async createOpportunity(opp: InsertOpportunity): Promise<Opportunity> {
    return db.insert(opportunities).values(opp).returning().get();
  }

  async updateOpportunity(id: number, data: Partial<Opportunity>): Promise<Opportunity | undefined> {
    const result = db.update(opportunities).set(data).where(eq(opportunities.id, id)).returning().get();
    return result;
  }

  async deleteOpportunity(id: number): Promise<void> {
    db.delete(opportunities).where(eq(opportunities.id, id)).run();
  }

  async getPredictions(opportunityId?: number): Promise<Prediction[]> {
    if (opportunityId) {
      return db.select().from(predictions).where(eq(predictions.opportunityId, opportunityId)).orderBy(desc(predictions.timestamp)).all();
    }
    return db.select().from(predictions).orderBy(desc(predictions.timestamp)).all();
  }

  async createPrediction(pred: InsertPrediction): Promise<Prediction> {
    return db.insert(predictions).values(pred).returning().get();
  }

  async getPerformance(opportunityId?: number): Promise<Performance[]> {
    if (opportunityId) {
      return db.select().from(performance).where(eq(performance.opportunityId, opportunityId)).orderBy(desc(performance.updatedAt)).all();
    }
    return db.select().from(performance).orderBy(desc(performance.updatedAt)).all();
  }

  async createPerformance(perf: InsertPerformance): Promise<Performance> {
    return db.insert(performance).values(perf).returning().get();
  }

  async updatePerformance(id: number, data: Partial<Performance>): Promise<Performance | undefined> {
    return db.update(performance).set(data).where(eq(performance.id, id)).returning().get();
  }

  async getWeights(domain: string): Promise<WeightConfig | undefined> {
    return db.select().from(weightConfig).where(eq(weightConfig.domain, domain)).get();
  }

  async getAllWeights(): Promise<WeightConfig[]> {
    return db.select().from(weightConfig).all();
  }

  async updateWeights(domain: string, data: Partial<WeightConfig>): Promise<WeightConfig | undefined> {
    return db.update(weightConfig).set(data).where(eq(weightConfig.domain, domain)).returning().get();
  }

  async getPortfolio(): Promise<Portfolio | undefined> {
    return db.select().from(portfolio).get();
  }

  async updatePortfolio(data: Partial<Portfolio>): Promise<Portfolio | undefined> {
    const existing = db.select().from(portfolio).get();
    if (existing) {
      return db.update(portfolio).set(data).where(eq(portfolio.id, existing.id)).returning().get();
    }
    return undefined;
  }

  // Market Data
  async getMarketData(ticker: string): Promise<MarketData[]> {
    return db.select().from(marketData)
      .where(eq(marketData.ticker, ticker.toUpperCase()))
      .orderBy(marketData.date)
      .all();
  }

  async getLatestMarketData(ticker: string): Promise<MarketData | undefined> {
    return db.select().from(marketData)
      .where(eq(marketData.ticker, ticker.toUpperCase()))
      .orderBy(desc(marketData.date))
      .get();
  }

  async upsertMarketData(data: InsertMarketData): Promise<MarketData> {
    // Check if row exists for this ticker+date
    const existing = db.select().from(marketData)
      .where(and(eq(marketData.ticker, data.ticker), eq(marketData.date, data.date)))
      .get();
    if (existing) {
      return db.update(marketData).set(data).where(eq(marketData.id, existing.id)).returning().get()!;
    }
    return db.insert(marketData).values(data).returning().get();
  }

  async seedMarketData(ticker: string, rows: InsertMarketData[]): Promise<void> {
    for (const row of rows) {
      await this.upsertMarketData({ ...row, ticker: ticker.toUpperCase() });
    }
  }

  // Webhook Alerts
  async createWebhookAlert(alert: InsertWebhookAlert): Promise<WebhookAlert> {
    return db.insert(webhookAlerts).values(alert).returning().get();
  }

  async getWebhookAlerts(limit = 50): Promise<WebhookAlert[]> {
    return db.select().from(webhookAlerts)
      .orderBy(desc(webhookAlerts.receivedAt))
      .limit(limit)
      .all();
  }

  async markAlertProcessed(id: number): Promise<void> {
    db.update(webhookAlerts).set({ processed: 1 }).where(eq(webhookAlerts.id, id)).run();
  }

  // Published Predictions
  async createPublishedPrediction(pub: InsertPublishedPrediction): Promise<PublishedPrediction> {
    return db.insert(publishedPredictions).values(pub).returning().get();
  }

  async getPublishedPredictions(): Promise<PublishedPrediction[]> {
    return db.select().from(publishedPredictions).orderBy(desc(publishedPredictions.publishedAt)).all();
  }

  // Benzinga News
  async getBenzingaNews(ticker?: string, limit = 50): Promise<BenzingaNews[]> {
    if (ticker) {
      return db.select().from(benzingaNews)
        .where(eq(benzingaNews.ticker, ticker.toUpperCase()))
        .orderBy(desc(benzingaNews.publishedAt))
        .limit(limit)
        .all();
    }
    return db.select().from(benzingaNews)
      .orderBy(desc(benzingaNews.publishedAt))
      .limit(limit)
      .all();
  }

  async saveBenzingaNews(news: InsertBenzingaNews): Promise<BenzingaNews> {
    return db.insert(benzingaNews).values(news).returning().get();
  }

  async getNewsForTicker(ticker: string, limit = 20): Promise<BenzingaNews[]> {
    return db.select().from(benzingaNews)
      .where(eq(benzingaNews.ticker, ticker.toUpperCase()))
      .orderBy(desc(benzingaNews.publishedAt))
      .limit(limit)
      .all();
  }

  // App Settings
  // Helper to determine if a setting key holds a sensitive value
  private isSensitiveKey(key: string): boolean {
    return key.includes("key") || key.includes("secret") || key.includes("token");
  }

  async getSetting(key: string): Promise<AppSetting | undefined> {
    const setting = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (!setting) return undefined;
    // Decrypt value if this is a sensitive key
    if (this.isSensitiveKey(key)) {
      return { ...setting, value: decrypt(setting.value) };
    }
    return setting;
  }

  async upsertSetting(key: string, value: string): Promise<AppSetting> {
    const now = new Date().toISOString();
    // Encrypt value if this is a sensitive key
    const storedValue = this.isSensitiveKey(key) ? encrypt(value) : value;
    const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (existing) {
      return db.update(appSettings)
        .set({ value: storedValue, updatedAt: now })
        .where(eq(appSettings.key, key))
        .returning()
        .get()!;
    }
    return db.insert(appSettings).values({ key, value: storedValue, updatedAt: now }).returning().get();
  }

  async getAllSettings(): Promise<AppSetting[]> {
    const settings = db.select().from(appSettings).all();
    // Decrypt sensitive values
    return settings.map(s => ({
      ...s,
      value: this.isSensitiveKey(s.key) ? decrypt(s.value) : s.value,
    }));
  }

  // Watchlists
  async getWatchlists(): Promise<Watchlist[]> {
    return db.select().from(watchlists).orderBy(desc(watchlists.createdAt)).all();
  }

  async getWatchlist(id: number): Promise<Watchlist | undefined> {
    return db.select().from(watchlists).where(eq(watchlists.id, id)).get();
  }

  async createWatchlist(data: InsertWatchlist): Promise<Watchlist> {
    return db.insert(watchlists).values(data).returning().get();
  }

  async deleteWatchlist(id: number): Promise<void> {
    db.delete(watchlistItems).where(eq(watchlistItems.watchlistId, id)).run();
    db.delete(watchlists).where(eq(watchlists.id, id)).run();
  }

  async getWatchlistItems(watchlistId: number): Promise<WatchlistItem[]> {
    return db.select().from(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId)).orderBy(desc(watchlistItems.addedAt)).all();
  }

  async addWatchlistItem(data: InsertWatchlistItem): Promise<WatchlistItem> {
    return db.insert(watchlistItems).values(data).returning().get();
  }

  async removeWatchlistItem(id: number): Promise<void> {
    db.delete(watchlistItems).where(eq(watchlistItems.id, id)).run();
  }

  // Notifications
  async getNotifications(limit = 50): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit).all();
  }

  async getUnreadNotificationCount(): Promise<number> {
    const result = db.select({ count: sql<number>`count(*)` }).from(notifications).where(eq(notifications.read, 0)).get();
    return result?.count ?? 0;
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    return db.insert(notifications).values(data).returning().get();
  }

  async markNotificationRead(id: number): Promise<void> {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id)).run();
  }

  async markAllNotificationsRead(): Promise<void> {
    db.update(notifications).set({ read: 1 }).where(eq(notifications.read, 0)).run();
  }
}

export const storage = new DatabaseStorage();
