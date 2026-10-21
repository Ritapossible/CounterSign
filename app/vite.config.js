import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The contract layer lives in ../client; resolve its SDKs from this app so
// the bundle carries one copy of each.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["genlayer-js", "genlayer-js-v1", "viem"] },
  server: { fs: { allow: [".."] } },
  build: { target: "es2022", chunkSizeWarningLimit: 2500 },
});
