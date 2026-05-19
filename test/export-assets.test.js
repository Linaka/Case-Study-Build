import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const PUBLIC_ASSETS_DIR = path.join(ROOT, "public/assets");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function jsonFiles(directory) {
  try {
    const entries = await fs.readdir(path.join(ROOT, directory), { withFileTypes: true });

    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .map(entry => path.join(ROOT, directory, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function localAssetPath(assetPath) {
  assert.equal(typeof assetPath, "string", "Asset path must be a string.");
  assert.ok(assetPath.startsWith("/assets/"), `${assetPath} must start with /assets/.`);
  assert.ok(!assetPath.includes(".."), `${assetPath} must not contain parent-directory segments.`);
  assert.ok(!assetPath.includes("\\"), `${assetPath} must use URL path separators.`);

  const relativePath = assetPath.replace(/^\/assets\//, "");
  const filePath = path.resolve(PUBLIC_ASSETS_DIR, relativePath);

  assert.ok(
    filePath.startsWith(`${PUBLIC_ASSETS_DIR}${path.sep}`),
    `${assetPath} must resolve inside public/assets.`
  );

  return filePath;
}

async function assertAssetExists(assetPath, source) {
  const filePath = localAssetPath(assetPath);

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      assert.fail(`${source} references missing asset ${assetPath}`);
    }

    throw error;
  }
}

async function checkProjectAssets() {
  for (const filePath of await jsonFiles("data/projects")) {
    const project = await readJson(filePath);
    const source = path.relative(ROOT, filePath);

    for (const asset of project.assets || []) {
      await assertAssetExists(asset.path, source);
    }
  }
}

async function checkBdDocumentAssets() {
  for (const filePath of await jsonFiles("data/bd-documents")) {
    const document = await readJson(filePath);
    const source = path.relative(ROOT, filePath);

    for (const asset of document.assets || []) {
      await assertAssetExists(asset.path, source);
    }

    for (const section of document.proofSections || []) {
      if (section.assetPath) {
        await assertAssetExists(section.assetPath, source);
      }
    }
  }
}

async function checkEngineeringReportAssets() {
  for (const filePath of await jsonFiles("data/engineering-report-images")) {
    const manifest = await readJson(filePath);
    const source = path.relative(ROOT, filePath);

    for (const [page, images] of Object.entries(manifest.pages || {})) {
      for (const image of images || []) {
        await assertAssetExists(image.path, `${source} ${page}`);
      }
    }
  }
}

test("export source data only references local assets that ship with the repo", async () => {
  await checkProjectAssets();
  await checkBdDocumentAssets();
  await checkEngineeringReportAssets();
  await assertAssetExists(
    "/assets/engineering-reports/report-coordinator-placeholder.svg",
    "engineering report dashboard placeholder"
  );
});
