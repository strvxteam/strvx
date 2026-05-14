import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Testcontainers needs to find the Docker socket. On Colima (no /var/run/docker.sock),
// point it at the Colima socket explicitly.
function resolveDockerHost(): string | undefined {
  const colimaSocket = path.join(os.homedir(), ".colima/default/docker.sock");
  if (!process.env.DOCKER_HOST && fs.existsSync(colimaSocket)) {
    return `unix://${colimaSocket}`;
  }
  return undefined;
}

const dockerHost = resolveDockerHost();

export default defineConfig({
  resolve: {
    alias: {
      "@strvx/kg/testing": path.resolve(__dirname, "src/testing/index.ts"),
      "@strvx/kg": path.resolve(__dirname, "src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    env: {
      // Colima: bind /var/run/docker.sock → Colima socket; disable Ryuk (can't mount sock in Colima)
      ...(dockerHost
        ? {
            DOCKER_HOST: dockerHost,
            TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: dockerHost.replace("unix://", ""),
            TESTCONTAINERS_RYUK_DISABLED: "true",
          }
        : {}),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      include: ["src/**/*.ts"],
      exclude: ["src/testing/**", "src/eslint/**"],
    },
    testTimeout: 60_000,
    // Integration tests spin up Neo4j + Postgres containers per file. Running
    // them in parallel exhausts Colima resources and trips testcontainers wait
    // strategies. Force serial execution so each file gets the full VM to itself.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
