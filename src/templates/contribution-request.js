import { html } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asText(value) {
  return String(value ?? "").trim();
}

function pageLabel(request, target) {
  if (request.subject && request.target) {
    return request.target.label || request.subject.title;
  }

  const kind = request.pageKind === "section" ? "Section" : "Subsection";
  const number = asText(target?.number);
  const title = asText(target?.title || request.pageTitle);

  return [kind, number, title].filter(Boolean).join(" ");
}

function draftBody(target) {
  return asText(target?.currentBody || target?.draft?.body);
}

function contributorName(request) {
  if (request.subject) {
    return asText(request.response?.contributorName || request.recipients?.[0]?.name || request.recipients?.[0]?.email);
  }

  return asText(request.response?.contributorName || request.recipientName);
}

function reportTitle(request, report) {
  return asText(request.subject?.title || report.title || request.reportTitle);
}

function submittedMessage(request) {
  return request.responseStatus?.state === "apply-failed"
    ? "Response saved. An editor needs to apply it manually."
    : "Response saved.";
}

function contributionForm({ request, report, target, submitted = false }) {
  return html`<main class="contribution-page">
    <section class="contribution-panel">
      <header class="contribution-panel__header">
        <span>${reportTitle(request, report)}</span>
        <h1>${pageLabel(request, target)}</h1>
        ${request.message ? html`<p>${request.message}</p>` : ""}
      </header>
      ${submitted ? html`<p class="contribution-panel__status" data-state="success">${submittedMessage(request)}</p>` : ""}
      ${(request.submittedAt || request.responseStatus?.receivedAt) && !submitted ? html`<p class="contribution-panel__status">Last submitted ${request.submittedAt || request.responseStatus.receivedAt}</p>` : ""}
      <form class="contribution-panel__form" method="post" action="/contribute/${request.token}">
        <label for="contribution-contributor-name">
          <span>Your name</span>
          <input id="contribution-contributor-name" name="contributorName" value="${contributorName(request)}" autocomplete="name" maxlength="120">
        </label>
        <label for="contribution-response-body">
          <span>Response text</span>
          <textarea id="contribution-response-body" name="body" rows="18" maxlength="60000" required>${request.response?.body || draftBody(target)}</textarea>
        </label>
        <div class="contribution-panel__actions">
          <button type="submit">Submit response</button>
        </div>
      </form>
    </section>
  </main>`;
}

export function renderContributionRequestPage(model, options = {}) {
  return renderDocument({
    title: `${pageLabel(model.request, model.target)} contribution`,
    body: contributionForm({ ...model, submitted: Boolean(options.submitted) }),
    bodyClass: "case-study-body contribution-body",
    styles: ["/pdf/theme.css"]
  });
}
