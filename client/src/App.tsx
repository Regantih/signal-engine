import { useState, useEffect } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { Onboarding } from "@/components/onboarding";
import { BottomNav } from "@/components/bottom-nav";
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
import Leaderboard from "@/pages/leaderboard";

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
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  const { data: opportunities } = useQuery<any[]>({
    queryKey: ["/api/opportunities"],
  });

  useEffect(() => {
    if (opportunities === undefined) return; // still loading

    let onboarded = false;
    try {
      onboarded = localStorage.getItem("signalEngine_onboarded") === "true";
    } catch { /* localStorage may be blocked */ }

    const hasData = opportunities && opportunities.length > 0;
    setShowOnboarding(!onboarded && !hasData);
    setOnboardingChecked(true);
  }, [opportunities]);

  if (!onboardingChecked) return null;

  return (
    <>
      {showOnboarding && (
        <Onboarding onComplete={() => {
          setShowOnboarding(false);
          queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
        }} />
      )}
      <div className="flex h-screen overflow-hidden">
        <div className="hidden lg:block">
          <AppSidebar />
        </div>
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <AppRouter />
        </main>
        <BottomNav />
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppContent />
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
