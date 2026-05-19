import crypto from "node:crypto";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const HASH_PREFIX = "scrypt";
const HASH_KEY_LENGTH = 64;
const HASH_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1
};

const ROLE_LEVELS = new Map([
  ["viewer", 1],
  ["editor", 2],
  ["admin", 3]
]);

function authError(message) {
  const error = new Error(message);
  error.name = "AuthConfigError";
  return error;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeRoles(roles) {
  const normalized = (Array.isArray(roles) ? roles : [roles])
    .map(role => String(role || "").trim())
    .filter(Boolean);

  if (!normalized.length) {
    return ["viewer"];
  }

  normalized.forEach(role => {
    if (!ROLE_LEVELS.has(role)) {
      throw authError(`Unsupported role "${role}". Use viewer, editor or admin.`);
    }
  });

  return normalized;
}

function normalizeUser(user, allowPlaintext) {
  if (!user || typeof user !== "object") {
    throw authError("User entries must be objects.");
  }

  const username = String(user.username || "").trim();

  if (!username) {
    throw authError("Each user needs a username.");
  }

  if (!user.passwordHash && !user.password) {
    throw authError(`User "${username}" needs a passwordHash.`);
  }

  if (user.password && !allowPlaintext) {
    throw authError(`User "${username}" uses a plaintext password. Generate a passwordHash for production.`);
  }

  return {
    username,
    passwordHash: user.passwordHash ? String(user.passwordHash) : "",
    password: allowPlaintext && user.password ? String(user.password) : "",
    roles: normalizeRoles(user.roles || user.role || "viewer")
  };
}

function parseUsersJson(value) {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : parsed.users || [];
}

async function loadUsersFromFile(filePath) {
  if (!filePath) {
    return [];
  }

  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.users || [];
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(String(password), salt, HASH_KEY_LENGTH, HASH_OPTIONS);

  return [
    HASH_PREFIX,
    HASH_OPTIONS.N,
    HASH_OPTIONS.r,
    HASH_OPTIONS.p,
    salt,
    Buffer.from(key).toString("base64url")
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  const parts = String(encodedHash || "").split("$");

  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const [, nValue, rValue, pValue, salt, expected] = parts;
  const options = {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue)
  };

  if (!options.N || !options.r || !options.p || !salt || !expected) {
    return false;
  }

  const key = await scrypt(String(password), salt, HASH_KEY_LENGTH, options);
  return safeEqual(Buffer.from(key).toString("base64url"), expected);
}

export async function loadUserStore({
  usersFile = "",
  usersJson = "",
  legacyUser = "admin",
  legacyPassword = "",
  isProduction = false
} = {}) {
  const configuredUsers = [
    ...(await loadUsersFromFile(usersFile)),
    ...(parseUsersJson(usersJson) || [])
  ];
  const allowPlaintext = !isProduction;
  const users = configuredUsers.map(user => normalizeUser(user, allowPlaintext));

  if (!users.length && legacyPassword) {
    if (isProduction) {
      throw authError("APP_PASSWORD is only for local development. Use AUTH_USERS_FILE or AUTH_USERS with passwordHash in production.");
    }

    users.push(normalizeUser({
      username: legacyUser,
      password: legacyPassword,
      roles: ["admin"]
    }, true));
  }

  if (isProduction && !users.length) {
    throw authError("Production requires AUTH_USERS_FILE or AUTH_USERS with at least one hashed user.");
  }

  const byUsername = new Map(users.map(user => [user.username, user]));

  return {
    enabled: users.length > 0,
    users: byUsername
  };
}

export function parseBasicAuth(header) {
  const [scheme, encoded] = String(header || "").split(" ");

  if (scheme !== "Basic" || !encoded) {
    return null;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");

  if (separator === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1)
  };
}

export async function authenticateBasicAuth(header, userStore) {
  if (!userStore.enabled) {
    return {
      username: "local",
      roles: ["admin"]
    };
  }

  const credentials = parseBasicAuth(header);

  if (!credentials) {
    return null;
  }

  const user = userStore.users.get(credentials.username);

  if (!user) {
    return null;
  }

  const verified = user.passwordHash
    ? await verifyPassword(credentials.password, user.passwordHash)
    : safeEqual(credentials.password, user.password);

  if (!verified) {
    return null;
  }

  return {
    username: user.username,
    roles: user.roles
  };
}

export function hasRole(user, requiredRole = "viewer") {
  const requiredLevel = ROLE_LEVELS.get(requiredRole) || ROLE_LEVELS.get("viewer");
  const userLevel = Math.max(...(user?.roles || []).map(role => ROLE_LEVELS.get(role) || 0), 0);

  return userLevel >= requiredLevel;
}
