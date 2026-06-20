// Aegis Bot v0.1 — terima pesan Hady di Telegram, simpan ke vault GitHub
// Env vars wajib: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO

import { Telegraf } from "telegraf";
import { Octokit } from "@octokit/rest";

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
} = process.env;

for (const [k, v] of Object.entries({
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
})) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const gh = new Octokit({ auth: GITHUB_TOKEN });
const OWNER_ID = String(TELEGRAM_CHAT_ID);

// Jakarta time helper
const tsJakarta = () => {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}${parts.minute}${parts.second}`,
    iso: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} WIB`,
  };
};

const saveToInbox = async (text) => {
  const { date, time, iso } = tsJakarta();
  const path = `00-INBOX/${date}-${time}.md`;
  const body = `---\ncreated: ${iso}\nsource: telegram\n---\n\n${text}\n`;
  const content = Buffer.from(body, "utf-8").toString("base64");
  await gh.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message: `inbox: ${date}-${time}`,
    content,
    branch: GITHUB_BRANCH,
  });
  return path;
};

// Reject siapa pun yang bukan Hady
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== OWNER_ID) {
    console.warn(`Blocked unauthorized user: ${ctx.from?.id} (${ctx.from?.username})`);
    return;
  }
  return next();
});

bot.start((ctx) => ctx.reply("✅ Aegis aktif. Kirim pesan apa pun — saya catat ke vault."));

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.on("text", async (ctx) => {
  try {
    const path = await saveToInbox(ctx.message.text);
    await ctx.reply(`✅ Tercatat → ${path}`);
  } catch (err) {
    console.error("saveToInbox error:", err.message);
    await ctx.reply(`❌ Gagal simpan: ${err.message}`);
  }
});

bot.catch((err) => console.error("Bot error:", err));

bot.launch().then(() => console.log("Aegis bot running"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
