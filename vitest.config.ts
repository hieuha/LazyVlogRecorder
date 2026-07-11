import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Test-only config, kept separate from vite.config.ts (which carries Tauri dev
// server settings). jsdom gives us DOM + MediaRecorder-shaped globals to mock;
// @testing-library/jest-dom matchers load via setupFiles.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
