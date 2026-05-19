import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { BD_FIELD_LIMITS, PROJECT_FIELD_LIMITS, TEXT_LIMITS } from "../src/lib/limits.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fit(limit, seed) {
  return seed.repeat(Math.ceil(limit / seed.length)).slice(0, limit).trimEnd();
}

function pngDimensions(file) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert(file.subarray(0, 8).equals(signature), "PNG file does not have a valid signature.");

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20)
  };
}

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
      throw new Error(`Quality server exited before it was ready with code ${childProcess.exitCode}.`);
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
    throw new Error("Playwright is not installed. Run `npm install` before running the quality smoke.");
  }
}

function stressProject() {
  return {
    title: fit(PROJECT_FIELD_LIMITS.title, "Max length enterprise case study "),
    subtitle: fit(PROJECT_FIELD_LIMITS.subtitle, "A long but bounded subtitle that should wrap cleanly inside PDF, Word and banner exports. "),
    year: "2026",
    sector: fit(PROJECT_FIELD_LIMITS.sector, "Enterprise product "),
    clientType: fit(PROJECT_FIELD_LIMITS.clientType, "Confidential enterprise "),
    role: fit(PROJECT_FIELD_LIMITS.role, "Strategy, design and implementation partner "),
    collaborators: [
      fit(TEXT_LIMITS.short, "Product leadership "),
      fit(TEXT_LIMITS.short, "Design systems "),
      fit(TEXT_LIMITS.short, "Engineering delivery ")
    ],
    context: fit(PROJECT_FIELD_LIMITS.context, "Context copy stays intentionally dense while respecting the PDF aware character budget. "),
    challenge: fit(PROJECT_FIELD_LIMITS.challenge, "Challenge copy describes a complex product and communications problem without exceeding the layout limits. "),
    audience: fit(PROJECT_FIELD_LIMITS.audience, "Audience copy names the people who need the proof and the decisions they need to make. "),
    approach: fit(PROJECT_FIELD_LIMITS.approach, "Approach copy explains the strategy, design, prototyping and delivery support in bounded paragraphs. "),
    keyDecisions: Array.from({ length: 3 }, (_, index) => ({
      title: fit(PROJECT_FIELD_LIMITS.titleListTitle, `Decision ${index + 1} with bounded copy `),
      description: fit(PROJECT_FIELD_LIMITS.titleListDescription, "Decision rationale wraps across lines without overrunning the page grid. ")
    })),
    outputs: Array.from({ length: 3 }, (_, index) => ({
      title: fit(PROJECT_FIELD_LIMITS.titleListTitle, `Output ${index + 1} with bounded copy `),
      description: fit(PROJECT_FIELD_LIMITS.titleListDescription, "Output description covers the artifact and its usefulness to the buyer. ")
    })),
    impact: Array.from({ length: 3 }, (_, index) => ({
      metric: fit(PROJECT_FIELD_LIMITS.impactMetric, `Impact metric ${index + 1} `),
      value: 20 + index,
      unit: "%",
      description: fit(PROJECT_FIELD_LIMITS.titleListDescription, "Impact explanation remains readable in PDF and Word exports. ")
    })),
    reflection: fit(PROJECT_FIELD_LIMITS.reflection, "Reflection copy closes the story without crowding the final page or export surfaces. "),
    confidentialityNotes: fit(PROJECT_FIELD_LIMITS.confidentialityNotes, "Confidentiality notes explain anonymisation and source handling in bounded language. "),
    assets: [
      {
        path: "/assets/uber/route-frame.svg",
        caption: fit(PROJECT_FIELD_LIMITS.assetCaption, "Cover image caption stays concise and wraps safely. "),
        visibility: "public",
        slot: "cover"
      },
      {
        path: "/assets/uber/decision-grid.svg",
        caption: fit(PROJECT_FIELD_LIMITS.assetCaption, "Decision image caption stays concise and wraps safely. "),
        visibility: "public",
        slot: "decisions"
      },
      {
        path: "/assets/uber/output-suite.svg",
        caption: fit(PROJECT_FIELD_LIMITS.assetCaption, "Output image caption stays concise and wraps safely. "),
        visibility: "public",
        slot: "outputs"
      }
    ]
  };
}

