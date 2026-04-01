import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplateById,
  getTemplateTheme,
} from "./card-templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, "prompts");

loadEnvFile(path.join(__dirname, ".env.local"));

const PORT = Number(process.env.PORT) || 3000;
const AI_PROVIDER = process.env.AI_PROVIDER || "deepseek";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const bodyLayoutOptions = ["minimal", "magazine", "grid"];
const fontFamilyOptions = [
  "noto",
  "pingfang",
  "songti",
  "kaiti",
  "fangsong",
  "yahei",
  "playfair",
  "cormorant",
];
const DOWNLOAD_TTL_MS = 10 * 60 * 1000;
const preparedDownloads = new Map();

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL." });
      return;
    }

    const requestUrl = new URL(
      request.url,
      `http://${request.headers.host || "localhost"}`
    );

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        provider: AI_PROVIDER,
        hasApiKey: Boolean(getProviderApiKey()),
        model: getProviderModel(),
      });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/ai/cover-copy"
    ) {
      const body = await readJsonBody(request);
      const result = await generateCoverCopy(body);
      sendJson(response, 200, result);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/ai/refine-layout"
    ) {
      const body = await readJsonBody(request);
      const result = await refineLayout(body);
      sendJson(response, 200, result);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/export/download"
    ) {
      const body = await readJsonBody(request);
      const result = await prepareDownload(body);
      sendJson(response, 200, result);
      return;
    }

    if (
      (request.method === "GET" || request.method === "HEAD") &&
      requestUrl.pathname.startsWith("/downloads/")
    ) {
      await servePreparedDownload(
        requestUrl.pathname,
        response,
        request.method
      );
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(requestUrl.pathname, response, request.method);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, {
      error: error.message || "Unexpected server error.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Digital Atelier server running at http://localhost:${PORT}`);
});

