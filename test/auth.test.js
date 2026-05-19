import assert from "node:assert/strict";
import test from "node:test";

import { authenticateBasicAuth, hashPassword, hasRole, loadUserStore, verifyPassword } from "../src/lib/auth.js";

function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

test("hashPassword creates verifiable password hashes", async () => {
  const hash = await hashPassword("correct horse battery staple");

  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("loadUserStore authenticates hashed users and honors role hierarchy", async () => {
  const passwordHash = await hashPassword("secret");
  const store = await loadUserStore({
    usersJson: JSON.stringify({
      users: [{ username: "editor", passwordHash, roles: ["editor"] }]
    }),
    isProduction: true
  });
  const user = await authenticateBasicAuth(basic("editor", "secret"), store);

  assert.equal(user.username, "editor");
  assert.equal(hasRole(user, "viewer"), true);
  assert.equal(hasRole(user, "editor"), true);
  assert.equal(hasRole(user, "admin"), false);
});

test("loadUserStore rejects plaintext production credentials", async () => {
  await assert.rejects(
    () => loadUserStore({
      usersJson: JSON.stringify({
        users: [{ username: "admin", password: "secret", roles: ["admin"] }]
      }),
      isProduction: true
    }),
    /plaintext password/
  );

  await assert.rejects(
    () => loadUserStore({
      legacyPassword: "secret",
      isProduction: true
    }),
    /APP_PASSWORD/
  );
});
