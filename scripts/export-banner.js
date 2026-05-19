import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const slug = process.argv[2] || process.env.PROJECT || "uber-sample";
const outputDir = path.resolve(process.cwd(), "exports");
const outputPath = path.join(outputDir, `${slug}-marketing-banner.png`);

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
    PORT: String(port)
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

  const worker = spawn(process.execPath, ["scripts/render-image-worker.js"], {
    env: {
      ...process.env,
      PREVIEW_URL: `http://127.0.0.1:${port}/marketing-banner/projects/${slug}`,
      OUTPUT_PATH: outputPath
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
    throw new Error(Buffer.concat(stderr).toString("utf8").trim() || `Image worker exited with code ${code}.`);
  }

  console.log(`Marketing banner exported to ${outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    server.kill();
  }
}