function loadEnvFile(envPath) {
  try {
    const fileContents = readFileSync(envPath, "utf8");
    for (const rawLine of fileContents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = stripWrappingQuotes(value);
      }
    }
  } catch {
    // Missing env file is fine.
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function getProviderApiKey() {
  if (AI_PROVIDER === "deepseek") {
    return DEEPSEEK_API_KEY;
  }

  return "";
}

function getProviderModel() {
  if (AI_PROVIDER === "deepseek") {
    return DEEPSEEK_MODEL;
  }

  return "";
}

async function refineLayout(input) {
  if (AI_PROVIDER === "deepseek") {
    return refineWithDeepSeek(input);
  }

  const error = new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
  error.statusCode = 500;
  throw error;
}

async function refineWithDeepSeek(input) {
  if (!DEEPSEEK_API_KEY) {
    const error = new Error("DEEPSEEK_API_KEY is missing on the server.");
    error.statusCode = 500;
    throw error;
  }

  const inputText = String(input?.inputText || "").trim();
  if (!inputText) {
    const error = new Error(
      "Please enter some content before asking AI to refine it."
    );
    error.statusCode = 400;
    throw error;
  }

  const template = getTemplateById(input?.templateId || DEFAULT_TEMPLATE_ID);
  const bodyLayout = bodyLayoutOptions.includes(input?.bodyLayout)
    ? input.bodyLayout
    : template.recommendedBodyLayout;
  const fontFamily = fontFamilyOptions.includes(input?.fontFamily)
    ? input.fontFamily
    : template.recommendedFontFamily;
  const fontSize = Number(input?.fontSize) || 24;

  const systemPrompt =
    "You are a Xiaohongshu editorial layout assistant. Rewrite the user's text into a cleaner, publishable Chinese post structure for paginated 3:4 image cards. Return JSON only with these keys: refined_text, body_layout, font_family, rationale. " +
    "Rules: refined_text should be plain text only, not Markdown lists or code fences. Use short title on the first paragraph when useful, then separate paragraphs with blank lines. Preserve the user's core meaning. Prefer elegant Chinese copy when the source is Chinese. Follow the selected template's visual temperament and writing tone closely. body_layout must be one of minimal, magazine, grid. font_family must be one of noto, pingfang, songti, kaiti, fangsong, yahei, playfair, cormorant. rationale should be under 80 Chinese characters.";

  const userPrompt = [
    "Please refine this workspace draft for Xiaohongshu pagination.",
    `Selected template ID: ${template.id}`,
    `Selected template name: ${template.name} / ${template.en}`,
    `Template direction: ${template.prompt}`,
    `Current body layout: ${bodyLayout}`,
    `Current font family: ${fontFamily}`,
    `Current font size: ${fontSize}px`,
    "",
    "Original content:",
    inputText,
  ].join("\n");

  const parsed = await requestDeepSeekJson([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  return {
    ok: true,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    templateId: template.id,
    refinedText: String(parsed.refined_text || inputText).trim(),
    bodyLayout: bodyLayoutOptions.includes(parsed.body_layout)
      ? parsed.body_layout
      : bodyLayout,
    fontFamily: fontFamilyOptions.includes(parsed.font_family)
      ? parsed.font_family
      : fontFamily,
    rationale: String(parsed.rationale || "").trim(),
  };
}

async function generateCoverCopy(input) {
  if (AI_PROVIDER === "deepseek") {
    return generateCoverCopyWithDeepSeek(input);
  }

  const error = new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
  error.statusCode = 500;
  throw error;
}

async function generateCoverCopyWithDeepSeek(input) {
  if (!DEEPSEEK_API_KEY) {
    const error = new Error("DEEPSEEK_API_KEY is missing on the server.");
    error.statusCode = 500;
    throw error;
  }

  const inputText = String(input?.inputText || "").trim();
  if (!inputText) {
    const error = new Error(
      "Please enter some content before generating cover copy."
    );
    error.statusCode = 400;
    throw error;
  }

  const [titlePrompt, highlightsPrompt] = await Promise.all([
    readPromptText(
      "cover-title.prompt.txt",
      "生成一个高点击、小红书风标题。不要直接摘抄原文。"
    ),
    readPromptText(
      "cover-highlights.prompt.txt",
      "生成2到5条封面要点，每条都简短可扫读。"
    ),
  ]);

  const systemPrompt =
    "You are an elite Xiaohongshu cover copywriter. Return JSON only with these keys: cover_title, cover_highlights. " +
    "cover_title must be a single string. cover_highlights must be an array containing 2 to 5 short strings. " +
    "Do not return Markdown, code fences, explanations, or extra keys.";

  const userPrompt = [
    "请根据下面的规则，为这篇内容生成封面标题和封面要点。",
    "",
    "[封面标题规则]",
    titlePrompt,
    "",
    "[封面要点规则]",
    highlightsPrompt,
    "",
    "[额外要求]",
    "- 保持输出语言与原文一致；原文主要是中文时输出中文。",
    "- cover_title 只能输出一个最终标题。",
    "- cover_highlights 输出 2 到 5 条最终结果。",
    "",
    "[原文内容]",
    inputText,
  ].join("\n");

  const parsed = await requestDeepSeekJson(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    1600
  );

  const coverTitle = sanitizeCoverTitle(parsed.cover_title);
  const coverHighlights = sanitizeCoverHighlights(parsed.cover_highlights);

  if (!coverTitle || coverHighlights.length < 2) {
    const error = new Error("AI returned incomplete cover copy.");
    error.statusCode = 502;
    throw error;
  }

  return {
    ok: true,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    coverTitle,
    coverHighlights,
    bodyTitle: coverTitle,
  };
}

async function requestDeepSeekJson(messages, maxTokens = 4000) {
  const deepseekResponse = await fetch(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: maxTokens,
        response_format: {
          type: "json_object",
        },
        messages,
      }),
    }
  );

  const rawResponse = await deepseekResponse.text();
  if (!deepseekResponse.ok) {
    let upstreamMessage = rawResponse;
    try {
      const parsedError = JSON.parse(rawResponse);
      upstreamMessage = parsedError?.error?.message || rawResponse;
    } catch {
      // Keep raw text when upstream body is not JSON.
    }

    const friendlyMessage =
      deepseekResponse.status === 401
        ? "DeepSeek API authentication failed. Please check or rotate DEEPSEEK_API_KEY."
        : `DeepSeek API error (${deepseekResponse.status}): ${upstreamMessage}`;

    const error = new Error(friendlyMessage);
    error.statusCode = 502;
    throw error;
  }

  const payload = JSON.parse(rawResponse);
  const messageContent = payload?.choices?.[0]?.message?.content || "";
  return parseJsonFromModelMessage(messageContent);
}

async function readPromptText(filename, fallback) {
  try {
    return await readFile(path.join(PROMPTS_DIR, filename), "utf8");
  } catch {
    return fallback;
  }
}

function sanitizeCoverTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’「」『』【】]+|[\s"'“”‘’「」『』【】]+$/g, "")
    .trim();
}