function stressBdDocument() {
  return {
    title: fit(BD_FIELD_LIMITS.title, "Max length enterprise build support document "),
    subtitle: fit(BD_FIELD_LIMITS.subtitle, "A long but bounded business development subtitle for the PDF, Word and banner surfaces. "),
    year: "2026",
    audience: fit(BD_FIELD_LIMITS.audience, "Enterprise product and innovation leads "),
    positioning: fit(BD_FIELD_LIMITS.positioning, "Positioning copy states the market moment, buyer pressure and reason to act now. "),
    executivePromise: fit(BD_FIELD_LIMITS.executivePromise, "Executive promise copy stays compact and sales ready. "),
    buyerProblems: Array.from({ length: 3 }, (_, index) => ({
      title: fit(BD_FIELD_LIMITS.titleListTitle, `Buyer problem ${index + 1} `),
      description: fit(BD_FIELD_LIMITS.titleListDescription, "Buyer problem copy remains within the card layout. ")
    })),
    offerPillars: Array.from({ length: 3 }, (_, index) => ({
      title: fit(BD_FIELD_LIMITS.offerTitle, `Offer pillar ${index + 1} `),
      description: fit(BD_FIELD_LIMITS.offerDescription, "Offer copy explains value without crowding the PDF card. "),
      deliverables: [
        fit(TEXT_LIMITS.label, "Strategy map "),
        fit(TEXT_LIMITS.label, "Prototype path "),
        fit(TEXT_LIMITS.label, "Launch plan ")
      ]
    })),
    processSummary: fit(BD_FIELD_LIMITS.processSummary, "Process summary copy explains how strategy, design and build work together. "),
    process: Array.from({ length: 4 }, (_, index) => ({
      title: fit(BD_FIELD_LIMITS.titleListTitle, `Process step ${index + 1} `),
      description: fit(BD_FIELD_LIMITS.titleListDescription, "Process copy is compact enough for the delivery page layout. ")
    })),
    proofSections: Array.from({ length: 3 }, (_, index) => ({
      headline: fit(BD_FIELD_LIMITS.proofHeadline, `Proof headline ${index + 1} for an enterprise delivery signal `),
      clientContext: fit(BD_FIELD_LIMITS.proofClientContext, "Anonymized enterprise context "),
      problem: fit(BD_FIELD_LIMITS.proofProblem, "Proof problem copy explains the buyer pain and delivery risk. "),
      intervention: fit(BD_FIELD_LIMITS.proofIntervention, "Proof intervention copy explains what changed and how support moved the work forward. "),
      outcome: fit(BD_FIELD_LIMITS.proofOutcome, "Proof outcome copy captures the commercial or operational result. "),
      evidence: fit(BD_FIELD_LIMITS.proofEvidence, "Proof evidence copy names the artifact, signal or metric used. "),
      projectSlug: "uber-sample",
      assetPath: "/assets/uber/output-suite.svg",
      visibility: "private"
    })),
    engagementModels: Array.from({ length: 3 }, (_, index) => ({
      title: fit(BD_FIELD_LIMITS.engagementTitle, `Model ${index + 1} `),
      bestFor: fit(BD_FIELD_LIMITS.engagementBestFor, "Best-for copy names the buying situation. "),
      scope: fit(BD_FIELD_LIMITS.engagementScope, "Scope copy sets boundaries for the work. "),
      timeline: fit(BD_FIELD_LIMITS.engagementTimeline, "2 to 6 weeks ")
    })),
    nextSteps: fit(BD_FIELD_LIMITS.nextSteps, "Next step copy makes the action clear without turning into a long proposal. "),
    primaryCta: fit(BD_FIELD_LIMITS.primaryCta, "Book a build review "),
    secondaryCta: fit(BD_FIELD_LIMITS.secondaryCta, "Share a product brief "),
    confidentialityNotes: fit(BD_FIELD_LIMITS.confidentialityNotes, "Confidentiality notes keep proof sections anonymized and sales safe. "),
    assets: [
      {
        path: "/assets/uber/output-suite.svg",
        caption: fit(BD_FIELD_LIMITS.assetCaption, "BD cover image caption stays concise and safe. "),
        visibility: "public",
        slot: "cover"
      }
    ]
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function seedData(root) {
  const projectsDir = path.join(root, "projects");
  const bdDocumentsDir = path.join(root, "bd-documents");

  await fs.mkdir(projectsDir, { recursive: true });
  await fs.mkdir(bdDocumentsDir, { recursive: true });
  await fs.copyFile("data/projects/uber-sample.json", path.join(projectsDir, "uber-sample.json"));
  await fs.copyFile("data/bd-documents/enterprise-build-support.json", path.join(bdDocumentsDir, "enterprise-build-support.json"));
  await writeJson(path.join(projectsDir, "stress-case.json"), stressProject());
  await writeJson(path.join(bdDocumentsDir, "stress-bd.json"), stressBdDocument());

  return {
    projectsDir,
    bdDocumentsDir
  };
}

async function assertDownload(origin, pathName, contentType, label) {
  const response = await fetch(`${origin}${pathName}`);
  const body = Buffer.from(await response.arrayBuffer());

  assert(response.ok, `${label} returned HTTP ${response.status}.`);
  assert(response.headers.get("content-type")?.includes(contentType), `${label} returned ${response.headers.get("content-type")}.`);
  assert(body.length > 1000, `${label} was unexpectedly small.`);

  return body;
}

async function assertExportRoundtrips(origin) {
  const casePdf = await assertDownload(origin, "/api/export/pdf/stress-case", "application/pdf", "stress case PDF");
  const bdPdf = await assertDownload(origin, "/api/export/bd/pdf/stress-bd", "application/pdf", "stress BD PDF");
  const caseWord = await assertDownload(origin, "/api/export/word/stress-case", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "stress case Word");
  const bdWord = await assertDownload(origin, "/api/export/bd/word/stress-bd", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "stress BD Word");
  const caseBanner = await assertDownload(origin, "/api/export/banner/stress-case", "image/png", "stress case banner");
  const bdBanner = await assertDownload(origin, "/api/export/bd/banner/stress-bd", "image/png", "stress BD banner");

  assert(casePdf.subarray(0, 4).toString("ascii") === "%PDF", "Stress case PDF was not a PDF.");
  assert(bdPdf.subarray(0, 4).toString("ascii") === "%PDF", "Stress BD PDF was not a PDF.");
  assert(caseWord.subarray(0, 2).toString("ascii") === "PK", "Stress case Word export was not a docx zip.");
  assert(bdWord.subarray(0, 2).toString("ascii") === "PK", "Stress BD Word export was not a docx zip.");

  for (const [name, file] of Object.entries({ caseBanner, bdBanner })) {
    const dimensions = pngDimensions(file);
    assert(dimensions.width === 1600, `${name} width was ${dimensions.width}.`);
    assert(dimensions.height === 900, `${name} height was ${dimensions.height}.`);
  }
}

async function assertNoPrintOverflow(page, pathName, label) {
  await page.goto(pathName, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });

  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll(".case-page")).map((pageElement, index) => ({
    index: index + 1,
    overflowX: pageElement.scrollWidth - pageElement.clientWidth,
    overflowY: pageElement.scrollHeight - pageElement.clientHeight
  })).filter(item => item.overflowX > 2 || item.overflowY > 2));

  assert(!overflow.length, `${label} has print page overflow: ${JSON.stringify(overflow)}.`);
  await page.emulateMedia({ media: "screen" });
}

