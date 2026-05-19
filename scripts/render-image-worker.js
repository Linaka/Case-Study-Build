import fs from "node:fs/promises";
import path from "node:path";

const previewUrl = process.env.PREVIEW_URL || process.argv[2];
const outputPath = process.env.OUTPUT_PATH || process.argv[3];
const renderToken = process.env.INTERNAL_RENDER_TOKEN || "";
const imageWidth = Number(process.env.IMAGE_WIDTH || 1600);
const imageHeight = Number(process.env.IMAGE_HEIGHT || 900);

if (!previewUrl || !outputPath) {
  console.error("PREVIEW_URL and OUTPUT_PATH are required.");
  process.exit(1);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install` before exporting images.");
  }
}

let browser;

try {
  const { chromium } = await loadPlaywright();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: imageWidth,
      height: imageHeight
    },
    deviceScaleFactor: 1,
    extraHTTPHeaders: renderToken ? {
      "X-Internal-Render-Token": renderToken
    } : {}
  });

  const response = await page.goto(previewUrl, { waitUntil: "networkidle" });

  if (!response?.ok()) {
    throw new Error(`Preview route returned HTTP ${response?.status() || "unknown"}.`);
  }

  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({
    path: outputPath,
    type: "png",
    fullPage: false
  });
} catch (error) {
  if (String(error.message).includes("Executable doesn't exist")) {
    console.error("Playwright is installed, but the Chromium browser is missing. Run `npm run setup:local` or `npx playwright install chromium`.");
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
}
