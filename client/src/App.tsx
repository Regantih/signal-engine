import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient, setAuthToken, getApiBase } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Opportunities from "@/pages/opportunities";
import Scoring from "@/pages/scoring";
import Audit from "@/pages/audit";
import PerformancePage from "@/pages/performance-page";
import Weights from "@/pages/weights";
import Market from "@/pages/market";
import News from "@/pages/news";
import SettingsPage from "@/pages/settings-page";
import Scanner from "@/pages/scanner";
import Trading from "@/pages/trading";
import Macro from "@/pages/macro";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scanner" component={Scanner} />
      <Route path="/trading" component={Trading} />
      <Route path="/macro" component={Macro} />
      <Route path="/opportunities" component={Opportunities} />
      <Route path="/scoring" component={Scoring} />
      <Route path="/audit" component={Audit} />
      <Route path="/performance" component={PerformancePage} />
      <Route path="/weights" component={Weights} />
      <Route path="/market" component={Market} />
      <Route path="/news" component={News} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Auto-login on startup — the app has a single shared password.
  // The JWT is stored in module memory (not localStorage, which is blocked).
  useEffect(() => {
    (async () => {
      try {
        const base = getApiBase();
        const res = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "SignalEngine2026!" }),
        });
        if (res.ok) {
          const data = await res.json();
          setAuthToken(data.token);
          // Refetch any cached queries now that we have a token
          queryClient.invalidateQueries();
        }
      } catch (e) {
        console.error("Auto-login failed:", e);
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <div className="flex h-screen overflow-hidden">
              <AppSidebar />
              <main className="flex-1 overflow-y-auto">
                <AppRouter />
              </main>
            </div>
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
