// Makes @testing-library/jest-dom matchers (toBeInTheDocument, etc.) visible to
// tsc for the test files under src/. The runtime registration lives in
// vitest.setup.ts; this only supplies the type augmentation.
import "@testing-library/jest-dom/vitest";
