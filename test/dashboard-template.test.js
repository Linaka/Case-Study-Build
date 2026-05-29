import assert from "node:assert/strict";
import test from "node:test";

import { toHtml } from "../src/lib/html.js";
import { renderDashboard } from "../src/templates/app.js";

const PROJECTS = [
  {
    slug: "sample-case-study",
    title: "Sample case study",
    subtitle: "A focused proof story.",
    year: "2026",
    sector: "Product"
  }
];

const BD_DOCUMENTS = [
  {
    slug: "sample-bd-document",
    title: "Sample BD document",
    subtitle: "A focused sales document.",
    year: "2026",
    audience: "Enterprise buyers"
  }
];

const ENGINEERING_REPORT = {
  slug: "stage-2-basis-of-design",
  title: "Stage 2 Basis of Design",
  sectionCount: 3,
  subsectionCount: 2,
  groups: [
    {
      title: "Project and design basis",
      slug: "project-and-design-basis",
      sections: [
        {
          number: "1",
          title: "Document Control",
          slug: "1-document-control",
          groupTitle: "Project and design basis",
          subsections: [
            {
              number: "1.1",
              title: "Report title",
              slug: "1-1-report-title"
            },
            {
              number: "1.2",
              title: "Project name and number",
              slug: "1-2-project-name-and-number"
            }
          ]
        }
      ]
    },
    {
      title: "Appendices",
      slug: "appendices",
      sections: [
        {
          number: "Appendix A",
          title: "Appendix A: Stage 2 drawings",
          slug: "appendix-a-stage-2-drawings",
          groupTitle: "Appendices",
          subsections: []
        },
        {
          number: "Appendix B",
          title: "Appendix B: Design criteria schedule",
          slug: "appendix-b-design-criteria-schedule",
          groupTitle: "Appendices",
          subsections: []
        }
      ]
    }
  ]
};

test("dashboard landing presents creation choices, recent files and imports", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS, {
    engineeringReport: ENGINEERING_REPORT
  }));

  assert.match(markup, /<title>Document collaboration<\/title>/);
  assert.match(markup, /Start the right document/);
  assert.match(markup, />New case study</);
  assert.match(markup, />New BD document</);
  assert.match(markup, />New engineering report</);
  assert.match(markup, />New monthly report</);
  assert.match(markup, /href="\/builder\/new-monthly-report\?template=monthly-report"/);
  assert.match(markup, /Recent saved files/);
  assert.match(markup, /Sample case study/);
  assert.match(markup, /Sample BD document/);
  assert.match(markup, /Import new files/);
  assert.match(markup, /data-dashboard-import/);
  assert.match(markup, /data-import-kind="project"/);
  assert.match(markup, /data-import-kind="bd"/);
  assert.match(markup, /data-dashboard-import-status/);
  assert.match(markup, /src="\/app\/dashboard.js"/);
});

test("dashboard case-study view keeps local creation action", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS, { activeView: "case-studies" }));

  assert.match(markup, /<title>Case studies<\/title>/);
  assert.match(markup, /href="\/\?view=case-studies" aria-current="page"/);
  assert.match(markup, /href="\/\?view=bd-documents" aria-current="false"/);
  assert.match(markup, /href="\/\?view=engineering-reports" aria-current="false"/);
  assert.match(markup, /href="\/builder\/new-case-study"/);
  assert.match(markup, />New case study</);
  assert.doesNotMatch(markup, /New project/);
  assert.doesNotMatch(markup, /href="\/bd-builder\/new-business-development-doc"/);
  assert.doesNotMatch(markup, /href="\/api\/export\/engineering\/pdf\/sample-case-study"/);
});

