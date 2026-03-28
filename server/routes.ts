import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreOpportunity, suggestAction, computePriceLevels } from "./scoring-engine";
import { insertOpportunitySchema, DEFAULT_WEIGHTS } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ========================
  // OPPORTUNITIES
  // ========================
  
  app.get("/api/opportunities", async (_req, res) => {
    const opps = await storage.getOpportunities();
    res.json(opps);
  });

  app.get("/api/opportunities/:id", async (req, res) => {
    const opp = await storage.getOpportunity(Number(req.params.id));
    if (!opp) return res.status(404).json({ error: "Not found" });
    res.json(opp);
  });

  app.post("/api/opportunities", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const data = {
        ...req.body,
        createdAt: now,
        updatedAt: now,
      };

      const opp = await storage.createOpportunity(data);

      // Auto-score the opportunity
      const weights = await storage.getWeights(opp.domain) || {
        momentum: DEFAULT_WEIGHTS.momentum,
        meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality,
        flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk,
        crowding: DEFAULT_WEIGHTS.crowding,
      };

      const portfolio = await storage.getPortfolio();
      const budget = portfolio?.cashRemaining || 100;

      const result = scoreOpportunity(
        {
          momentum: opp.momentum,
          meanReversion: opp.meanReversion,
          quality: opp.quality,
          flow: opp.flow,
          risk: opp.risk,
          crowding: opp.crowding,
        },
        {
          momentum: weights.momentum,
          meanReversion: weights.meanReversion,
          quality: weights.quality,
          flow: weights.flow,
          risk: weights.risk,
          crowding: weights.crowding,
        },
        budget
      );

      const action = suggestAction(result);

      // Update opportunity with scores
      const updated = await storage.updateOpportunity(opp.id, {
        compositeScore: result.compositeScore,
        probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge,
        kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand,
        suggestedAllocation: result.suggestedAllocation,
        status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
        updatedAt: now,
      });

      // Create prediction audit record
      await storage.createPrediction({
        opportunityId: opp.id,
        action,
        compositeScore: result.compositeScore,
        probabilityOfSuccess: result.probabilityOfSuccess,
        expectedEdge: result.expectedEdge,
        kellyFraction: result.kellyFraction,
        convictionBand: result.convictionBand,
        suggestedAllocation: result.suggestedAllocation,
        entryPrice: opp.entryPrice,
        targetPrice: opp.targetPrice,
        stopLoss: opp.stopLoss,
        currentPrice: opp.entryPrice,
        reasoning: `Auto-scored: Composite=${result.compositeScore.toFixed(3)}, P(success)=${(result.probabilityOfSuccess * 100).toFixed(1)}%, Edge=${result.expectedEdge.toFixed(3)}`,
        signalSnapshot: JSON.stringify({
          momentum: opp.momentum,
          meanReversion: opp.meanReversion,
          quality: opp.quality,
          flow: opp.flow,
          risk: opp.risk,
          crowding: opp.crowding,
          weights,
        }),
        timestamp: now,
      });

      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const now = new Date().toISOString();
      
      const opp = await storage.getOpportunity(id);
      if (!opp) return res.status(404).json({ error: "Not found" });

      const updatedData = { ...req.body, updatedAt: now };
      const updated = await storage.updateOpportunity(id, updatedData);
      
      if (!updated) return res.status(404).json({ error: "Update failed" });

      // Re-score if signals changed
      if (req.body.momentum !== undefined || req.body.meanReversion !== undefined || 
          req.body.quality !== undefined || req.body.flow !== undefined ||
          req.body.risk !== undefined || req.body.crowding !== undefined) {
        
        const weights = await storage.getWeights(updated.domain) || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };

        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: updated.momentum,
            meanReversion: updated.meanReversion,
            quality: updated.quality,
            flow: updated.flow,
            risk: updated.risk,
            crowding: updated.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);

        const rescored = await storage.updateOpportunity(id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          updatedAt: now,
        });

        // Create new prediction record for audit trail
        await storage.createPrediction({
          opportunityId: id,
          action,
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          entryPrice: updated.entryPrice,
          targetPrice: updated.targetPrice,
          stopLoss: updated.stopLoss,
          currentPrice: updated.entryPrice,
          reasoning: `Re-scored: signals updated`,
          signalSnapshot: JSON.stringify({
            momentum: updated.momentum,
            meanReversion: updated.meanReversion,
            quality: updated.quality,
            flow: updated.flow,
            risk: updated.risk,
            crowding: updated.crowding,
            weights,
          }),
          timestamp: now,
        });

        res.json(rescored);
      } else {
        res.json(updated);
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/opportunities/:id", async (req, res) => {
    await storage.deleteOpportunity(Number(req.params.id));
    res.json({ ok: true });
  });

  // ========================
  // SCORE / RESCORE
  // ========================
  
  app.post("/api/score", async (req, res) => {
    try {
      const { signals, domain, budget = 100 } = req.body;
      const weights = await storage.getWeights(domain) || {
        momentum: DEFAULT_WEIGHTS.momentum,
        meanReversion: DEFAULT_WEIGHTS.mean_reversion,
        quality: DEFAULT_WEIGHTS.quality,
        flow: DEFAULT_WEIGHTS.flow,
        risk: DEFAULT_WEIGHTS.risk,
        crowding: DEFAULT_WEIGHTS.crowding,
      };

      const result = scoreOpportunity(signals, {
        momentum: weights.momentum,
        meanReversion: weights.meanReversion,
        quality: weights.quality,
        flow: weights.flow,
        risk: weights.risk,
        crowding: weights.crowding,
      }, budget);

      const action = suggestAction(result);
      res.json({ ...result, action });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Rescore ALL opportunities
  app.post("/api/rescore-all", async (_req, res) => {
    try {
      const opps = await storage.getOpportunities();
      const now = new Date().toISOString();
      const results = [];

      for (const opp of opps) {
        const weights = await storage.getWeights(opp.domain) || {
          momentum: DEFAULT_WEIGHTS.momentum,
          meanReversion: DEFAULT_WEIGHTS.mean_reversion,
          quality: DEFAULT_WEIGHTS.quality,
          flow: DEFAULT_WEIGHTS.flow,
          risk: DEFAULT_WEIGHTS.risk,
          crowding: DEFAULT_WEIGHTS.crowding,
        };

        const portfolio = await storage.getPortfolio();
        const budget = portfolio?.cashRemaining || 100;

        const result = scoreOpportunity(
          {
            momentum: opp.momentum,
            meanReversion: opp.meanReversion,
            quality: opp.quality,
            flow: opp.flow,
            risk: opp.risk,
            crowding: opp.crowding,
          },
          {
            momentum: weights.momentum,
            meanReversion: weights.meanReversion,
            quality: weights.quality,
            flow: weights.flow,
            risk: weights.risk,
            crowding: weights.crowding,
          },
          budget
        );

        const action = suggestAction(result);

        await storage.updateOpportunity(opp.id, {
          compositeScore: result.compositeScore,
          probabilityOfSuccess: result.probabilityOfSuccess,
          expectedEdge: result.expectedEdge,
          kellyFraction: result.kellyFraction,
          convictionBand: result.convictionBand,
          suggestedAllocation: result.suggestedAllocation,
          status: action === "BUY" ? "buy" : action === "SELL" ? "sell" : "watch",
          updatedAt: now,
        });

        results.push({ id: opp.id, name: opp.name, ...result, action });
      }

      res.json(results);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // PREDICTIONS (Audit Trail)
  // ========================
  
  app.get("/api/predictions", async (req, res) => {
    const oppId = req.query.opportunityId ? Number(req.query.opportunityId) : undefined;
    const preds = await storage.getPredictions(oppId);
    res.json(preds);
  });

  // ========================
  // PERFORMANCE
  // ========================
  
  app.get("/api/performance", async (req, res) => {
    const oppId = req.query.opportunityId ? Number(req.query.opportunityId) : undefined;
    const perfs = await storage.getPerformance(oppId);
    res.json(perfs);
  });

  // ========================
  // WEIGHTS
  // ========================
  
  app.get("/api/weights", async (_req, res) => {
    const weights = await storage.getAllWeights();
    res.json(weights);
  });

  app.patch("/api/weights/:domain", async (req, res) => {
    try {
      const updated = await storage.updateWeights(req.params.domain, req.body);
      if (!updated) return res.status(404).json({ error: "Domain not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // PORTFOLIO
  // ========================
  
  app.get("/api/portfolio", async (_req, res) => {
    const p = await storage.getPortfolio();
    res.json(p);
  });

  app.patch("/api/portfolio", async (req, res) => {
    try {
      const updated = await storage.updatePortfolio({
        ...req.body,
        updatedAt: new Date().toISOString(),
      });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================
  // STATS / DASHBOARD
  // ========================
  
  app.get("/api/stats", async (_req, res) => {
    const opps = await storage.getOpportunities();
    const preds = await storage.getPredictions();
    const portfolio = await storage.getPortfolio();

    const byDomain: Record<string, number> = {};
    const byConviction: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const opp of opps) {
      byDomain[opp.domain] = (byDomain[opp.domain] || 0) + 1;
      if (opp.convictionBand) {
        byConviction[opp.convictionBand] = (byConviction[opp.convictionBand] || 0) + 1;
      }
      byStatus[opp.status] = (byStatus[opp.status] || 0) + 1;
    }

    const avgScore = opps.length > 0 
      ? opps.reduce((sum, o) => sum + (o.compositeScore || 0), 0) / opps.length 
      : 0;

    const totalAllocated = opps
      .filter(o => o.status === "buy")
      .reduce((sum, o) => sum + (o.suggestedAllocation || 0), 0);

    res.json({
      totalOpportunities: opps.length,
      totalPredictions: preds.length,
      byDomain,
      byConviction,
      byStatus,
      avgCompositeScore: Math.round(avgScore * 1000) / 1000,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      portfolio,
    });
  });

  return httpServer;
}
