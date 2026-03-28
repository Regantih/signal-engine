import {
  type Opportunity, type InsertOpportunity, opportunities,
  type Prediction, type InsertPrediction, predictions,
  type Performance, type InsertPerformance, performance,
  type WeightConfig, type InsertWeightConfig, weightConfig,
  type Portfolio, portfolio,
  DEFAULT_WEIGHTS, DOMAINS,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, sql } from "drizzle-orm";

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
`);

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
    // Update the first (only) row
    const existing = db.select().from(portfolio).get();
    if (existing) {
      return db.update(portfolio).set(data).where(eq(portfolio.id, existing.id)).returning().get();
    }
    return undefined;
  }
}

export const storage = new DatabaseStorage();