async function assertSemantics(page, pathName, label) {
  await page.goto(pathName, { waitUntil: "networkidle" });

  const audit = await page.evaluate(() => {
    const fieldInputs = Array.from(document.querySelectorAll("input[type=file]"));

    return {
      hasMain: Boolean(document.querySelector("main")),
      navsWithoutLabels: Array.from(document.querySelectorAll("nav")).filter(nav => !nav.getAttribute("aria-label")).length,
      summaryControlText: Array.from(document.querySelectorAll(".form-card__summary")).map(summary => summary.textContent.replace(/\s+/g, " ").trim()),
      hiddenSummaryLabels: Array.from(document.querySelectorAll(".form-card__summary span")).every(span => span.getAttribute("aria-hidden") === "true"),
      activeTabs: document.querySelectorAll(".dashboard-tab[aria-current='page']").length,
      actionMenuItems: Array.from(document.querySelectorAll(".action-menu__item")).map(item => item.textContent.trim()),
      fileInputs: fieldInputs.map(input => ({
        labels: input.labels?.length || 0,
        accept: input.getAttribute("accept") || ""
      }))
    };
  });

  assert(audit.hasMain, `${label} is missing a main landmark.`);
  assert(audit.navsWithoutLabels === 0, `${label} has unlabeled nav landmarks.`);
  assert(audit.summaryControlText.every(text => !text.includes("Open section")), `${label} exposes noisy accordion text.`);

  if (audit.summaryControlText.length) {
    assert(audit.hiddenSummaryLabels, `${label} summary control labels should be aria-hidden.`);
  }

  if (label.includes("dashboard")) {
    assert(audit.activeTabs === 1, `${label} should have one active dashboard tab.`);
  }

  if (label.includes("builder")) {
    assert(audit.actionMenuItems.includes("Export marketing banner"), `${label} is missing banner export action.`);
    assert(audit.fileInputs.length >= 3, `${label} is missing expected file inputs.`);
    assert(audit.fileInputs.every(input => input.labels > 0 && input.accept), `${label} has unlabeled file inputs.`);
  }
}

