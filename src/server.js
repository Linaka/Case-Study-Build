import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertBackupConfigured } from "./lib/backups.js";
import { authenticateBasicAuth, hasRole, loadUserStore } from "./lib/auth.js";
import {
  assertBdDocumentSlug,
  blankBdDocument,
  listBdDocuments,
  readBdDocument,
  readBdDocumentRecord,
  saveBdDocumentRecord
} from "./lib/bd-documents.js";
import {
  assertContributionRequestToken,
  createContributionRequest,
  extractContributionReplyPayload,
  listContributionRequestsForReport,
  markContributionRequestSubmitted,
  readContributionRequest
} from "./lib/contribution-requests.js";
import {
  assertInformationRequestToken,
  createInformationRequest,
  listInformationRequests,
  readInformationRequest,
  receiveInformationRequestResponse,
  recordInformationRequestDelivery,
  resolveInformationRequestTarget
} from "./lib/information-requests.js";
import {
  completeMicrosoftAuth,
  createMicrosoftAuthUrl,
  disconnectMicrosoft,
  listMicrosoftChannels,
  listMicrosoftTeams,
  microsoftStatus,
  sendInformationRequestViaMicrosoft
} from "./lib/microsoft-graph.js";
import {
  assertEngineeringReportSlug,
  assertEngineeringReportPageKind,
  findEngineeringReportSection,
  findEngineeringReportSubsection,
  readDefaultEngineeringReport,
  readEngineeringReport,
  saveEngineeringReportOrder,
  saveEngineeringReportSectionDraft,
  saveEngineeringReportSubsectionDraft
} from "./lib/engineering-reports.js";
import { createJobQueue } from "./lib/job-queue.js";
import { assertProjectSlug, blankProject, listProjects, readProject, readProjectRecord, saveProjectRecord } from "./lib/projects.js";
import { createExportService } from "./server/export-service.js";
import {
  errorStatus,
  fail,
  httpError,
  methodNotAllowed,
  publicErrorMessage,
  redirect,
  rejectForbidden,
  requestAuth,
  securityHeaders,
  sendHtml,
  sendJson,
  sendPdf,
  sendPng,
  sendWordDocument,
  sendXlsx
} from "./server/http.js";
import {
  readContributionReplyRequest,
  readFormRequest,
  readJsonRequest
} from "./server/request-body.js";
import { serveStatic } from "./server/static-files.js";
import { createUploadService } from "./server/upload-service.js";
import { renderBdBuilder } from "./templates/bd-app.js";
import { renderBdDocument } from "./templates/bd-document.js";
import { renderDashboard, renderBuilder } from "./templates/app.js";
import { renderCaseStudy } from "./templates/case-study.js";
import { renderContributionRequestPage } from "./templates/contribution-request.js";
import { renderEngineeringOutlineReport, renderEngineeringReport } from "./templates/engineering-report.js";
import { renderInformationRequestsPage } from "./templates/information-requests.js";
import { renderMarketingBanner } from "./templates/marketing-banner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const APP_USER = process.env.APP_USER || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const REQUIRE_HTTPS = process.env.REQUIRE_HTTPS !== "0" && IS_PRODUCTION;
const PDF_JOB_TIMEOUT_MS = Number(process.env.PDF_JOB_TIMEOUT_MS || 120000);
const PDF_WORKERS = Math.max(1, Number(process.env.PDF_WORKERS || 1));
const INTERNAL_RENDER_TOKEN = process.env.INTERNAL_RENDER_TOKEN || crypto.randomBytes(32).toString("hex");
const PDF_QUEUE = createJobQueue({ concurrency: PDF_WORKERS });
const EXPORTS = createExportService({
  root: ROOT,
  host: HOST,
  port: PORT,
  internalRenderToken: INTERNAL_RENDER_TOKEN,
  jobTimeoutMs: PDF_JOB_TIMEOUT_MS
});
const UPLOADS = createUploadService({ root: ROOT });

