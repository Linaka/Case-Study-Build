import fs from "node:fs/promises";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const slug = process.argv[2] || process.env.BD_DOCUMENT || "enterprise-build-support";
const outputDir = path.resolve(process.cwd(), "exports");
const outputPath = path.join(outputDir, `${slug}-bd.pdf`);
const internalRenderToken = crypto.randomBytes(32).toString("hex");

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, childProcess, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (childProcess.exitCode !== null) {
      throw new Error(`Preview server exited before it was ready with code ${childProcess.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const port = await getFreePort();
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    INTERNAL_RENDER_TOKEN: internalRenderToken
  },
  stdio: ["ignore", "pipe", "pipe"]
});

server.on("error", error => {
  console.error(`Could not start preview server: ${error.message}`);
});

server.stderr.on("data", chunk => process.stderr.write(chunk));

try {
  await waitForServer(`http://127.0.0.1:${port}/health`, server);
  await fs.mkdir(outputDir, { recursive: true });

  const worker = spawn(process.execPath, ["scripts/render-pdf-worker.js"], {
    env: {
      ...process.env,
      PREVIEW_URL: `http://127.0.0.1:${port}/bd/${slug}`,
      OUTPUT_PATH: outputPath,
      INTERNAL_RENDER_TOKEN: internalRenderToken
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  const stderr = [];

  worker.stderr.on("data", chunk => stderr.push(chunk));

  const code = await new Promise((resolve, reject) => {
    worker.on("error", reject);
    worker.on("exit", resolve);
  });

  if (code !== 0) {
    throw new Error(Buffer.concat(stderr).toString("utf8").trim() || `PDF worker exited with code ${code}.`);
  }

  console.log(`BD PDF exported to ${outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    server.kill();
  }
}
