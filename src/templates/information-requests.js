import { html } from "../lib/html.js";
import { renderDocument } from "./layout.js";

function asText(value) {
  return String(value ?? "").trim();
}

function formatDate(value) {
  if (!asText(value)) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function channelLabel(channel) {
  return {
    email: "Email",
    "teams-chat": "Teams chat",
    "teams-channel": "Teams channel"
  }[channel] || channel;
}

function responseLabel(request) {
  if (request.responseStatus.state === "applied") {
    return "Received and applied";
  }

  if (request.responseStatus.state === "apply-failed") {
    return "Received, apply failed";
  }

  if (request.deliveryStatus.state === "failed") {
    return "Delivery failed";
  }

  return "Awaiting response";
}

function requestRecipientLabel(request) {
  if (request.channel === "teams-channel") {
    return [request.provider.teamName, request.provider.channelName].filter(Boolean).join(" / ") || "Teams channel";
  }

  return request.recipients
    .map(recipient => recipient.name || recipient.email || recipient.userPrincipalName)
    .filter(Boolean)
    .join(", ");
}

function option(value, label, selectedValue) {
  return html`<option value="${value}"${value === selectedValue ? " selected" : ""}>${label}</option>`;
}

function filtersMarkup(filters) {
  return html`<form class="request-filters" method="get" action="/requests">
    <label>
      <span>Status</span>
      <select name="responseState">
        ${option("", "Any status", filters.responseState)}
        ${option("pending", "Awaiting response", filters.responseState)}
        ${option("applied", "Received and applied", filters.responseState)}
        ${option("apply-failed", "Apply failed", filters.responseState)}
      </select>
    </label>
    <label>
      <span>Channel</span>
      <select name="channel">
        ${option("", "Any channel", filters.channel)}
        ${option("email", "Email", filters.channel)}
        ${option("teams-chat", "Teams chat", filters.channel)}
        ${option("teams-channel", "Teams channel", filters.channel)}
      </select>
    </label>
    <label>
      <span>Document type</span>
      <select name="subjectType">
        ${option("", "Any type", filters.subjectType)}
        ${option("project", "Case study", filters.subjectType)}
        ${option("bd-document", "Business development", filters.subjectType)}
        ${option("engineering-report", "Engineering report", filters.subjectType)}
      </select>
    </label>
    <button class="button button--primary" type="submit">Filter</button>
    <a class="button button--subtle" href="/requests">Reset</a>
  </form>`;
}

function requestRow(request) {
  const state = request.responseStatus.state === "pending" ? request.deliveryStatus.state : request.responseStatus.state;
  const error = request.responseStatus.applyError || request.deliveryStatus.error;

  return html`<article class="request-row" data-state="${state}">
    <div class="request-row__main">
      <span class="request-row__badge">${channelLabel(request.channel)}</span>
      <h2>${request.target.label}</h2>
      <p>${request.subject.title}</p>
      <p>${requestRecipientLabel(request)}</p>
      ${error ? html`<p class="request-row__error">${error}</p>` : ""}
    </div>
    <div class="request-row__meta">
      <strong>${responseLabel(request)}</strong>
      <span>${request.deliveryStatus.sentAt ? `Sent ${formatDate(request.deliveryStatus.sentAt)}` : `Created ${formatDate(request.createdAt)}`}</span>
      ${request.responseStatus.receivedAt ? html`<span>Received ${formatDate(request.responseStatus.receivedAt)}</span>` : ""}
      <a href="/contribute/${request.token}">Response form</a>
    </div>
  </article>`;
}

export function renderInformationRequestsPage({ requests, filters = {}, microsoft = {} }) {
  const body = html`<main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Information requests</p>
        <h1>Request tracker</h1>
        <p class="landing-header__copy">Track who has been asked, where the request was sent, and whether the response has arrived.</p>
      </div>
      <nav class="button-row" aria-label="Request tracker actions">
        <a class="button button--subtle" href="/">Projects</a>
        ${microsoft.configured && !microsoft.connected ? html`<a class="button button--primary" href="/auth/microsoft/start">Connect Microsoft</a>` : ""}
        ${microsoft.connected ? html`<form method="post" action="/auth/microsoft/disconnect"><button class="button button--subtle" type="submit">Disconnect Microsoft</button></form>` : ""}
      </nav>
    </header>
    ${!microsoft.configured ? html`<p class="request-setup-warning">Microsoft sending is disabled. Set ${microsoft.missing?.join(", ")} to send email and Teams requests.</p>` : ""}
    ${microsoft.connected ? html`<p class="request-setup-note">Connected as ${microsoft.account?.name || microsoft.account?.username}.</p>` : ""}
    ${filtersMarkup(filters)}
    <section class="request-list" aria-label="Information request records">
      ${requests.length ? requests.map(requestRow) : html`<p class="empty-state">No information requests match these filters.</p>`}
    </section>
  </main>`;

  return renderDocument({
    title: "Information request tracker",
    body,
    bodyClass: "app-body",
    styles: ["/app/app.css"],
    scripts: ["/app/information-requests.js"]
  });
}

