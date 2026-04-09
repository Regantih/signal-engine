import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5000",
    viewport: { width: 375, height: 812 },
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { browserName: "chromium" },
    },
  ],
});