test("dashboard BD view uses its own creation action", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS, { activeView: "bd-documents" }));

  assert.match(markup, /<title>Business development documents<\/title>/);
  assert.match(markup, /href="\/\?view=case-studies" aria-current="false"/);
  assert.match(markup, /href="\/\?view=bd-documents" aria-current="page"/);
  assert.match(markup, /href="\/\?view=engineering-reports" aria-current="false"/);
  assert.match(markup, /href="\/bd-builder\/new-business-development-document\?template=business-development-document"/);
  assert.match(markup, />New BD document</);
  assert.doesNotMatch(markup, /New project/);
  assert.doesNotMatch(markup, /href="\/builder\/new-case-study"/);
  assert.doesNotMatch(markup, /href="\/api\/export\/engineering\/pdf\/sample-case-study"/);
});

test("dashboard engineering view exposes report generation actions", () => {
  const markup = toHtml(renderDashboard(PROJECTS, BD_DOCUMENTS, {
    activeView: "engineering-reports",
    engineeringReport: ENGINEERING_REPORT
  }));

  assert.match(markup, /<title>Engineering reports<\/title>/);
  assert.match(markup, /href="\/\?view=case-studies" aria-current="false"/);
  assert.match(markup, /href="\/\?view=bd-documents" aria-current="false"/);
  assert.match(markup, /href="\/\?view=engineering-reports" aria-current="page"/);
  assert.match(markup, /Engineering report generation/);
  assert.match(markup, /Stage 2 Basis of Design/);
  assert.match(markup, /Report navigator/);
  assert.match(markup, />chapters</);
  assert.match(markup, />Chapters</);
  assert.match(markup, /href="\/engineering-report\/stage-2-basis-of-design"/);
  assert.match(markup, /href="\/api\/export\/engineering\/compile\/stage-2-basis-of-design"/);
  assert.match(markup, />Compile PDF</);
  assert.match(markup, /data-report-order-root/);
  assert.match(markup, /data-report-chapter-list/);
  assert.match(markup, /data-group-slug="project-and-design-basis"/);
  assert.match(markup, /data-report-subsection-list data-section-slug="1-document-control"/);
  assert.match(markup, /data-subsection-slug="1-1-report-title"/);
  assert.match(markup, /Appendix A\. Stage 2 drawings/);
  assert.match(markup, /Appendix B\. Design criteria schedule/);
  assert.doesNotMatch(markup, /Appendix A\. Appendix A:/);
  assert.doesNotMatch(markup, /Appendix B\. Appendix B:/);
  assert.match(markup, /data-reorder-handle/);
  assert.match(markup, /src="\/app\/engineering-report.js"/);
  assert.match(markup, /href="\/engineering-report\/stage-2-basis-of-design\/subsections\/1-1-report-title"/);
  assert.match(markup, /class="report-subsection-row__edit" href="\/engineering-report\/stage-2-basis-of-design\/subsections\/1-1-report-title\/edit"/);
  assert.match(markup, /href="\/engineering-report\/stage-2-basis-of-design\/subsections\/1-1-report-title\/edit"/);
  assert.match(markup, /href="\/api\/export\/engineering\/subsection\/stage-2-basis-of-design\/1-1-report-title"/);
  assert.match(markup, /Troubleshooting contact/);
  assert.match(markup, /Report coordinator/);
  assert.match(markup, /report-coordinator-placeholder\.svg/);
  assert.match(markup, /Alex Morgan/);
  assert.match(markup, /mailto:alex\.morgan@example\.com/);
  assert.match(markup, /Share the section or subsection number/);
  assert.doesNotMatch(markup, /Source narratives/);
  assert.doesNotMatch(markup, /Project-based engineering reports/);
  assert.doesNotMatch(markup, /href="\/engineering-reports\/sample-case-study"/);
  assert.doesNotMatch(markup, /href="\/api\/export\/engineering\/pdf\/sample-case-study"/);
  assert.doesNotMatch(markup, />Generate PDF</);
  assert.doesNotMatch(markup, /href="\/bd-builder\/new-business-development-doc"/);
  assert.doesNotMatch(markup, /href="\/builder\/new-case-study"/);
});
