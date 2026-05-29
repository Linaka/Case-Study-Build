import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("contribution requests persist tokenized engineering report response records", async () => {
  const requestDir = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-contribution-requests-"));
  process.env.ENGINEERING_REPORT_CONTRIBUTION_REQUESTS_DIR = requestDir;

  try {
    const {
      createContributionRequest,
      markContributionRequestSubmitted,
      readContributionRequest
    } = await import("../src/lib/contribution-requests.js");
    const request = await createContributionRequest({
      reportSlug: "stage-2-basis-of-design",
      pageKind: "subsection",
      pageSlug: "1-1-report-title",
      pageTitle: "Subsection 1.1 Report title",
      reportTitle: "Stage 2 Basis of Design",
      recipientEmail: "sam@example.com",
      recipientName: "Sam",
      message: "Please update this text.",
      createdBy: "editor"
    });

    assert.match(request.token, /^[a-f0-9]{48}$/);
    assert.equal(request.recipientEmail, "sam@example.com");
    assert.equal(request.response, null);

    const saved = await readContributionRequest(request.token);
    assert.equal(saved.pageSlug, "1-1-report-title");

    const submitted = await markContributionRequestSubmitted(request.token, {
      contributorName: "Sam",
      body: "Updated contribution text."
    });

    assert.equal(submitted.response.contributorName, "Sam");
    assert.equal(submitted.response.body, "Updated contribution text.");
    assert.ok(submitted.submittedAt);
  } finally {
    delete process.env.ENGINEERING_REPORT_CONTRIBUTION_REQUESTS_DIR;
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});

test("contribution reply payloads extract reply text above the email quote", async () => {
  const { extractContributionReplyPayload } = await import(`../src/lib/contribution-requests.js?reply=${Date.now()}`);
  const token = "b".repeat(48);
  const reply = extractContributionReplyPayload({
    Subject: `Re: Input requested ${token}`,
    FromName: "Sam Reviewer",
    TextBody: `Use this paragraph in the report.

Please reply above this line. Your reply text will be added to the document automatically.

Contribution request: ${token}

On Monday, Editor wrote:
> Original request`
  });

  assert.equal(reply.token, token);
  assert.equal(reply.contributorName, "Sam Reviewer");
  assert.equal(reply.body, "Use this paragraph in the report.");
});

test("contribution requests reject invalid recipient email addresses", async () => {
  const requestDir = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-contribution-requests-"));
  process.env.ENGINEERING_REPORT_CONTRIBUTION_REQUESTS_DIR = requestDir;

  try {
    const { createContributionRequest } = await import(`../src/lib/contribution-requests.js?invalid=${Date.now()}`);

    await assert.rejects(
      createContributionRequest({
        reportSlug: "stage-2-basis-of-design",
        pageKind: "section",
        pageSlug: "1-document-control",
        pageTitle: "Section 1 Document Control",
        reportTitle: "Stage 2 Basis of Design",
        recipientEmail: "not-an-email",
        recipientName: "",
        message: "",
        createdBy: "editor"
      }),
      /valid email/
    );
  } finally {
    delete process.env.ENGINEERING_REPORT_CONTRIBUTION_REQUESTS_DIR;
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});
