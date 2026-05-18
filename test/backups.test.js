import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertBackupConfigured, backupWrittenFile } from "../src/lib/backups.js";

test("backupWrittenFile copies files into timestamped backup directories", async () => {
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-backups-"));
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-source-"));
  const sourcePath = path.join(sourceDir, "sample.json");
  process.env.BACKUP_DIR = backupDir;

  try {
    await fs.writeFile(sourcePath, "{\"ok\":true}\n", "utf8");
    const backupPath = await backupWrittenFile(sourcePath, "data/projects/sample.json");

    assert.match(backupPath, /data\/projects\/sample\.json$/);
    assert.equal(await fs.readFile(backupPath, "utf8"), "{\"ok\":true}\n");
  } finally {
    delete process.env.BACKUP_DIR;
  }
});

test("assertBackupConfigured requires BACKUP_DIR in production", () => {
  delete process.env.BACKUP_DIR;

  assert.throws(
    () => assertBackupConfigured({ isProduction: true }),
    /BACKUP_DIR/
  );
});
