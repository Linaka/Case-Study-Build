import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { hashPassword } from "../src/lib/auth.js";

const PASSWORD = "production-smoke-password";

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, childProcess, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (childProcess.exitCode !== null) {
      throw new Error(`Production server exited before it was ready with code ${childProcess.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function expectStatus(url, status, headers = {}) {
  const response = await fetch(url, { headers });

  if (response.status !== status) {
    throw new Error(`Expected ${status} for ${url}, got ${response.status}.`);
  }

  return response;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "case-study-production-smoke-"));
const usersFile = path.join(root, "users.json");
const backupDir = path.join(root, "backups");
const port = await getFreePort();

await fs.writeFile(usersFile, JSON.stringify({
  users: [
    {
      username: "viewer",
      passwordHash: await hashPassword(PASSWORD),
      roles: ["viewer"]
    }
  ]
}, null, 2));
await fs.mkdir(backupDir, { recursive: true });

const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    TRUST_PROXY: "1",
    AUTH_USERS_FILE: usersFile,
    BACKUP_DIR: backupDir
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const stderr = [];

server.on("error", error => {
  console.error(`Could not start production server: ${error.message}`);
});
server.stderr.on("data", chunk => stderr.push(chunk));

try {
  const origin = `http://127.0.0.1:${port}`;
  await waitForServer(`${origin}/health`, server);

  await expectStatus(`${origin}/`, 426, {
    "Authorization": basicAuth("viewer", PASSWORD)
  });
  await expectStatus(`${origin}/`, 401, {
    "X-Forwarded-Proto": "https"
  });

  const ok = await expectStatus(`${origin}/?view=bd-documents`, 200, {
    "Authorization": basicAuth("viewer", PASSWORD),
    "X-Forwarded-Proto": "https"
  });
  const body = await ok.text();

  if (!body.includes("Business development")) {
    throw new Error("Production smoke response did not render the expected dashboard.");
  }

  console.log("Production smoke passed with hashed auth, BACKUP_DIR and TLS proxy enforcement.");
} catch (error) {
  const detail = Buffer.concat(stderr).toString("utf8").trim();
  console.error(detail ? `${error.message}\n${detail}` : error.message);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    server.kill();
  }

  await fs.rm(root, { recursive: true, force: true });
}
