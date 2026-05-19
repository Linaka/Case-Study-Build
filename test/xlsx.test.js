import assert from "node:assert/strict";
import test from "node:test";

import { createImpactWorkbook, impactWorkbookRows } from "../src/lib/xlsx.js";

const project = {
  title: "Impact case study",
  year: "2026",
  sector: "Product",
  role: "Design engineering",
  impact: [
    {
      metric: "Conversion lift",
      value: 12.5,
      unit: "%",
      description: "Measured after launch."
    },
    {
      metric: "Manual steps removed",
      value: 4,
      unit: "steps",
      description: "Reduced handoff work."
    }
  ]
};

test("impactWorkbookRows keeps numeric values as numbers", () => {
  const { rows, dataStartRow } = impactWorkbookRows(project);

  assert.equal(dataStartRow, 10);
  assert.equal(rows[9][0].value, "Conversion lift");
  assert.equal(rows[9][1].value, 12.5);
  assert.equal(rows[10][1].value, 4);
});

test("createImpactWorkbook returns an XLSX zip with numeric worksheet cells", () => {
  const workbook = createImpactWorkbook(project);
  const contents = workbook.toString("utf8");

  assert.equal(workbook.subarray(0, 2).toString("utf8"), "PK");
  assert.match(contents, /xl\/worksheets\/sheet1\.xml/);
  assert.match(contents, /<c r="B10"><v>12.5<\/v><\/c>/);
  assert.match(contents, /<conditionalFormatting sqref="B10:B11">/);
});
