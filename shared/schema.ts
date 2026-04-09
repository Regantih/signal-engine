import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Domain types for cross-domain scoring
export const DOMAINS = ["public_markets", "vc_themes", "content_brand", "side_business"] as const;
export type Domain = typeof DOMAINS[number];

export const DOMAIN_LABELS: Record<Domain, string> = {
  public_markets: "Public Markets",
  vc_themes: "VC Themes",
  content_brand: "Content / Brand",
  side_business: "Side Business",
};

// Signal weights configuration
export const DEFAULT_WEIGHTS = {
  momentum: 0.20,
  mean_reversion: 0.15,
  quality: 0.25,
  flow: 0.15,
  risk: 0.15,
  crowding: 0.10,
};

// Opportunities table - the core entity
export const opportunities = sqliteTable("opportunities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ticker: text("ticker"), // for public markets
  domain: text("domain").notNull(), // public_markets | vc_themes | content_brand | side_business
  description: text("description"),
  
  // Raw signal inputs (0-100 scale)
  momentum: real("momentum").notNull().default(50),
  meanReversion: real("mean_reversion").notNull().default(50),
  quality: real("quality").notNull().default(50),
  flow: real("flow").notNull().default(50),
  risk: real("risk").notNull().default(50),
  crowding: real("crowding").notNull().default(50),
  
  // Computed scores
  compositeScore: real("composite_score"),
  probabilityOfSuccess: real("probability_of_success"),
  expectedEdge: real("expected_edge"),
  kellyFraction: real("kelly_fraction"),
  convictionBand: text("conviction_band"), // "high" | "medium" | "low" | "avoid"
  
  // Position sizing ($100 budget)
  suggestedAllocation: real("suggested_allocation"),
  entryPrice: real("entry_price"),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  
  // AI thesis
  thesis: text("thesis"), // AI-generated trade analysis text

  // Status
  status: text("status").notNull().default("watch"), // watch | buy | sell | closed
  screenerFlags: text("screener_flags"), // JSON array of screener attributions
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Predictions table - immutable audit trail
export const predictions = sqliteTable("predictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id").notNull(),
  action: text("action").notNull(), // "BUY" | "SELL" | "WATCH" | "CLOSE"
  compositeScore: real("composite_score").notNull(),
  probabilityOfSuccess: real("probability_of_success").notNull(),
  expectedEdge: real("expected_edge").notNull(),
  kellyFraction: real("kelly_fraction").notNull(),
  convictionBand: text("conviction_band").notNull(),
  suggestedAllocation: real("suggested_allocation").notNull(),
  entryPrice: real("entry_price"),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  currentPrice: real("current_price"),
  reasoning: text("reasoning"),
  signalSnapshot: text("signal_snapshot").notNull(), // JSON of all signal values at time of prediction
  timestamp: text("timestamp").notNull(), // ISO string - immutable audit
  // Accountability ledger fields
  resolvedAt: text("resolved_at"), // ISO string when prediction was resolved
  resolvedPrice: real("resolved_price"), // price at resolution time
  actualReturn: real("actual_return"), // percentage return
  wasCorrect: integer("was_correct"), // 1 = win, 0 = open, -1 = loss
  resolutionNotes: text("resolution_notes"), // human-readable explanation
});

// Performance tracking
export const performance = sqliteTable("performance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  opportunityId: integer("opportunity_id").notNull(),
  predictionId: integer("prediction_id").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price").notNull(),
  pnl: real("pnl").notNull(),
  pnlPercent: real("pnl_percent").notNull(),
  holdingDays: integer("holding_days").notNull(),
  status: text("status").notNull(), // "open" | "closed_win" | "closed_loss"
  closedAt: text("closed_at"),
  updatedAt: text("updated_at").notNull(),
});

// Weight configuration (user-adjustable)
export const weightConfig = sqliteTable("weight_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),
  momentum: real("momentum").notNull().default(0.20),
  meanReversion: real("mean_reversion").notNull().default(0.15),
  quality: real("quality").notNull().default(0.25),
  flow: real("flow").notNull().default(0.15),
  risk: real("risk").notNull().default(0.15),
  crowding: real("crowding").notNull().default(0.10),
});

// Portfolio summary
export const portfolio = sqliteTable("portfolio", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  totalBudget: real("total_budget").notNull().default(100),
  allocatedAmount: real("allocated_amount").notNull().default(0),
  cashRemaining: real("cash_remaining").notNull().default(100),
  totalPnl: real("total_pnl").notNull().default(0),
  totalPnlPercent: real("total_pnl_percent").notNull().default(0),
  winRate: real("win_rate").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// Market data cache
export const marketData = sqliteTable("market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  date: text("date").notNull(),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  close: real("close").notNull(),
  volume: integer("volume"),
  fetchedAt: text("fetched_at").notNull(),
});

