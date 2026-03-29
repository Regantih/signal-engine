import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
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

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scanner" component={Scanner} />
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
