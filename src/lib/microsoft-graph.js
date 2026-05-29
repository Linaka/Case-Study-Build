import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ConfidentialClientApplication } from "@azure/msal-node";

const MICROSOFT_TOKEN_DIR = path.resolve(process.env.MICROSOFT_TOKEN_DIR || path.join(process.cwd(), "data/microsoft-tokens"));
const MICROSOFT_STATE_DIR = path.resolve(process.env.MICROSOFT_STATE_DIR || path.join(process.cwd(), "data/microsoft-auth-states"));
const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Chat.Create",
  "ChatMessage.Send",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All"
];

function graphError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asText(value) {
  return String(value ?? "").trim();
}

function configuredRedirectUri(origin) {
  return process.env.MICROSOFT_REDIRECT_URI || `${origin}/auth/microsoft/callback`;
}

function missingConfig() {
  return [
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_TOKEN_SECRET"
  ].filter(name => !asText(process.env[name]));
}

function assertMicrosoftConfigured() {
  const missing = missingConfig();

  if (missing.length) {
    throw graphError(`Microsoft sending is not configured. Set ${missing.join(", ")}.`, 503);
  }
}

function msalConfig() {
  assertMicrosoftConfigured();

  return {
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET
    }
  };
}

function fileKey(value) {
  return crypto.createHash("sha256").update(asText(value) || "local").digest("hex");
}

function tokenPath(username) {
  return path.join(MICROSOFT_TOKEN_DIR, `${fileKey(username)}.json`);
}

function statePath(state) {
  return path.join(MICROSOFT_STATE_DIR, `${fileKey(state)}.json`);
}

function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.MICROSOFT_TOKEN_SECRET || "").digest();
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: ciphertext.toString("base64url")
  };
}