// TradingView webhook alerts
export const webhookAlerts = sqliteTable("webhook_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  alertType: text("alert_type").notNull(), // "price_cross", "indicator", "custom"
  message: text("message").notNull(),
  rawPayload: text("raw_payload").notNull(),
  processed: integer("processed").notNull().default(0),
  receivedAt: text("received_at").notNull(),
});

// Published predictions (for LinkedIn/X accountability)
export const publishedPredictions = sqliteTable("published_predictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  predictionId: integer("prediction_id").notNull(),
  opportunityId: integer("opportunity_id").notNull(),
  platform: text("platform").notNull(), // "linkedin" | "x" | "clipboard"
  postContent: text("post_content").notNull(),
  publishedAt: text("published_at").notNull(),
});

// Benzinga news cache
export const benzingaNews = sqliteTable("benzinga_news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  benzingaId: text("benzinga_id").notNull(),
  ticker: text("ticker"),
  title: text("title").notNull(),
  body: text("body"), // teaser or full body
  url: text("url"),
  author: text("author"),
  source: text("source"),
  channels: text("channels"), // JSON array of channels/categories
  tags: text("tags"), // JSON array
  sentiment: real("sentiment"), // -1 to 1 computed sentiment
  isWiim: integer("is_wiim").notNull().default(0), // WIIM = Why Is It Moving
  publishedAt: text("published_at").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

// Watchlists
export const watchlists = sqliteTable("watchlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

// Watchlist items
export const watchlistItems = sqliteTable("watchlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchlistId: integer("watchlist_id").notNull(),
  ticker: text("ticker").notNull(),
  addedAt: text("added_at").notNull(),
  notes: text("notes"),
});

// Notifications
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // sell_triggered, new_high_conviction, conviction_change, daily_summary
  title: text("title").notNull(),
  message: text("message").notNull(),
  ticker: text("ticker"),
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// App settings (key-value store for API keys etc)
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Paper trading tables
export const paperPositions = sqliteTable("paper_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  shares: real("shares").notNull(),
  avgEntryPrice: real("avg_entry_price").notNull(),
  currentPrice: real("current_price"),
  side: text("side").notNull().default("long"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  realizedPnl: real("realized_pnl"),
  status: text("status").notNull().default("open"), // open, closed
});

export const paperOrders = sqliteTable("paper_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  action: text("action").notNull(), // BUY, SELL
  shares: real("shares").notNull(),
  price: real("price").notNull(),
  opportunityId: integer("opportunity_id"),
  status: text("status").notNull().default("filled"),
  createdAt: text("created_at").notNull(),
});

// Insert schemas
export const insertOpportunitySchema = createInsertSchema(opportunities).omit({ id: true, compositeScore: true, probabilityOfSuccess: true, expectedEdge: true, kellyFraction: true, convictionBand: true, suggestedAllocation: true });
export const insertPredictionSchema = createInsertSchema(predictions).omit({ id: true });
export const insertPerformanceSchema = createInsertSchema(performance).omit({ id: true });
export const insertWeightConfigSchema = createInsertSchema(weightConfig).omit({ id: true });
export const insertMarketDataSchema = createInsertSchema(marketData).omit({ id: true });
export const insertWebhookAlertSchema = createInsertSchema(webhookAlerts).omit({ id: true });
export const insertPublishedPredictionSchema = createInsertSchema(publishedPredictions).omit({ id: true });
export const insertBenzingaNewsSchema = createInsertSchema(benzingaNews).omit({ id: true });
export const insertAppSettingSchema = createInsertSchema(appSettings).omit({ id: true });
export const insertPaperPositionSchema = createInsertSchema(paperPositions).omit({ id: true });
export const insertPaperOrderSchema = createInsertSchema(paperOrders).omit({ id: true });
export const insertWatchlistSchema = createInsertSchema(watchlists).omit({ id: true });
export const insertWatchlistItemSchema = createInsertSchema(watchlistItems).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });

// Types
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Performance = typeof performance.$inferSelect;
export type InsertPerformance = z.infer<typeof insertPerformanceSchema>;
export type WeightConfig = typeof weightConfig.$inferSelect;
export type InsertWeightConfig = z.infer<typeof insertWeightConfigSchema>;
export type Portfolio = typeof portfolio.$inferSelect;
export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type WebhookAlert = typeof webhookAlerts.$inferSelect;
export type InsertWebhookAlert = z.infer<typeof insertWebhookAlertSchema>;
export type PublishedPrediction = typeof publishedPredictions.$inferSelect;
export type InsertPublishedPrediction = z.infer<typeof insertPublishedPredictionSchema>;
export type BenzingaNews = typeof benzingaNews.$inferSelect;
export type InsertBenzingaNews = z.infer<typeof insertBenzingaNewsSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type PaperPosition = typeof paperPositions.$inferSelect;
export type InsertPaperPosition = z.infer<typeof insertPaperPositionSchema>;
export type PaperOrder = typeof paperOrders.$inferSelect;
export type InsertPaperOrder = z.infer<typeof insertPaperOrderSchema>;
export type Watchlist = typeof watchlists.$inferSelect;
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