const USER_STORE = await loadUserStore({
  usersFile: process.env.AUTH_USERS_FILE,
  usersJson: process.env.AUTH_USERS,
  legacyUser: APP_USER,
  legacyPassword: APP_PASSWORD,
  isProduction: IS_PRODUCTION
});

assertBackupConfigured({ isProduction: IS_PRODUCTION });
assertProductionTransportConfig();

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertProductionTransportConfig() {
  if (IS_PRODUCTION && REQUIRE_HTTPS && !TRUST_PROXY) {
    throw new Error("Production HTTPS enforcement requires TRUST_PROXY=1 behind a TLS reverse proxy, or REQUIRE_HTTPS=0 for isolated local deployments.");
  }
}

function isSecureRequest(request) {
  if (request.socket.encrypted) {
    return true;
  }

  if (!TRUST_PROXY) {
    return false;
  }

  return String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase() === "https";
}

function rejectInsecureRequest(request, response) {
  if (internalRenderUser(request)) {
    return false;
  }

  if (!REQUIRE_HTTPS || isSecureRequest(request)) {
    return false;
  }

  response.writeHead(426, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify({ error: "HTTPS is required in production." })}\n`);
  return true;
}

function internalRenderUser(request) {
  const token = String(request.headers["x-internal-render-token"] || "");

  if (token && safeEqual(token, INTERNAL_RENDER_TOKEN)) {
    return {
      username: "pdf-worker",
      roles: ["admin"]
    };
  }

  return null;
}

async function userForRequest(request) {
  return internalRenderUser(request) || await authenticateBasicAuth(request.headers.authorization, USER_STORE);
}

function requiredRoleFor(request, pathname) {
  if (pathname === "/health") {
    return null;
  }

  if (request.method === "GET" && pathname === "/pdf/theme.css") {
    return null;
  }

  if ((request.method === "GET" || request.method === "POST") && /^\/contribute\/[a-f0-9]{48}$/.test(pathname)) {
    return null;
  }

  if (request.method === "POST" && pathname === "/api/engineering-report-contribution-replies") {
    return null;
  }

  if (request.method === "POST") {
    return "editor";
  }

  return "viewer";
}

function projectTemplate(template, slug) {
  const key = String(template || "");

  if (key === "monthly-report" || slug.includes("monthly-report")) {
    return blankProject({
      title: "Untitled monthly report",
      subtitle: "Monthly progress, decisions, risks and next priorities.",
      sector: "Monthly reporting",
      clientType: "Internal stakeholders",
      role: "Report owner",
      context: "Reporting period",
      challenge: "Key risks and blockers",
      audience: "Project sponsors and delivery leads",
      approach: "Progress this month",
      reflection: "Next month"
    });
  }

  if (key === "engineering-report" || slug.includes("engineering-report")) {
    return blankProject({
      title: "Untitled engineering report",
      subtitle: "Technical basis, assumptions, decisions and supporting evidence.",
      sector: "Engineering",
      clientType: "Technical reviewers",
      role: "Report owner",
      context: "Project background",
      challenge: "Design basis and constraints",
      audience: "Technical and delivery stakeholders",
      approach: "Technical approach",
      reflection: "Open issues and next steps"
    });
  }

  return blankProject();
}

function bdDocumentTemplate(template, slug) {
  const key = String(template || "");

  if (key === "business-development-document" || slug.includes("business-development")) {
    return blankBdDocument({
      title: "Untitled business development document",
      subtitle: "",
      audience: "Enterprise product, innovation and operations leads"
    });
  }

  return blankBdDocument();
}

async function readProjectForBuilder(slug, template = "") {
  try {
    return await readProjectRecord(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        project: projectTemplate(template, slug),
        revision: "new"
      };
    }
    throw error;
  }
}

async function readProjectForPreview(slug) {
  try {
    return await readProject(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankProject({
        title: "Unsaved case study",
        subtitle: "This preview is using a draft shell because the project JSON has not been saved yet."
      });
    }
    throw error;
  }
}

async function readBdDocumentForBuilder(slug, template = "") {
  try {
    return await readBdDocumentRecord(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        document: bdDocumentTemplate(template, slug),
        revision: "new"
      };
    }
    throw error;
  }
}

async function readBdDocumentForPreview(slug) {
  try {
    return await readBdDocument(slug);
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankBdDocument({
        title: "Unsaved business development document",
        subtitle: "This preview is using a draft shell because the document JSON has not been saved yet."
      });
    }
    throw error;
  }
}

function requestOrigin(request) {
  const configuredOrigin = String(process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedHost = TRUST_PROXY ? request.headers["x-forwarded-host"] : "";
  const host = String(forwardedHost || request.headers.host || `${HOST}:${PORT}`).split(",")[0].trim();
  const protocol = isSecureRequest(request) ? "https" : "http";

  return `${protocol}://${host}`;
}