async function assertKeyboardFlow(page, origin, projectsDir, bdDocumentsDir) {
  await page.goto(`${origin}/?view=case-studies`, { waitUntil: "networkidle" });
  await page.locator("a.dashboard-tab[href='/?view=bd-documents']").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/?view=bd-documents");
  assert(await page.locator("#bd-documents-heading").isVisible(), "Dashboard tab was not keyboard navigable.");

  await page.goto(`${origin}/builder/stress-case`, { waitUntil: "networkidle" });
  await page.locator(".action-menu summary").focus();
  await page.keyboard.press("Enter");
  assert(await page.locator(".action-menu[open]").count() === 1, "Import/export menu did not open from keyboard.");

  const projectCards = page.locator(".form-card--collapsible");
  await projectCards.nth(1).locator(".form-card__summary").focus();
  await page.keyboard.press("Enter");
  assert(await projectCards.nth(1).getAttribute("open") !== null, "Narrative accordion did not open from keyboard.");

  await page.locator("input[name='title']").fill("Keyboard saved case study");
  await page.locator("button[type='submit']").focus();
  await page.keyboard.press("Enter");
  await page.locator("#save-status[data-state='success']").waitFor({ timeout: 5000 });

  const savedProject = JSON.parse(await fs.readFile(path.join(projectsDir, "stress-case.json"), "utf8"));
  assert(savedProject.title === "Keyboard saved case study", "Case-study save flow did not persist.");

  await page.goto(`${origin}/bd-builder/stress-bd`, { waitUntil: "networkidle" });
  await page.locator(".action-menu summary").focus();
  await page.keyboard.press("Enter");
  assert(await page.locator(".action-menu[open]").count() === 1, "BD import/export menu did not open from keyboard.");

  const bdCards = page.locator(".form-card--collapsible");
  await bdCards.nth(2).locator(".form-card__summary").focus();
  await page.keyboard.press("Enter");
  assert(await bdCards.nth(2).getAttribute("open") !== null, "BD sections accordion did not open from keyboard.");

  await page.locator("input[name='title']").fill("Keyboard saved BD document");
  await page.locator("button[type='submit']").focus();
  await page.keyboard.press("Enter");
  await page.locator("#save-status[data-state='success']").waitFor({ timeout: 5000 });

  const savedDocument = JSON.parse(await fs.readFile(path.join(bdDocumentsDir, "stress-bd.json"), "utf8"));
  assert(savedDocument.title === "Keyboard saved BD document", "BD save flow did not persist.");
}

