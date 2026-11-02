import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", timeout: 60000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL: "http://localhost:3107", headless: true, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" },
  webServer: { command: "node scripts/offline-test-server.cjs", url: "http://localhost:3107/login", reuseExistingServer: false, timeout: 60000 },
});
