import fs from "node:fs/promises";
import path from "node:path";

import { readProject } from "../src/lib/projects.js";
import { createImpactWorkbook } from "../src/lib/xlsx.js";

const slug = process.argv[2] || process.env.PROJECT || "uber-sample";
const outputDir = path.resolve(process.cwd(), "exports");
const outputPath = path.join(outputDir, `${slug}-impact.xlsx`);

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, createImpactWorkbook(await readProject(slug)));

console.log(`Excel workbook exported to ${outputPath}`);
