// Google Calendar integration — bridge Aegis reminder → event Google Calendar Hady.
// Hady auth 1x → refresh_token disimpan di vault (repo private) → bot pakai forever.

import { google } from "googleapis";
import { readJSON, writeJSON } from "./store.js";

const TOKEN_PATH = "07-SYSTEM/google-token.json";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const REDIRECT = "http://localhost";

const requireEnv = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum di-set di Railway.");
  }
};

const createOAuthClient = () => {
  requireEnv();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT
  );
};

export const generateAuthUrl = () => {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
};

export const exchangeCode = async (code) => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Tidak dapat refresh_token. Coba revoke dulu di myaccount.google.com → Security → Third-party, lalu /cal_auth ulang.");
  }
  await writeJSON(
    TOKEN_PATH,
    { refresh_token: tokens.refresh_token, saved_at: new Date().toISOString() },
    "google: save oauth refresh token"
  );
  return tokens.refresh_token;
};

const getAuthorizedClient = async () => {
  const stored = await readJSON(TOKEN_PATH, null);
  if (!stored?.refresh_token) {
    throw new Error("Belum auth Google Calendar. Ketik /cal_auth dulu.");
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: stored.refresh_token });
  return client;
};

export const createEvent = async ({ datetime_iso, event, source, durationMinutes = 30 }) => {
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: "v3", auth });
  const start = new Date(datetime_iso);
  if (isNaN(start.getTime())) throw new Error(`datetime_iso tidak valid: ${datetime_iso}`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event,
      description: source || event,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Jakarta" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Jakarta" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    },
  });
  return { id: res.data.id, htmlLink: res.data.htmlLink };
};

export const isConfigured = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return false;
    const stored = await readJSON(TOKEN_PATH, null);
    return !!stored?.refresh_token;
  } catch { return false; }
};