function decryptText(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64url"));

  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

async function readEncryptedCache(username) {
  try {
    const parsed = JSON.parse(await fs.readFile(tokenPath(username), "utf8"));
    return decryptText(parsed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function writeEncryptedCache(username, serializedCache) {
  await fs.mkdir(MICROSOFT_TOKEN_DIR, { recursive: true });
  await fs.writeFile(tokenPath(username), `${JSON.stringify(encryptText(serializedCache), null, 2)}\n`, "utf8");
}

async function microsoftClient(username) {
  const client = new ConfidentialClientApplication(msalConfig());
  const serializedCache = await readEncryptedCache(username);

  if (serializedCache) {
    client.getTokenCache().deserialize(serializedCache);
  }

  return client;
}

async function saveMicrosoftClient(username, client) {
  await writeEncryptedCache(username, client.getTokenCache().serialize());
}

async function accessTokenForUser(username) {
  const client = await microsoftClient(username);
  const accounts = await client.getTokenCache().getAllAccounts();

  if (!accounts.length) {
    throw graphError("Connect Microsoft before sending information requests.", 401);
  }

  const token = await client.acquireTokenSilent({
    account: accounts[0],
    scopes: SCOPES
  });

  await saveMicrosoftClient(username, client);

  if (!token?.accessToken) {
    throw graphError("Microsoft did not return an access token.", 502);
  }

  return {
    accessToken: token.accessToken,
    account: accounts[0]
  };
}

async function graphRequest(accessToken, endpoint, { method = "GET", body } = {}) {
  const response = await fetch(`${GRAPH_ROOT}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error?.message || `Microsoft Graph request failed with HTTP ${response.status}.`;
    throw graphError(message, response.status);
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRequestMessage(request, responseUrl) {
  const recipientName = request.recipients[0]?.name;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const message = request.message || `Could you provide the information for ${request.target.label}?`;

  return [
    greeting,
    "",
    message,
    "",
    `Target: ${request.subject.title} - ${request.target.label}`,
    `Response link: ${responseUrl}`,
    "",
    "Thanks"
  ].join("\n");
}

function formatTeamsMessage(request, responseUrl) {
  return formatRequestMessage(request, responseUrl)
    .split("\n")
    .map(escapeHtml)
    .join("<br>");
}

function recipientAddress(recipient) {
  return recipient.email || recipient.userPrincipalName;
}

function graphUserBind(identifier) {
  return `https://graph.microsoft.com/v1.0/users('${String(identifier).replace(/'/g, "''")}')`;
}

async function sendEmailRequest(accessToken, request, responseUrl) {
  await graphRequest(accessToken, "/me/sendMail", {
    method: "POST",
    body: {
      message: {
        subject: `Information requested: ${request.target.label}`,
        body: {
          contentType: "Text",
          content: formatRequestMessage(request, responseUrl)
        },
        toRecipients: request.recipients.map(recipient => ({
          emailAddress: {
            name: recipient.name,
            address: recipientAddress(recipient)
          }
        }))
      },
      saveToSentItems: true
    }
  });

  return {};
}

async function sendTeamsChatRequest(accessToken, request, responseUrl) {
  const me = await graphRequest(accessToken, "/me?$select=id,userPrincipalName,displayName");
  const chat = await graphRequest(accessToken, "/chats", {
    method: "POST",
    body: {
      chatType: request.recipients.length > 1 ? "group" : "oneOnOne",
      ...(request.recipients.length > 1 ? { topic: `Information request: ${request.target.label}` } : {}),
      members: [
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": graphUserBind(me.id || me.userPrincipalName)
        },
        ...request.recipients.map(recipient => ({
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": graphUserBind(recipient.userPrincipalName || recipient.email)
        }))
      ]
    }
  });
  const message = await graphRequest(accessToken, `/chats/${encodeURIComponent(chat.id)}/messages`, {
    method: "POST",
    body: {
      body: {
        contentType: "html",
        content: formatTeamsMessage(request, responseUrl)
      }
    }
  });

  return {
    chatId: chat.id,
    graphMessageId: message.id,
    webUrl: message.webUrl || ""
  };
}

async function sendTeamsChannelRequest(accessToken, request, responseUrl) {
  if (!request.provider.teamId || !request.provider.channelId) {
    throw graphError("Teams channel requests need a team and channel.", 422);
  }

  const message = await graphRequest(
    accessToken,
    `/teams/${encodeURIComponent(request.provider.teamId)}/channels/${encodeURIComponent(request.provider.channelId)}/messages`,
    {
      method: "POST",
      body: {
        body: {
          contentType: "html",
          content: formatTeamsMessage(request, responseUrl)
        }
      }
    }
  );

  return {
    graphMessageId: message.id,
    webUrl: message.webUrl || ""
  };
}

export function microsoftConfigurationStatus() {
  const missing = missingConfig();

  return {
    configured: missing.length === 0,
    missing
  };
}

export async function microsoftStatus(username) {
  const config = microsoftConfigurationStatus();

  if (!config.configured) {
    return {
      ...config,
      connected: false,
      account: null
    };
  }

  const client = await microsoftClient(username);
  const accounts = await client.getTokenCache().getAllAccounts();
  const account = accounts[0] || null;

  return {
    ...config,
    connected: Boolean(account),
    account: account ? {
      username: account.username,
      name: account.name || account.username
    } : null
  };
}

export async function createMicrosoftAuthUrl(username, origin) {
  assertMicrosoftConfigured();

  const state = crypto.randomBytes(24).toString("hex");
  const client = await microsoftClient(username);

  await fs.mkdir(MICROSOFT_STATE_DIR, { recursive: true });
  await fs.writeFile(statePath(state), `${JSON.stringify({
    username,
    createdAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");

  return client.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: configuredRedirectUri(origin),
    state
  });
}

export async function completeMicrosoftAuth({ code, state, origin }) {
  assertMicrosoftConfigured();

  let stateRecord;

  try {
    stateRecord = JSON.parse(await fs.readFile(statePath(state), "utf8"));
  } catch {
    throw graphError("Microsoft sign-in state is invalid or expired.", 400);
  } finally {
    await fs.rm(statePath(state), { force: true });
  }

  if ((Date.now() - Date.parse(stateRecord.createdAt || "")) > AUTH_STATE_TTL_MS) {
    throw graphError("Microsoft sign-in state has expired.", 400);
  }

  const client = await microsoftClient(stateRecord.username);
  const token = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: configuredRedirectUri(origin)
  });

  await saveMicrosoftClient(stateRecord.username, client);

  return {
    username: stateRecord.username,
    account: {
      username: token.account?.username || "",
      name: token.account?.name || token.account?.username || ""
    }
  };
}

export async function disconnectMicrosoft(username) {
  await fs.rm(tokenPath(username), { force: true });

  return microsoftStatus(username);
}

export async function sendInformationRequestViaMicrosoft(request, responseUrl, username) {
  const { accessToken } = await accessTokenForUser(username);
  const sentAt = new Date().toISOString();
  const provider = request.channel === "email"
    ? await sendEmailRequest(accessToken, request, responseUrl)
    : request.channel === "teams-chat"
      ? await sendTeamsChatRequest(accessToken, request, responseUrl)
      : await sendTeamsChannelRequest(accessToken, request, responseUrl);

  return {
    state: "sent",
    sentAt,
    error: "",
    provider
  };
}

export async function listMicrosoftTeams(username) {
  const { accessToken } = await accessTokenForUser(username);
  const teams = await graphRequest(accessToken, "/me/joinedTeams");

  return teams?.value || [];
}

export async function listMicrosoftChannels(username, teamId) {
  const { accessToken } = await accessTokenForUser(username);
  const channels = await graphRequest(accessToken, `/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,description`);

  return channels?.value || [];
}