function sanitizeCoverHighlights(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n+/)
        .map((item) => item.trim())
        .filter(Boolean);

  return Array.from(
    new Set(
      items
        .map((item) =>
          String(item || "")
            .replace(/^[\s\-*•\d.、]+/, "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ).slice(0, 5);
}

function parseJsonFromModelMessage(content) {
  const cleaned = String(content || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    const error = new Error("Model returned a non-JSON response.");
    error.statusCode = 502;
    throw error;
  }
}

async function prepareDownload(input) {
  cleanupExpiredDownloads();

  const filename = sanitizeFilename(input?.filename);
  const mimeType = String(input?.mimeType || "application/octet-stream").trim();
  const base64Data = String(input?.data || "").trim();

  if (!filename) {
    const error = new Error("Export filename is missing.");
    error.statusCode = 400;
    throw error;
  }

  if (!base64Data) {
    const error = new Error("Export file data is missing.");
    error.statusCode = 400;
    throw error;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    const error = new Error("Export file data is not valid base64.");
    error.statusCode = 400;
    throw error;
  }

  if (!buffer.length) {
    const error = new Error("Export file is empty.");
    error.statusCode = 400;
    throw error;
  }

  const id = randomUUID();
  preparedDownloads.set(id, {
    buffer,
    filename,
    mimeType,
    expiresAt: Date.now() + DOWNLOAD_TTL_MS,
  });

  return {
    ok: true,
    url: `/downloads/${id}`,
    filename,
  };
}

async function servePreparedDownload(urlPathname, response, method = "GET") {
  cleanupExpiredDownloads();

  const id = decodeURIComponent(urlPathname.slice("/downloads/".length)).trim();
  const prepared = preparedDownloads.get(id);

  if (!prepared) {
    sendJson(response, 404, {
      error: "Download has expired or does not exist.",
    });
    return;
  }

  response.writeHead(200, {
    "Content-Type": prepared.mimeType,
    "Content-Length": prepared.buffer.length,
    "Content-Disposition": buildAttachmentHeader(prepared.filename),
    "Cache-Control": "no-store",
  });

  if (method === "HEAD") {
    response.end();
    return;
  }

  response.end(prepared.buffer);
  preparedDownloads.delete(id);
}

function sanitizeFilename(filename) {
  const cleaned = String(filename || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "";
}

function buildAttachmentHeader(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRFC5987ValueChars(filename)}`;
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function cleanupExpiredDownloads() {
  const now = Date.now();
  for (const [id, prepared] of preparedDownloads.entries()) {
    if (prepared.expiresAt <= now) {
      preparedDownloads.delete(id);
    }
  }
}

async function serveStatic(urlPathname, response, method = "GET") {
  const normalizedPath =
    urlPathname === "/"
      ? "/index.html"
      : urlPathname === "/favicon.ico"
        ? "/favicon.svg"
        : urlPathname;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(response, 404, { error: "File not found." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    let data = await readFile(filePath);

    if (normalizedPath === "/index.html") {
      const html = data
        .toString("utf8")
        .replace(
          "<!-- COVER_TEMPLATE_OPTIONS -->",
          renderCoverTemplateOptions()
        )
        .replace(
          "./script.js?v=20260401-cover-template-fix",
          "./script.js?v=20260401-cover-template-fix-2"
        );
      data = Buffer.from(html, "utf8");
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Cache-Control":
        extension === ".html" || extension === ".js" || extension === ".css"
          ? "no-store"
          : "public, max-age=300",
    });
    if (method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  } catch {
    sendJson(response, 404, { error: "File not found." });
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function renderCoverTemplateOptions() {
  return CARD_TEMPLATES.map((template) => {
    const theme = getTemplateTheme(template.id);
    const activeClass = template.id === DEFAULT_TEMPLATE_ID ? " is-active" : "";

    return `
      <button
        class="template-option${activeClass} flex w-full items-center gap-4 rounded-2xl border border-outline-variant/15 bg-white/90 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_28px_rgba(141,77,77,0.08)]"
        data-template-id="${escapeHtml(template.id)}"
        aria-pressed="${template.id === DEFAULT_TEMPLATE_ID ? "true" : "false"}"
        type="button"
      >
        <span
          class="template-option-thumb"
          style="--template-thumb-background: ${escapeHtml(theme.thumbBackground)}; --template-thumb-ink: ${escapeHtml(theme.thumbInk)};"
        >
          <span class="template-option-index">${String(template.index).padStart(2, "0")}</span>
          <span class="material-symbols-outlined template-option-icon">${escapeHtml(template.badgeIcon)}</span>
          <span class="template-option-label">${escapeHtml(template.shortLabel)}</span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold text-on-surface">${escapeHtml(template.name)}</span>
          <span class="mt-1 block text-[11px] leading-relaxed text-on-surface-variant">${escapeHtml(template.en)}</span>
        </span>
      </button>
    `;
  }).join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