async function writeSnapshot(locator, filePath, label) {
  const buffer = await locator.screenshot({ path: filePath });
  assert(buffer.length > 5000, `${label} snapshot looked unexpectedly small.`);
}

async function captureVisualSnapshots(page, origin) {
  const outputDir = path.join(process.cwd(), "exports", "visual-snapshots");

  await fs.mkdir(outputDir, { recursive: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/projects/uber-sample`, { waitUntil: "networkidle" });
  await writeSnapshot(page.locator(".case-page--cover"), path.join(outputDir, "case-study-cover.png"), "case-study cover");

  await page.goto(`${origin}/bd/enterprise-build-support`, { waitUntil: "networkidle" });
  await writeSnapshot(page.locator(".case-page--cover"), path.join(outputDir, "bd-cover.png"), "BD cover");
  await writeSnapshot(page.locator(".bd-proof-layout").first(), path.join(outputDir, "bd-proof-section.png"), "BD proof");

  await page.goto(`${origin}/marketing-banner/projects/uber-sample`, { waitUntil: "networkidle" });
  await writeSnapshot(page.locator(".marketing-banner"), path.join(outputDir, "case-study-banner.png"), "case-study banner");

  await page.goto(`${origin}/marketing-banner/bd/enterprise-build-support`, { waitUntil: "networkidle" });
  await writeSnapshot(page.locator(".marketing-banner"), path.join(outputDir, "bd-banner.png"), "BD banner");
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-quality-"));
const { projectsDir, bdDocumentsDir } = await seedData(root);
const port = await getFreePort();
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    PROJECTS_DIR: projectsDir,
    BD_DOCUMENTS_DIR: bdDocumentsDir,
    BACKUP_DIR: path.join(root, "backups")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const stderr = [];
let browser;

server.on("error", error => {
  console.error(`Could not start quality server: ${error.message}`);
});
server.stderr.on("data", chunk => stderr.push(chunk));

try {
  const { chromium } = await loadPlaywright();
  const origin = `http://127.0.0.1:${port}`;

  await waitForServer(`${origin}/health`, server);
  browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await assertSemantics(page, `${origin}/?view=case-studies`, "case-study dashboard");
  await assertSemantics(page, `${origin}/?view=bd-documents`, "BD dashboard");
  await assertSemantics(page, `${origin}/builder/stress-case`, "case-study builder");
  await assertSemantics(page, `${origin}/bd-builder/stress-bd`, "BD builder");
  await assertKeyboardFlow(page, origin, projectsDir, bdDocumentsDir);

  await assertNoPrintOverflow(page, `${origin}/projects/stress-case`, "stress case-study PDF preview");
  await assertNoPrintOverflow(page, `${origin}/bd/stress-bd`, "stress BD PDF preview");
  await assertExportRoundtrips(origin);
  await captureVisualSnapshots(page, origin);

  await page.close();
  console.log("Quality smoke passed: keyboard, semantics, max-copy exports and visual snapshots.");
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

  await fs.rm(root, { recursive: true, force: true });
}
