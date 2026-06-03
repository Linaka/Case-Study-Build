import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { backupWrittenFile } from "../lib/backups.js";
import { readBdDocument } from "../lib/bd-documents.js";
import {
  findEngineeringReportSection,
  findEngineeringReportSubsection,
  readEngineeringReport
} from "../lib/engineering-reports.js";
import { readProject } from "../lib/projects.js";
import { renderBdDocumentDocx, renderProjectDocx } from "../lib/word-documents.js";
import { createImpactWorkbook } from "../lib/xlsx.js";
import { httpError } from "./http.js";

function renderWorkerHttpError(kind, detail) {
  const lowerDetail = String(detail || "").toLowerCase();
  const label = kind === "image" ? "Image" : "PDF";

  if (lowerDetail.includes("playwright is not installed")) {
    return httpError(
      503,
      `${label} export needs Playwright on this machine. Run npm install, then npm run setup:local, and try again.`,
      { expose: true }
    );
  }

  if (lowerDetail.includes("chromium browser is missing") || lowerDetail.includes("executable doesn't exist")) {
    return httpError(
      503,
      `${label} export needs Playwright Chromium on this machine. Run npm run setup:local, then npm run preflight:render, and try again.`,
      { expose: true }
    );
  }

  if (lowerDetail.includes("host system is missing dependencies")) {
    return httpError(
      503,
      `${label} export needs missing browser system dependencies. On Linux, run npx playwright install --with-deps chromium, then try again.`,
      { expose: true }
    );
  }

  return httpError(500, detail || `${label} worker failed.`);
}

export function createExportService({ root, host, port, internalRenderToken, jobTimeoutMs }) {
  function localPreviewOrigin() {
    const previewHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    return `http://${previewHost}:${port}`;
  }

  async function renderPdfWithWorker(previewPath, outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await new Promise((resolve, reject) => {
      const worker = spawn(process.execPath, ["scripts/render-pdf-worker.js"], {
        env: {
          ...process.env,
          PREVIEW_URL: `${localPreviewOrigin()}${previewPath}`,
          OUTPUT_PATH: outputPath,
          INTERNAL_RENDER_TOKEN: internalRenderToken
        },
        stdio: ["ignore", "ignore", "pipe"]
      });
      const stderr = [];
      const timeout = setTimeout(() => {
        worker.kill("SIGTERM");
        reject(httpError(504, "PDF export timed out."));
      }, jobTimeoutMs);

      worker.stderr.on("data", chunk => stderr.push(chunk));
      worker.on("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      worker.on("exit", code => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve();
          return;
        }

        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(renderWorkerHttpError("pdf", detail));
      });
    });

    await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));
    return fs.readFile(outputPath);
  }

  async function renderImageWithWorker(previewPath, outputPath, options = {}) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await new Promise((resolve, reject) => {
      const worker = spawn(process.execPath, ["scripts/render-image-worker.js"], {
        env: {
          ...process.env,
          PREVIEW_URL: `${localPreviewOrigin()}${previewPath}`,
          OUTPUT_PATH: outputPath,
          INTERNAL_RENDER_TOKEN: internalRenderToken,
          IMAGE_WIDTH: String(options.width || 1600),
          IMAGE_HEIGHT: String(options.height || 900)
        },
        stdio: ["ignore", "ignore", "pipe"]
      });
      const stderr = [];
      const timeout = setTimeout(() => {
        worker.kill("SIGTERM");
        reject(httpError(504, "Image export timed out."));
      }, jobTimeoutMs);

      worker.stderr.on("data", chunk => stderr.push(chunk));
      worker.on("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      worker.on("exit", code => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve();
          return;
        }

        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(renderWorkerHttpError("image", detail));
      });
    });

    await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));
    return fs.readFile(outputPath);
  }

  function exportPath(fileName) {
    return path.join(root, "exports", fileName);
  }

  return {
    async projectPdf(slug) {
      await readProject(slug);
      return renderPdfWithWorker(`/projects/${slug}`, exportPath(`${slug}.pdf`));
    },

    async projectMarketingBanner(slug) {
      await readProject(slug);
      return renderImageWithWorker(`/marketing-banner/projects/${slug}`, exportPath(`${slug}-marketing-banner.png`));
    },

    async projectXlsx(slug) {
      const project = await readProject(slug);
      const outputPath = exportPath(`${slug}-impact.xlsx`);
      const file = createImpactWorkbook(project);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, file);
      await backupWrittenFile(outputPath, path.join("exports", path.basename(outputPath)));

      return file;
    },

    async projectEngineeringReportPdf(slug) {
      await readProject(slug);
      return renderPdfWithWorker(`/engineering-reports/${slug}`, exportPath(`${slug}-engineering-report.pdf`));
    },

    async engineeringOutlinePdf(slug) {
      await readEngineeringReport(slug);
      return renderPdfWithWorker(`/engineering-report/${slug}`, exportPath(`${slug}-engineering-report.pdf`));
    },

    async engineeringOutlineSectionPdf(slug, sectionSlug) {
      const report = await readEngineeringReport(slug);
      const section = findEngineeringReportSection(report, sectionSlug);

      return renderPdfWithWorker(`/engineering-report/${slug}/sections/${section.slug}`, exportPath(`${slug}-${section.slug}.pdf`));
    },

    async engineeringOutlineSubsectionPdf(slug, subsectionSlug) {
      const report = await readEngineeringReport(slug);
      const subsection = findEngineeringReportSubsection(report, subsectionSlug);

      return renderPdfWithWorker(`/engineering-report/${slug}/subsections/${subsection.slug}`, exportPath(`${slug}-${subsection.slug}.pdf`));
    },

    async bdDocumentPdf(slug) {
      await readBdDocument(slug);
      return renderPdfWithWorker(`/bd/${slug}`, exportPath(`${slug}-bd.pdf`));
    },

    async bdDocumentMarketingBanner(slug) {
      await readBdDocument(slug);
      return renderImageWithWorker(`/marketing-banner/bd/${slug}`, exportPath(`${slug}-bd-marketing-banner.png`));
    },

    async projectWord(slug) {
      return renderProjectDocx(await readProject(slug));
    },

    async bdDocumentWord(slug) {
      return renderBdDocumentDocx(await readBdDocument(slug));
    }
  };
}
