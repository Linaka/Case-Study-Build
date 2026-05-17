import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const slug = process.argv[2] || process.env.PROJECT || "uber-sample";
const outputDir = path.resolve(process.cwd(), "exports");
const outputPath = path.join(outputDir, `${slug}.pdf`);

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

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install` before exporting PDFs.");
  }
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

let browser;

try {
  const { chromium } = await loadPlaywright();

  await waitForServer(`http://127.0.0.1:${port}/health`, server);
  await fs.mkdir(outputDir, { recursive: true });

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 1800
    }
  });

  const response = await page.goto(`http://127.0.0.1:${port}/projects/${slug}`, {
    waitUntil: "networkidle"
  });

  if (!response?.ok()) {
    throw new Error(`Preview route returned HTTP ${response?.status() || "unknown"} for project "${slug}".`);
  }

  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true
  });

  console.log(`PDF exported to ${outputPath}`);
} catch (error) {
  if (String(error.message).includes("Executable doesn't exist")) {
    console.error("Playwright is installed, but the Chromium browser is missing. Run `npx playwright install chromium`.");
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(error => {
      console.error(`Could not close browser cleanly: ${error.message}`);
    });
  }

  if (server.exitCode === null) {
    server.kill();
  }
}