function contributionResponseUrl(request, token) {
  return `${requestOrigin(request)}/contribute/${assertInformationRequestToken(token)}`;
}

function attachContributionRequests(report, requests) {
  const requestsByPageKey = new Map();

  requests.forEach(contributionRequest => {
    const key = `${contributionRequest.pageKind}:${contributionRequest.pageSlug}`;
    const existing = requestsByPageKey.get(key) || [];

    existing.push(contributionRequest);
    requestsByPageKey.set(key, existing);
  });

  report.sections.forEach(section => {
    section.contributionRequests = requestsByPageKey.get(`section:${section.slug}`) || [];
    section.subsections.forEach(subsection => {
      subsection.contributionRequests = requestsByPageKey.get(`subsection:${subsection.slug}`) || [];
    });
  });

  return report;
}

async function readEngineeringReportForRender(slug) {
  const safeSlug = assertEngineeringReportSlug(slug);
  const [report, contributionRequests] = await Promise.all([
    readEngineeringReport(safeSlug),
    listContributionRequestsForReport(safeSlug)
  ]);

  return attachContributionRequests(report, contributionRequests);
}

function engineeringReportTarget(report, pageKind, pageSlug) {
  return pageKind === "section"
    ? findEngineeringReportSection(report, pageSlug)
    : findEngineeringReportSubsection(report, pageSlug);
}

function engineeringReportPageTitle(pageKind, target) {
  const label = pageKind === "section" ? "Section" : "Subsection";
  const number = String(target.number || "").trim();
  const title = String(target.title || "").trim();

  return [label, number, title].filter(Boolean).join(" ");
}

