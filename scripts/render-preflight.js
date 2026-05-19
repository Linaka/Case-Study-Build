async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install` first.");
  }
}

let browser;

try {
  const { chromium } = await loadPlaywright();

  browser = await chromium.launch();
  console.log("Render preflight passed: Playwright Chromium can launch.");
} catch (error) {
  if (String(error.message).includes("Executable doesn't exist")) {
    console.error("Playwright Chromium is missing. Run `npm run setup:local` or `npx playwright install chromium` on this machine.");
  } else if (String(error.message).includes("Host system is missing dependencies")) {
    console.error("Playwright Chromium is installed but system dependencies are missing. Run `npx playwright install --with-deps chromium` on Linux, or reinstall Playwright browsers for this machine.");
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
