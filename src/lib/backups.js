import fs from "node:fs/promises";
import path from "node:path";

function backupRoot() {
  return process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : "";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeRelativePath(relativePath) {
  const normalized = path.normalize(String(relativePath || "")).replace(/^(\.\.(\/|\\|$))+/, "");

  if (!normalized || path.isAbsolute(normalized)) {
    throw new Error("Backup path must be relative.");
  }

  return normalized;
}

export function backupEnabled() {
  return Boolean(backupRoot());
}

export function assertBackupConfigured({ isProduction = false } = {}) {
  if (isProduction && !backupEnabled()) {
    throw new Error("Production requires BACKUP_DIR so JSON and uploaded assets are versioned outside the live data directory.");
  }
}

export async function backupExistingFile(filePath, relativePath) {
  if (!backupEnabled()) {
    return null;
  }

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  return backupWrittenFile(filePath, relativePath);
}

export async function backupWrittenFile(filePath, relativePath) {
  if (!backupEnabled()) {
    return null;
  }

  const targetPath = path.join(backupRoot(), timestamp(), safeRelativePath(relativePath));

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(filePath, targetPath);

  return targetPath;
}
