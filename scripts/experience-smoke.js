import net from "node:net";
import { spawn } from "node:child_process";

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
      throw new Error(`Experience server exited before it was ready with code ${childProcess.exitCode}.`);
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
    throw new Error("Playwright is not installed. Run `npm install` before running the experience smoke.");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const routes = [
  {
    name: "dashboard case studies",
    path: "/?view=case-studies",
    expectedTitle: "Case studies",
    expectedText: "New case study"
  },
  {
    name: "dashboard BD documents",
    path: "/?view=bd-documents",
    expectedTitle: "Business development documents",
    expectedText: "New BD document"
  },
  {
    name: "dashboard engineering reports",
    path: "/?view=engineering-reports",
    expectedTitle: "Engineering reports",
    expectedText: "Compile PDF"
  },
  {
    name: "case-study builder",
    path: "/builder/uber-sample",
    expectedText: "Export marketing banner",
    expectedFormCards: 3
  },
  {
    name: "BD builder",
    path: "/bd-builder/enterprise-build-support",
    expectedText: "Export marketing banner",
    expectedFormCards: 3
  },
  {
    name: "case-study preview",
    path: "/projects/uber-sample",
    expectedText: "Save banner"
  },
  {
    name: "engineering report preview",
    path: "/engineering-report/stage-2-basis-of-design",
    expectedTitle: "Example Stage 2 Basis of Design Engineering Report Structure compiled engineering report",
    expectedText: "Document Control"
  },
  {
    name: "engineering subsection preview",
    path: "/engineering-report/stage-2-basis-of-design/subsections/1-1-report-title",
    expectedTitle: "1.1 Report title engineering report subsection",
    expectedText: "Save PDF"
  },
  {
    name: "project engineering report preview",
    path: "/engineering-reports/uber-sample",
    expectedTitle: "Ride request portfolio case study engineering report",
    expectedText: "Save PDF"
  },
  {
    name: "BD preview",
    path: "/bd/enterprise-build-support",
    expectedText: "Save banner"
  },
  {
    name: "case-study marketing banner",
    path: "/marketing-banner/projects/uber-sample",
    expectedTitle: "Ride request portfolio case study marketing banner"
  },
  {
    name: "BD marketing banner",
    path: "/marketing-banner/bd/enterprise-build-support",
    expectedTitle: "Enterprise product build support marketing banner"
  }
];

const port = await getFreePort();
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const stderr = [];
let browser;

server.on("error", error => {
  console.error(`Could not start experience server: ${error.message}`);
});
server.stderr.on("data", chunk => stderr.push(chunk));

try {
  const { chromium } = await loadPlaywright();
  const origin = `http://127.0.0.1:${port}`;

  await waitForServer(`${origin}/health`, server);
  browser = await chromium.launch();

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });

    for (const route of routes) {
      const response = await page.goto(`${origin}${route.path}`, { waitUntil: "networkidle" });
      assert(response?.ok(), `${route.name} returned HTTP ${response?.status() || "unknown"}.`);

      const audit = await page.evaluate(() => ({
        title: document.title,
        text: document.body.textContent || "",
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        formCards: document.querySelectorAll(".form-card--collapsible").length
      }));

      assert(audit.horizontalOverflow <= 0, `${route.name} has horizontal overflow at ${viewport.width}px.`);

      if (route.expectedTitle) {
        assert(audit.title === route.expectedTitle, `${route.name} title was "${audit.title}".`);
      }

      if (route.expectedText) {
        assert(audit.text.includes(route.expectedText), `${route.name} did not include "${route.expectedText}".`);
      }

      if (route.expectedFormCards) {
        assert(audit.formCards === route.expectedFormCards, `${route.name} expected ${route.expectedFormCards} collapsible cards.`);
      }
    }

    await page.close();
  }

  console.log("Experience smoke passed across desktop and mobile routes.");
} catch (error) {
  const detail = Buffer.concat(stderr).toString("utf8").trim();
  console.error(detail ? `${error.message}\n${detail}` : error.message);
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
