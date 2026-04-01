export function normalizeText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

export function isCjkText(text) {
  const cjkCount = countMatches(text, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(text, /[A-Za-z]/g);
  return cjkCount > 0 && cjkCount >= latinCount / 2;
}

export function isLikelyTitle(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || /\n/.test(trimmed)) {
    return false;
  }

  const cjk = isCjkText(trimmed);
  const maxLength = cjk ? 24 : 56;
  const sentencePunctuation = countMatches(trimmed, /[。！？.!?]/g);
  return trimmed.length <= maxLength && sentencePunctuation <= 1;
}

export function getFirstSentence(text) {
  if (!text) {
    return "";
  }

  const sentenceMatch = String(text).match(
    /^.*?[。！？.!?](?=\s|$|["'”」』）)])|^.+$/
  );
  return (sentenceMatch ? sentenceMatch[0] : text).trim();
}

export function clampText(text, maxLength) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    return "";
  }
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength).trim()}...`;
}

export function slugify(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "card"
  );
}

export function formatExportTimestamp(date = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}
