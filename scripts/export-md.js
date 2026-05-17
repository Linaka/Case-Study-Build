import fs from "node:fs/promises";
import path from "node:path";

import { readProject } from "../src/lib/projects.js";
import { renderMarkdown } from "../src/templates/markdown.js";

const slug = process.argv[2] || process.env.PROJECT || "uber-sample";
const outputDir = path.resolve(process.cwd(), "exports");
const outputPath = path.join(outputDir, `${slug}.md`);

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, renderMarkdown(await readProject(slug)), "utf8");

console.log(`Markdown exported to ${outputPath}`);
