import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server with only the traced dependencies, which is
  // what lets the Docker image drop node_modules entirely.
  output: "standalone",
  // Tracing has to start at the workspace root: under pnpm the real files live
  // in the root virtual store, reachable from here only through symlinks.
  outputFileTracingRoot: path.join(here, ".."),
  // Next's own require-hook resolves @swc/helpers/esm/* dynamically at runtime,
  // which static tracing cannot see: the traced bundle ends up with only the
  // cjs/ half and the server dies on boot. Pull the package in whole.
  outputFileTracingIncludes: {
    "/**": ["../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**"],
  },
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default nextConfig;