function contributionMailtoHref(contributionRequest, responseUrl) {
  const subject = `Input requested: ${contributionRequest.pageTitle}`;
  const greeting = contributionRequest.recipientName ? `Hi ${contributionRequest.recipientName},` : "Hi,";
  const message = contributionRequest.message || `Could you add or update the text for ${contributionRequest.pageTitle}?`;
  const body = [
    greeting,
    "",
    message,
    "",
    "Please reply above this line. Your reply text will be added to the document automatically.",
    "",
    `Contribution request: ${contributionRequest.token}`,
    "",
    "Thanks"
  ].join("\n");

  return `mailto:${encodeURIComponent(contributionRequest.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function createEngineeringContributionRequest(payload, user, request) {
  const safeSlug = assertEngineeringReportSlug(payload?.reportSlug);
  const safePageKind = assertEngineeringReportPageKind(payload?.pageKind);
  const safePageSlug = assertEngineeringReportSlug(payload?.pageSlug);
  const report = await readEngineeringReport(safeSlug);
  const target = engineeringReportTarget(report, safePageKind, safePageSlug);
  const contributionRequest = await createContributionRequest({
    reportSlug: safeSlug,
    pageKind: safePageKind,
    pageSlug: safePageSlug,
    pageTitle: engineeringReportPageTitle(safePageKind, target),
    reportTitle: report.title,
    recipientEmail: payload?.recipientEmail,
    recipientName: payload?.recipientName,
    message: payload?.message,
    createdBy: user?.username || ""
  });
  const responseUrl = contributionResponseUrl(request, contributionRequest.token);

  return {
    request: contributionRequest,
    responseUrl,
    mailtoHref: contributionMailtoHref(contributionRequest, responseUrl)
  };
}

async function contributionRequestModel(token) {
  const contributionRequest = await readContributionRequest(token);
  const report = await readEngineeringReportForRender(contributionRequest.reportSlug);
  const target = engineeringReportTarget(report, contributionRequest.pageKind, contributionRequest.pageSlug);

  return {
    request: contributionRequest,
    report,
    target
  };
}

async function informationRequestModel(token) {
  const informationRequest = await readInformationRequest(token);
  let resolvedTarget = { currentBody: "" };

  try {
    resolvedTarget = await resolveInformationRequestTarget({
      subjectType: informationRequest.subject.type,
      subjectSlug: informationRequest.subject.slug,
      targetKind: informationRequest.target.kind,
      targetPath: informationRequest.target.path
    });
  } catch {
    // The target may have been renamed or deleted after the request was sent.
  }

  return {
    request: informationRequest,
    report: {
      title: informationRequest.subject.title
    },
    target: {
      currentBody: resolvedTarget.currentBody
    }
  };
}

async function applyContributionResponse(token, response) {
  const model = await contributionRequestModel(token);
  const body = String(response.body ?? "").replace(/\r\n?/g, "\n").trim();
  const contributorName = String(response.contributorName ?? "").trim();

  if (!body) {
    throw httpError(422, "Contribution reply body cannot be empty.");
  }

  if (model.request.pageKind === "section") {
    await saveEngineeringReportSectionDraft(model.request.reportSlug, model.request.pageSlug, { body });
  } else {
    await saveEngineeringReportSubsectionDraft(model.request.reportSlug, model.request.pageSlug, {
      body,
      owner: contributorName || model.target.draft?.owner || model.request.recipientName,
      status: "review"
    });
  }

  await markContributionRequestSubmitted(token, {
    contributorName,
    body
  });

  return contributionRequestModel(token);
}

async function saveContributionResponse(token, form) {
  return applyContributionResponse(token, {
    contributorName: form.contributorName,
    body: form.body
  });
}

async function saveInformationResponse(token, form) {
  const request = await receiveInformationRequestResponse(token, {
    contributorName: form.contributorName,
    body: form.body
  });

  return informationRequestModel(request.token);
}

async function saveContributionEmailReply(request) {
  const payload = extractContributionReplyPayload(await readContributionReplyRequest(request));
  const model = await applyContributionResponse(payload.token, payload);

  return {
    ok: true,
    request: model.request,
    pageKind: model.request.pageKind,
    pageSlug: model.request.pageSlug
  };
}

function normalizeInformationRecipients(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => ({
        email: item,
        userPrincipalName: item
      }));
  }

  return [];
}

async function createInformationRequestFromPayload(payload, user, request) {
  const resolved = await resolveInformationRequestTarget({
    subjectType: payload?.subjectType,
    subjectSlug: payload?.subjectSlug,
    targetKind: payload?.targetKind,
    targetPath: payload?.targetPath
  });
  const informationRequest = await createInformationRequest({
    subject: resolved.subject,
    target: resolved.target,
    channel: payload?.channel,
    recipients: normalizeInformationRecipients(payload?.recipients),
    message: payload?.message,
    provider: payload?.provider || {},
    createdBy: user?.username || ""
  });
  const responseUrl = contributionResponseUrl(request, informationRequest.token);
  let delivery;

  try {
    delivery = await sendInformationRequestViaMicrosoft(informationRequest, responseUrl, user?.username || "local");
  } catch (error) {
    delivery = {
      state: "failed",
      sentAt: "",
      error: error?.message || "Microsoft sending failed.",
      provider: {}
    };
  }

  const deliveredRequest = await recordInformationRequestDelivery(informationRequest.token, delivery);

  return {
    request: deliveredRequest,
    responseUrl
  };
}

function informationRequestFilters(url) {
  return {
    subjectType: url.searchParams.get("subjectType") || "",
    subjectSlug: url.searchParams.get("subjectSlug") || "",
    channel: url.searchParams.get("channel") || "",
    deliveryState: url.searchParams.get("deliveryState") || "",
    responseState: url.searchParams.get("responseState") || ""
  };
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname === "/health") {
      sendJson(response, { ok: true, pdfQueue: PDF_QUEUE.stats() });
      return;
    }

    if (rejectInsecureRequest(request, response)) {
      return;
    }

    const requiredRole = requiredRoleFor(request, pathname);
    const user = await userForRequest(request);

    if (requiredRole && !user) {
      requestAuth(response);
      return;
    }

    if (requiredRole && !hasRole(user, requiredRole)) {
      rejectForbidden(response);
      return;
    }

    if (pathname.startsWith("/assets/")) {
      await serveStatic(response, path.join(ROOT, "public/assets"), pathname.replace("/assets/", ""));
      return;
    }

    if (pathname.startsWith("/app/")) {
      await serveStatic(response, path.join(ROOT, "src/app"), pathname.replace("/app/", ""));
      return;
    }

    if (pathname === "/pdf/theme.css") {
      await serveStatic(response, path.join(ROOT, "src/pdf"), "theme.css");
      return;
    }

    if (request.method === "GET" && pathname === "/auth/microsoft/start") {
      redirect(response, await createMicrosoftAuthUrl(user?.username || "local", requestOrigin(request)));
      return;
    }

    if (request.method === "GET" && pathname === "/auth/microsoft/callback") {
      await completeMicrosoftAuth({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        origin: requestOrigin(request)
      });
      redirect(response, "/requests");
      return;
    }

    if (request.method === "POST" && pathname === "/auth/microsoft/disconnect") {
      await disconnectMicrosoft(user?.username || "local");
      redirect(response, "/requests");
      return;
    }

    if (request.method === "GET" && pathname === "/api/microsoft/status") {
      sendJson(response, await microsoftStatus(user?.username || "local"));
      return;
    }

    if (request.method === "GET" && pathname === "/api/microsoft/teams") {
      sendJson(response, await listMicrosoftTeams(user?.username || "local"));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/microsoft/teams/") && pathname.endsWith("/channels")) {
      const teamId = decodeURIComponent(pathname.replace("/api/microsoft/teams/", "").replace(/\/channels$/, ""));
      sendJson(response, await listMicrosoftChannels(user?.username || "local", teamId));
      return;
    }

    if (request.method === "GET" && pathname === "/requests") {
      const filters = informationRequestFilters(url);
      sendHtml(response, renderInformationRequestsPage({
        requests: await listInformationRequests(filters),
        filters,
        microsoft: await microsoftStatus(user?.username || "local")
      }));
      return;
    }

    if (pathname.startsWith("/contribute/")) {
      const token = assertInformationRequestToken(pathname.replace("/contribute/", ""));

      if (request.method === "GET") {
        let model;

        try {
          model = await informationRequestModel(token);
        } catch (error) {
          if (error.code !== "ENOENT" && error.status !== 404) {
            throw error;
          }

          model = await contributionRequestModel(assertContributionRequestToken(token));
        }

        sendHtml(response, renderContributionRequestPage(model));
        return;
      }

      if (request.method === "POST") {
        let model;
        const form = await readFormRequest(request);

        try {
          model = await saveInformationResponse(token, form);
        } catch (error) {
          if (error.code !== "ENOENT" && error.status !== 404) {
            throw error;
          }

          model = await saveContributionResponse(assertContributionRequestToken(token), form);
        }

        sendHtml(response, renderContributionRequestPage(model, {
          submitted: true
        }));
        return;
      }

      methodNotAllowed(response, ["GET", "POST"]);
      return;
    }

    if (request.method === "GET" && pathname === "/api/information-requests") {
      sendJson(response, await listInformationRequests(informationRequestFilters(url)));
      return;
    }

    if (request.method === "GET" && /^\/api\/information-requests\/[a-f0-9]{48}$/.test(pathname)) {
      sendJson(response, await readInformationRequest(pathname.replace("/api/information-requests/", "")));
      return;
    }

    if (request.method === "POST" && pathname === "/api/information-requests") {
      sendJson(response, await createInformationRequestFromPayload(await readJsonRequest(request), user, request));
      return;
    }

    if (request.method === "POST" && pathname === "/api/engineering-report-contribution-requests") {
      sendJson(response, await createEngineeringContributionRequest(await readJsonRequest(request), user, request));
      return;
    }

    if (request.method === "POST" && pathname === "/api/engineering-report-contribution-replies") {
      sendJson(response, await saveContributionEmailReply(request));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/banner/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/banner/", ""));
      sendPng(response, `${slug}-bd-marketing-banner`, await PDF_QUEUE.add(() => EXPORTS.bdDocumentMarketingBanner(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/pdf/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/pdf/", ""));
      sendPdf(response, `${slug}-bd`, await PDF_QUEUE.add(() => EXPORTS.bdDocumentPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/bd/word/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/export/bd/word/", ""));
      sendWordDocument(response, `${slug}-bd`, await EXPORTS.bdDocumentWord(slug));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/pdf/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/pdf/", ""));
      sendPdf(response, slug, await PDF_QUEUE.add(() => EXPORTS.projectPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/banner/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/banner/", ""));
      sendPng(response, `${slug}-marketing-banner`, await PDF_QUEUE.add(() => EXPORTS.projectMarketingBanner(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/word/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/word/", ""));
      sendWordDocument(response, slug, await EXPORTS.projectWord(slug));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/compile/")) {
      const slug = assertEngineeringReportSlug(pathname.replace("/api/export/engineering/compile/", ""));
      sendPdf(response, `${slug}-engineering-report`, await PDF_QUEUE.add(() => EXPORTS.engineeringOutlinePdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/section/")) {
      const [slug, sectionSlug] = pathname.replace("/api/export/engineering/section/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);
      sendPdf(response, `${safeSlug}-${safeSectionSlug}`, await PDF_QUEUE.add(() => EXPORTS.engineeringOutlineSectionPdf(safeSlug, safeSectionSlug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/subsection/")) {
      const [slug, subsectionSlug] = pathname.replace("/api/export/engineering/subsection/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSubsectionSlug = assertEngineeringReportSlug(subsectionSlug);
      sendPdf(response, `${safeSlug}-${safeSubsectionSlug}`, await PDF_QUEUE.add(() => EXPORTS.engineeringOutlineSubsectionPdf(safeSlug, safeSubsectionSlug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/engineering/pdf/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/engineering/pdf/", ""));
      sendPdf(response, `${slug}-engineering-report`, await PDF_QUEUE.add(() => EXPORTS.projectEngineeringReportPdf(slug)));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/api/export/xlsx/")) {
      const slug = assertProjectSlug(pathname.replace("/api/export/xlsx/", ""));
      sendXlsx(response, slug, await EXPORTS.projectXlsx(slug));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/pdf") {
      sendJson(response, await UPLOADS.importPdf(request, "project"));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/bd/pdf") {
      sendJson(response, await UPLOADS.importPdf(request, "bd"));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/bd/word") {
      sendJson(response, await UPLOADS.importBdDocumentWord(request));
      return;
    }

    if (request.method === "POST" && pathname === "/api/import/word") {
      sendJson(response, await UPLOADS.importProjectWord(request));
      return;
    }

    if (request.method === "GET" && pathname === "/") {
      const [projects, bdDocuments, engineeringReport] = await Promise.all([
        listProjects(),
        listBdDocuments(),
        readDefaultEngineeringReport()
      ]);

      sendHtml(response, renderDashboard(projects, bdDocuments, {
        engineeringReport,
        activeView: url.searchParams.get("view")
      }));
      return;
    }

    if (request.method === "GET" && pathname === "/builder") {
      const projects = await listProjects();
      redirect(response, `/builder/${projects[0]?.slug || "uber-sample"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/builder/")) {
      const slug = assertProjectSlug(pathname.replace("/builder/", ""));
      const record = await readProjectForBuilder(slug, url.searchParams.get("template"));
      sendHtml(response, renderBuilder(record.project, slug, { revision: record.revision }));
      return;
    }

    if (request.method === "GET" && pathname === "/bd-builder") {
      const documents = await listBdDocuments();
      redirect(response, `/bd-builder/${documents[0]?.slug || "enterprise-build-support"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/bd-builder/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/bd-builder/", ""));
      const record = await readBdDocumentForBuilder(slug, url.searchParams.get("template"));
      sendHtml(response, renderBdBuilder(record.document, slug, { revision: record.revision }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/marketing-banner/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/marketing-banner/projects/", ""));
      sendHtml(response, renderMarketingBanner(await readProjectForPreview(slug), { slug, type: "project" }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/marketing-banner/bd/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/marketing-banner/bd/", ""));
      sendHtml(response, renderMarketingBanner(await readBdDocumentForPreview(slug), { slug, type: "bd" }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/projects/", ""));
      sendHtml(response, renderCaseStudy(await readProjectForPreview(slug), { slug }));
      return;
    }

    if (request.method === "GET" && pathname === "/engineering-report") {
      redirect(response, "/engineering-report/stage-2-basis-of-design");
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/engineering-report/")) {
      const parts = pathname.replace("/engineering-report/", "").split("/").filter(Boolean);
      const slug = assertEngineeringReportSlug(parts[0]);
      const report = await readEngineeringReportForRender(slug);

      if (parts.length === 1) {
        sendHtml(response, renderEngineeringOutlineReport(report));
        return;
      }

      if (parts.length === 3 && parts[1] === "sections") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          section: findEngineeringReportSection(report, parts[2])
        }));
        return;
      }

      if (parts.length === 4 && parts[1] === "sections" && parts[3] === "edit") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          section: findEngineeringReportSection(report, parts[2]),
          mode: "edit"
        }));
        return;
      }

      if (parts.length === 3 && parts[1] === "subsections") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          subsection: findEngineeringReportSubsection(report, parts[2])
        }));
        return;
      }

      if (parts.length === 4 && parts[1] === "subsections" && parts[3] === "edit") {
        sendHtml(response, renderEngineeringOutlineReport(report, {
          subsection: findEngineeringReportSubsection(report, parts[2]),
          mode: "edit"
        }));
        return;
      }

      throw httpError(404, "Engineering report route was not found.");
    }

    if (request.method === "GET" && pathname === "/engineering-reports") {
      const projects = await listProjects();
      redirect(response, `/engineering-reports/${projects[0]?.slug || "uber-sample"}`);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/engineering-reports/")) {
      const slug = assertProjectSlug(pathname.replace("/engineering-reports/", ""));
      sendHtml(response, renderEngineeringReport(await readProjectForPreview(slug), { slug }));
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/bd/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/bd/", ""));
      sendHtml(response, renderBdDocument(await readBdDocumentForPreview(slug), { slug }));
      return;
    }

    if (pathname.startsWith("/api/projects/")) {
      const slug = assertProjectSlug(pathname.replace("/api/projects/", ""));

      if (request.method === "GET") {
        const record = await readProjectRecord(slug);
        sendJson(response, record.project, { "ETag": `"${record.revision}"` });
        return;
      }

      if (request.method === "POST") {
        if (!request.headers["if-match"]) {
          throw httpError(428, "Missing If-Match header. Reload the project before saving.");
        }

        const ifMatch = String(request.headers["if-match"]).replace(/^"|"$/g, "");
        const record = await saveProjectRecord(slug, await readJsonRequest(request), ifMatch);
        sendJson(response, record.project, { "ETag": `"${record.revision}"` });
        return;
      }

      methodNotAllowed(response, ["GET", "POST"]);
      return;
    }

    if (pathname.startsWith("/api/bd-documents/")) {
      const slug = assertBdDocumentSlug(pathname.replace("/api/bd-documents/", ""));

      if (request.method === "GET") {
        const record = await readBdDocumentRecord(slug);
        sendJson(response, record.document, { "ETag": `"${record.revision}"` });
        return;
      }

      if (request.method === "POST") {
        if (!request.headers["if-match"]) {
          throw httpError(428, "Missing If-Match header. Reload the business development document before saving.");
        }

        const ifMatch = String(request.headers["if-match"]).replace(/^"|"$/g, "");
        const record = await saveBdDocumentRecord(slug, await readJsonRequest(request), ifMatch);
        sendJson(response, record.document, { "ETag": `"${record.revision}"` });
        return;
      }

      methodNotAllowed(response, ["GET", "POST"]);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-images/")) {
      const [slug, pageKind, pageSlug] = pathname.replace("/api/engineering-report-images/", "").split("/").filter(Boolean);

      if (request.method === "POST") {
        sendJson(response, await UPLOADS.uploadEngineeringReportImage(request, slug, pageKind, pageSlug));
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-spreadsheets/")) {
      const [slug, sectionSlug] = pathname.replace("/api/engineering-report-spreadsheets/", "").split("/").filter(Boolean);

      if (request.method === "POST") {
        sendJson(response, await UPLOADS.uploadEngineeringReportSpreadsheet(request, slug, sectionSlug));
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-sections/")) {
      const [slug, sectionSlug] = pathname.replace("/api/engineering-report-sections/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSectionSlug = assertEngineeringReportSlug(sectionSlug);

      if (request.method === "POST") {
        sendJson(response, {
          draft: await saveEngineeringReportSectionDraft(safeSlug, safeSectionSlug, await readJsonRequest(request))
        });
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-subsections/")) {
      const [slug, subsectionSlug] = pathname.replace("/api/engineering-report-subsections/", "").split("/").filter(Boolean);
      const safeSlug = assertEngineeringReportSlug(slug);
      const safeSubsectionSlug = assertEngineeringReportSlug(subsectionSlug);

      if (request.method === "POST") {
        sendJson(response, {
          draft: await saveEngineeringReportSubsectionDraft(safeSlug, safeSubsectionSlug, await readJsonRequest(request))
        });
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    if (pathname.startsWith("/api/engineering-report-order/")) {
      const safeSlug = assertEngineeringReportSlug(pathname.replace("/api/engineering-report-order/", ""));

      if (request.method === "POST") {
        sendJson(response, {
          report: await saveEngineeringReportOrder(safeSlug, await readJsonRequest(request))
        });
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    if (pathname.startsWith("/api/assets/")) {
      const slug = assertProjectSlug(pathname.replace("/api/assets/", ""));

      if (request.method === "POST") {
        sendJson(response, await UPLOADS.uploadAsset(request, slug));
        return;
      }

      methodNotAllowed(response, ["POST"]);
      return;
    }

    fail(request, response, 404, "Not found.");
  } catch (error) {
    const status = errorStatus(error);
    const message = publicErrorMessage(error, status);

    if (status >= 500) {
      console.error(error);
    }

    fail(request, response, status, message);
  }
}

const server = http.createServer(handleRequest);

server.on("clientError", (error, socket) => {
  console.warn(`Bad HTTP request: ${error.message}`);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use on ${HOST}.`);
  } else if (error.code === "EACCES" || error.code === "EPERM") {
    console.error(`Cannot bind to ${HOST}:${PORT}. Check local networking permissions.`);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Case-study builder running at http://${HOST}:${PORT}`);
});
