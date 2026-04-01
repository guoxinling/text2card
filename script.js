import {
  CARD_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplateById,
  getTemplateTheme,
} from "./card-templates.js?v=20260401-cover-template-fix-2";

const MAX_PAGE_GUARD = 48;
const COVER_COPY_DEBOUNCE_MS = 900;

const sizePerPage = {
  jpeg: 0.8,
  png: 1.35,
  pdf: 2.4,
};

const sizePresetFactors = {
  "3:4": 1,
  "1:1": 0.92,
  "9:16": 1.16,
};

const sizePresetRatios = {
  "3:4": "3 / 4",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

const exportDimensions = {
  "3:4": { width: 1242, height: 1656 },
  "1:1": { width: 1242, height: 1242 },
  "9:16": { width: 1080, height: 1920 },
};

const exportMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
};

const exportFileExtensions = {
  jpeg: "jpg",
  png: "png",
};

const bodyLayoutLabels = {
  minimal: "Minimalist Focus",
  magazine: "Magazine Split",
  grid: "Double Grid",
};

const state = {
  activeView: "workspace",
  previewMode: "cover",
  templateId: DEFAULT_TEMPLATE_ID,
  bodyLayout: getTemplateById(DEFAULT_TEMPLATE_ID).recommendedBodyLayout,
  fontFamily: getTemplateById(DEFAULT_TEMPLATE_ID).recommendedFontFamily,
  fontSize: 24,
  currentBodyPage: 0,
  aiProvider: "deepseek",
  isRefining: false,
  coverCopy: null,
  coverCopyKey: "",
  exportFormat: "jpeg",
  exportSizePreset: "3:4",
  selectedExportCardIds: new Set(),
  isExporting: false,
  exportProgressLabel: "",
};

const fontFamilies = {
  noto: `"Noto Serif", "Songti SC", serif`,
  pingfang: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`,
  songti: `"Songti SC", "STSong", "SimSun", serif`,
  kaiti: `"Kaiti SC", "STKaiti", "KaiTi", serif`,
  fangsong: `"STFangsong", "FangSong", serif`,
  yahei: `"Microsoft YaHei", "PingFang SC", sans-serif`,
  playfair: `"Playfair Display", "Times New Roman", serif`,
  cormorant: `"Cormorant Garamond", "Times New Roman", serif`,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  homeButton: $('button[data-app-view="workspace"]:not(.app-nav-link)'),
  appViewButtons: $$(".app-nav-link"),
  workspaceView: $("#workspaceView"),
  exportView: $("#exportView"),
  editorInput: $("#editorInput"),
  fontFamilySelect: $("#fontFamilySelect"),
  fontSizeRange: $("#fontSizeRange"),
  fontSizeValue: $("#fontSizeValue"),
  coverPreviewCard: $("#coverPreviewCard"),
  coverBadge: $("#coverBadge"),
  coverBadgeIcon: $("#coverBadgeIcon"),
  coverTemplateList: $("#coverTemplateList"),
  bodyPreviewPanel: $("#bodyPreviewPanel"),
  bodyPreviewCard: $("#bodyPreviewCard"),
  bodyPageIndicator: $("#bodyPageIndicator"),
  bodyPrevPageButton: $("#bodyPrevPageButton"),
  bodyNextPageButton: $("#bodyNextPageButton"),
  coverTitle: $("#coverTitle"),
  coverHighlights: $("#coverHighlights"),
  coverFooterLabel: $("#coverFooterLabel"),
  refineButton: $("#refineButton"),
  refineButtonLabel: $("#refineButtonLabel"),
  toast: $("#toast"),
  exportToast: $("#exportToast"),
  exportCardGrid: $("#exportCardGrid"),
  layoutPresetLabel: $("#layoutPresetLabel"),
  selectedCountLabel: $("#selectedCountLabel"),
  estimatedSizeLabel: $("#estimatedSizeLabel"),
  downloadButton: $("#downloadButton"),
  sizePresetSelect: $("#sizePresetSelect"),
  shareButton: $("#shareButton"),
  moreButton: $("#moreButton"),
};

const wordSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh-Hans", { granularity: "word" })
    : null;

let paginationMeasure = null;
let lastParsed = null;
let lastBodyPages = [];
let lastExportCards = [];
let exportRenderStage = null;
const coverCopyCache = new Map();
let coverCopyDebounceTimer = 0;
let coverCopyRequestToken = 0;
let didShowCoverCopyFailureToast = false;

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readInputText() {
  return normalizeText(elements.editorInput.value);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function isCjkText(text) {
  const cjkCount = countMatches(text, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(text, /[A-Za-z]/g);
  return cjkCount > 0 && cjkCount >= latinCount / 2;
}

function isLikelyTitle(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || /\n/.test(trimmed)) {
    return false;
  }

  const cjk = isCjkText(trimmed);
  const maxLength = cjk ? 24 : 56;
  const sentencePunctuation = countMatches(trimmed, /[。！？.!?]/g);
  return trimmed.length <= maxLength && sentencePunctuation <= 1;
}

function getFirstSentence(text) {
  if (!text) {
    return "";
  }

  const sentenceMatch = String(text).match(
    /^.*?[。！？.!?](?=\s|$|["'”」』）)])|^.+$/
  );
  return (sentenceMatch ? sentenceMatch[0] : text).trim();
}

function clampText(text, maxLength) {
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

function slugify(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "card"
  );
}

function formatExportTimestamp(date = new Date()) {
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

function getSelectedExportCards() {
  return lastExportCards.filter((card) =>
    state.selectedExportCardIds.has(card.id)
  );
}

function getExportPresetDimensions() {
  return exportDimensions[state.exportSizePreset] || exportDimensions["3:4"];
}

function getExportMimeType() {
  return exportMimeTypes[state.exportFormat] || exportMimeTypes.png;
}

function getExportFileExtension() {
  return exportFileExtensions[state.exportFormat] || exportFileExtensions.png;
}

function getExportAssetBasename(card, index) {
  const pageLabel = String(index + 1).padStart(2, "0");
  const pageKind = card.type === "cover" ? "cover" : "content";
  return `text2card-${slugify(state.templateId)}-${pageLabel}-${pageKind}`;
}

function getExportArchiveName(selectedCards) {
  return `text2card-${slugify(state.templateId)}-${selectedCards.length}pages-${formatExportTimestamp()}.zip`;
}

function getExportSourceCard(cardId) {
  return elements.exportCardGrid.querySelector(
    `[data-export-preview-id="${cardId}"] .preview-card`
  );
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function ensureExportRuntime() {
  if (!window.htmlToImage || !window.fflate) {
    throw new Error(
      "Export runtime is unavailable. Please refresh and try again."
    );
  }
}

function getExportRenderStage() {
  if (exportRenderStage) {
    return exportRenderStage;
  }

  exportRenderStage = document.createElement("div");
  exportRenderStage.setAttribute("aria-hidden", "true");
  Object.assign(exportRenderStage.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "0",
    height: "0",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(exportRenderStage);
  return exportRenderStage;
}

function createExportSnapshotNode(sourceCard, dimensions) {
  const rect = sourceCard.getBoundingClientRect();
  const sourceWidth = Math.max(rect.width, 1);
  const sourceHeight = Math.max(rect.height, 1);
  const scale = Math.min(
    dimensions.width / sourceWidth,
    dimensions.height / sourceHeight
  );
  const computedStyle = window.getComputedStyle(sourceCard);

  const frame = document.createElement("div");
  frame.className = "export-snapshot-frame";
  frame.style.width = `${dimensions.width}px`;
  frame.style.height = `${dimensions.height}px`;
  frame.style.borderRadius = "0";
  frame.style.background = computedStyle.background;

  const clone = sourceCard.cloneNode(true);
  clone.style.width = `${sourceWidth}px`;
  clone.style.height = `${sourceHeight}px`;
  clone.style.maxWidth = "none";
  clone.style.borderRadius = "0";
  clone.style.border = "0";
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
  clone.style.opacity = "1";
  clone.style.backgroundClip = "border-box";
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.transformOrigin = "top left";
  clone.style.transform = `scale(${scale})`;

  if (clone.classList.contains("preview-card-cover")) {
    const beforeStyle = window.getComputedStyle(sourceCard, "::before");
    if (
      beforeStyle.background &&
      beforeStyle.background !== "none" &&
      beforeStyle.background !==
        "rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box"
    ) {
      clone.dataset.exportSnapshot = "cover";
      frame.style.background = beforeStyle.background;
      clone.style.background = beforeStyle.background;
    }
  }

  frame.appendChild(clone);
  return frame;
}

async function renderCardToBlob(card, index) {
  const sourceCard = getExportSourceCard(card.id);
  if (!sourceCard) {
    throw new Error("Could not find the selected export card.");
  }

  const stage = getExportRenderStage();
  const dimensions = getExportPresetDimensions();
  const snapshotNode = createExportSnapshotNode(sourceCard, dimensions);
  stage.replaceChildren(snapshotNode);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await waitForNextFrame();

    const renderOptions = {
      cacheBust: true,
      pixelRatio: 2,
      width: dimensions.width,
      height: dimensions.height,
      canvasWidth: dimensions.width,
      canvasHeight: dimensions.height,
      backgroundColor:
        state.exportFormat === "jpeg" ? "#ffffff" : "rgba(255,255,255,0)",
      quality: state.exportFormat === "jpeg" ? 0.96 : 1,
    };

    const blob =
      state.exportFormat === "jpeg"
        ? await dataUrlToBlob(
            await window.htmlToImage.toJpeg(snapshotNode, renderOptions)
          )
        : await window.htmlToImage.toBlob(snapshotNode, {
            ...renderOptions,
            type: getExportMimeType(),
          });

    if (!blob) {
      throw new Error("Failed to render the selected card.");
    }

    return {
      blob,
      filename: `${getExportAssetBasename(card, index)}.${getExportFileExtension()}`,
    };
  } finally {
    stage.replaceChildren();
  }
}

async function blobToUint8Array(blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function prepareSaveTarget(filename, mimeType) {
  return {
    kind: "server",
    filename,
    mimeType,
  };
}

async function saveBlobToTarget(target, blob, filename) {
  if (target.kind === "server") {
    const downloadUrl = await requestServerDownloadUrl(
      blob,
      filename || target.filename,
      target.mimeType || blob.type || "application/octet-stream"
    );
    triggerServerDownload(downloadUrl, filename || target.filename);
    return;
  }

  if (target.kind === "download") {
    downloadBlob(blob, filename);
  }
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error("Failed to encode export file."));
    };
    reader.readAsDataURL(blob);
  });
}

async function requestServerDownloadUrl(blob, filename, mimeType) {
  const response = await fetch("/api/export/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      mimeType,
      data: await blobToBase64(blob),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.url) {
    throw new Error(payload.error || "Failed to prepare the download file.");
  }

  return payload.url;
}

function triggerServerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function createArchiveBlob(files) {
  const archiveEntries = {};
  for (const file of files) {
    archiveEntries[file.filename] = [await blobToUint8Array(file.blob)];
  }

  const archiveBytes = window.fflate.zipSync(archiveEntries, { level: 6 });
  return new Blob([archiveBytes], { type: "application/zip" });
}

function buildTitle(source, cjk) {
  const clean = String(source || "")
    .replace(/^#+\s*/, "")
    .replace(/[“”"'「」『』]/g, "")
    .replace(/[。！？.!?]+$/g, "")
    .trim();

  if (!clean) {
    return cjk
      ? "在数字工坊里编排一篇图文"
      : "The Art of Light: Finding Stillness in Chaos";
  }

  const firstClause = clean
    .split(/[，,：:；;]/)
    .map((item) => item.trim())
    .find(Boolean);

  return clampText(firstClause || clean, cjk ? 18 : 42);
}

function sanitizeCoverTitleText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’「」『』【】]+|[\s"'“”‘’「」『』【】]+$/g, "")
    .trim();
}

function sanitizeCoverHighlightItem(text, cjk) {
  const clean = String(text || "")
    .replace(/^[\s\-*•\d.、]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "";
  }

  if (clean.length > (cjk ? 12 : 32)) {
    return "";
  }

  return clean;
}

function sanitizeCoverHighlights(items, cjk) {
  if (!Array.isArray(items)) {
    return [];
  }

  const deduped = [];
  const seen = new Set();

  for (const item of items) {
    const clean = sanitizeCoverHighlightItem(item, cjk);
    if (!clean) {
      continue;
    }

    const key = clean.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(clean);

    if (deduped.length >= 5) {
      break;
    }
  }

  return deduped;
}

function getDefaultCoverHighlights(cjk) {
  return cjk
    ? ["提炼核心主题", "封面卖点更清晰", "正文标题自动同步"]
    : ["Sharper core angle", "Scannable cover hooks", "Synced body title"];
}

function buildSemanticHighlights(text, cjk) {
  if (!cjk) {
    return [];
  }

  const source = String(text || "");
  const candidates = [];

  const highlightRules = [
    [/心流|专注/, "进入心流状态"],
    [/效率|高效|更快|提速/, "提升编码效率"],
    [/中断|打断|干扰/, "减少中断干扰"],
    [/反馈|循环|迭代/, "反馈闭环更快"],
    [/产出|交付|输出/, "持续稳定产出"],
    [/思考|实现|落地/, "连接思考实现"],
    [/质量|准确|稳定/, "提升结果质量"],
  ];

  for (const [pattern, label] of highlightRules) {
    if (pattern.test(source)) {
      candidates.push(label);
    }
  }

  return sanitizeCoverHighlights(candidates, cjk);
}

function extractPrimaryTopic(source, cjk) {
  const clean = String(source || "")
    .replace(/^#+\s*/, "")
    .replace(/[“”"'「」『』【】（）()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "";
  }

  const englishTerm = clean.match(/[A-Za-z][A-Za-z0-9+._ -]{2,}/)?.[0]?.trim();
  if (englishTerm) {
    return englishTerm.replace(/\s+/g, " ");
  }

  const firstClause = clean
    .split(/[，,：:；;。！？.!?]/)
    .map((item) => item.trim())
    .find(Boolean);

  if (!cjk) {
    return firstClause || clean;
  }

  const normalized = String(firstClause || clean).replace(
    /^(一种|这套|这个|如何|关于|有关)/,
    ""
  );
  return normalized.slice(0, Math.min(6, normalized.length)).trim();
}

function buildFallbackCoverTitle(source, cjk) {
  if (!cjk) {
    return buildTitle(source, false);
  }

  const topic = extractPrimaryTopic(source, true);
  if (!topic) {
    return "这套方法让效率翻倍";
  }

  if (/[A-Za-z]/.test(topic) && topic.length <= 14) {
    return `用${topic}进入心流`;
  }

  if (topic.length <= 6) {
    return `用${topic}提升效率`;
  }

  if (topic.length <= 10) {
    return `${topic}这样做更高效`;
  }

  return "这套方法让效率翻倍";
}

function buildFallbackHighlights(paragraphs, cjk) {
  const semanticHighlights = buildSemanticHighlights(
    paragraphs.join("\n"),
    cjk
  );
  if (semanticHighlights.length >= 2) {
    return semanticHighlights.slice(0, 4);
  }

  const candidates = [];

  for (const paragraph of paragraphs.slice(0, 3)) {
    const clauses = String(paragraph || "")
      .replace(/[“”"'「」『』]/g, "")
      .split(/[。！？.!?\n]|[，,：:；;]/)
      .map((item) => sanitizeCoverHighlightItem(item, cjk))
      .filter(Boolean);

    for (const clause of clauses) {
      if (clause.length < (cjk ? 4 : 6)) {
        continue;
      }
      candidates.push(clause);
    }
  }

  const highlights = sanitizeCoverHighlights(candidates, cjk).slice(0, 4);
  return highlights.length >= 2 ? highlights : getDefaultCoverHighlights(cjk);
}

function buildFallbackCoverCopy({ titleSource, paragraphs, cjk }) {
  return {
    coverTitle: buildFallbackCoverTitle(titleSource, cjk),
    coverHighlights: buildFallbackHighlights(paragraphs, cjk),
  };
}

function renderCoverHighlights(highlights) {
  const safeHighlights = Array.isArray(highlights) ? highlights : [];
  elements.coverHighlights.replaceChildren(
    ...safeHighlights.map((highlight) => {
      const item = document.createElement("div");
      item.className = "cover-highlight-item";

      const dot = document.createElement("span");
      dot.className = "cover-highlight-dot";

      const text = document.createElement("span");
      text.textContent = highlight;

      item.append(dot, text);
      return item;
    })
  );
}

function isQuoteParagraph(text, index) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return false;
  }

  if (/^[“"'「『]/.test(trimmed) || /[”"'」』]$/.test(trimmed)) {
    return true;
  }

  return index === 1 && trimmed.length <= (isCjkText(trimmed) ? 48 : 120);
}

function getFallbackParagraphs(cjk) {
  return cjk
    ? [
        "清晨的光落在屏幕与纸张之间，排版开始有了呼吸。我们让每一段文字都停在恰当的位置，让阅读节奏自然发生。",
        "好的图文不是把所有内容塞进一张长图，而是让每一页都只承载刚刚好的信息密度。",
      ]
    : [
        "There is a specific kind of silence that only exists in the early hours of a sun-drenched atelier. It is the moment before the first brushstroke, where the air holds the weight of all possible creations.",
        '"Creativity is bringing our internal landscapes into the soft glow of the physical world."',
      ];
}

function parseEditorText(text) {
  const normalized = normalizeText(text);
  const rawParagraphs = normalized
    ? normalized
        .split(/\n\s*\n/)
        .map((item) => item.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean)
    : [];

  const cjk = isCjkText(normalized);
  const paragraphs = [...rawParagraphs];
  let explicitTitle = "";

  if (paragraphs.length > 1 && isLikelyTitle(paragraphs[0])) {
    explicitTitle = paragraphs.shift();
  }

  const workingParagraphs = paragraphs.length
    ? paragraphs
    : getFallbackParagraphs(cjk);
  const titleSource =
    explicitTitle ||
    getFirstSentence(workingParagraphs[0]) ||
    workingParagraphs[0] ||
    "";
  const bodySegments = workingParagraphs.map((paragraph, index) => ({
    type: isQuoteParagraph(paragraph, index) ? "quote" : "paragraph",
    text: paragraph,
    sourceIndex: index,
    isContinuation: false,
  }));

  const fallbackCoverCopy = buildFallbackCoverCopy({
    titleSource,
    paragraphs: workingParagraphs,
    cjk,
  });
  const activeCoverCopy =
    state.coverCopyKey === normalized ? state.coverCopy : null;
  const coverTitle =
    sanitizeCoverTitleText(activeCoverCopy?.coverTitle) ||
    fallbackCoverCopy.coverTitle;
  const coverHighlights = sanitizeCoverHighlights(
    activeCoverCopy?.coverHighlights,
    cjk
  );

  return {
    coverTitle,
    coverHighlights:
      coverHighlights.length >= 2
        ? coverHighlights
        : fallbackCoverCopy.coverHighlights,
    bodyTitle: coverTitle,
    bodySegments,
    isCjk: cjk,
  };
}

function getActiveFontFamily() {
  return fontFamilies[state.fontFamily] || fontFamilies.noto;
}

function getBodyTextSize() {
  return Math.max(state.fontSize - 8, 15);
}

function getBodyTitleSize() {
  return Math.max(state.fontSize - 4, 22);
}

function getActiveTemplate() {
  return getTemplateById(state.templateId);
}

function parseColor(color) {
  const value = String(color || "").trim();
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      r: Number.parseInt(hex[1].slice(0, 2), 16),
      g: Number.parseInt(hex[1].slice(2, 4), 16),
      b: Number.parseInt(hex[1].slice(4, 6), 16),
    };
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
    };
  }

  return null;
}

function getColorBrightness(color) {
  const parsed = parseColor(color);
  if (!parsed) {
    return 128;
  }

  return parsed.r * 0.299 + parsed.g * 0.587 + parsed.b * 0.114;
}

function getBodyTheme(template) {
  const theme = getTemplateTheme(template.id);
  const darkSurface = getColorBrightness(theme.titleColor) > 175;

  return {
    background: darkSurface
      ? `linear-gradient(180deg, rgba(8, 10, 16, 0.8), rgba(8, 10, 16, 0.74)), ${theme.thumbBackground}`
      : `linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.7)), ${theme.thumbBackground}`,
    borderColor: darkSurface
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(141, 77, 77, 0.12)",
    patternColor: darkSurface
      ? "rgba(255, 255, 255, 0.38)"
      : "rgba(141, 77, 77, 0.3)",
    patternOpacity: darkSurface ? "0.08" : "0.045",
    headerBorderColor: darkSurface
      ? "rgba(255, 255, 255, 0.12)"
      : "rgba(141, 77, 77, 0.14)",
    titleColor: theme.titleColor,
    textColor: theme.summaryColor,
    metaColor: theme.footerColor,
    quoteColor: theme.footerColor,
    quoteBorderColor: theme.badgeColor,
    footerColor: darkSurface
      ? "rgba(255, 255, 255, 0.56)"
      : "rgba(95, 95, 95, 0.52)",
    dropcapColor: theme.badgeColor,
    footerLabel: template.shortLabel,
    metaLabel: template.shortLabel,
  };
}

function applyTemplateThemeToCard(card, template) {
  const theme = getTemplateTheme(template.id);
  card.style.setProperty("--cover-background", theme.coverBackground);
  card.style.setProperty("--cover-thumb-background", theme.thumbBackground);
  card.style.setProperty("--cover-thumb-ink", theme.thumbInk);
}

function applyBodyThemeToCard(card, template) {
  const bodyTheme = getBodyTheme(template);
  card.style.setProperty("--body-background", bodyTheme.background);
  card.style.setProperty("--body-border-color", bodyTheme.borderColor);
  card.style.setProperty("--body-pattern-color", bodyTheme.patternColor);
  card.style.setProperty("--body-pattern-opacity", bodyTheme.patternOpacity);
  card.style.setProperty(
    "--body-header-border-color",
    bodyTheme.headerBorderColor
  );
  card.style.setProperty("--body-title-color", bodyTheme.titleColor);
  card.style.setProperty("--body-text-color", bodyTheme.textColor);
  card.style.setProperty("--body-meta-color", bodyTheme.metaColor);
  card.style.setProperty("--body-quote-color", bodyTheme.quoteColor);
  card.style.setProperty(
    "--body-quote-border-color",
    bodyTheme.quoteBorderColor
  );
  card.style.setProperty("--body-footer-color", bodyTheme.footerColor);
  card.style.setProperty("--body-dropcap-color", bodyTheme.dropcapColor);
  card.dataset.bodyTone =
    getColorBrightness(bodyTheme.titleColor) > 175 ? "dark" : "light";
}

function createTemplateOptionButton(template) {
  const theme = getTemplateTheme(template.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "template-option flex w-full items-center gap-4 rounded-2xl border border-outline-variant/15 bg-white/90 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_28px_rgba(141,77,77,0.08)]";
  button.dataset.templateId = template.id;

  const thumb = document.createElement("span");
  thumb.className = "template-option-thumb";
  thumb.style.setProperty("--template-thumb-background", theme.thumbBackground);
  thumb.style.setProperty("--template-thumb-ink", theme.thumbInk);

  const index = document.createElement("span");
  index.className = "template-option-index";
  index.textContent = String(template.index).padStart(2, "0");

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined template-option-icon";
  icon.textContent = template.badgeIcon;

  const shortLabel = document.createElement("span");
  shortLabel.className = "template-option-label";
  shortLabel.textContent = template.shortLabel;

  thumb.append(index, icon, shortLabel);

  const copy = document.createElement("span");
  copy.className = "min-w-0 flex-1";

  const name = document.createElement("span");
  name.className = "block text-sm font-semibold text-on-surface";
  name.textContent = template.name;

  const subtitle = document.createElement("span");
  subtitle.className =
    "mt-1 block text-[11px] leading-relaxed text-on-surface-variant";
  subtitle.textContent = template.en;

  copy.append(name, subtitle);
  button.append(thumb, copy);
  return button;
}

function syncTemplatePickerSelection() {
  elements.coverTemplateList
    .querySelectorAll("[data-template-id]")
    .forEach((button) => {
      const active = button.dataset.templateId === state.templateId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

function renderTemplatePicker() {
  if (!elements.coverTemplateList) {
    return;
  }

  const existingButtons =
    elements.coverTemplateList.querySelectorAll("[data-template-id]");

  if (existingButtons.length !== CARD_TEMPLATES.length) {
    const currentScrollTop = elements.coverTemplateList.scrollTop;
    elements.coverTemplateList.replaceChildren(
      ...CARD_TEMPLATES.map((template) => createTemplateOptionButton(template))
    );
    syncTemplatePickerSelection();
    elements.coverTemplateList.scrollTop = currentScrollTop;
    return;
  }

  syncTemplatePickerSelection();
}

function applyCoverPreviewTemplate(template) {
  const theme = getTemplateTheme(template.id);
  applyTemplateThemeToCard(elements.coverPreviewCard, template);
  elements.coverBadge.style.background = theme.badgeBackground;
  elements.coverBadgeIcon.style.color = theme.badgeColor;
  elements.coverBadgeIcon.textContent = template.badgeIcon;
  elements.coverTitle.style.color = theme.titleColor;
  elements.coverHighlights.style.color = theme.summaryColor;
  elements.coverFooterLabel.style.color = theme.footerColor;
  elements.coverFooterLabel.textContent = template.shortLabel;
}

function applyTemplateSelection(templateId, { showFeedback = false } = {}) {
  const template = getTemplateById(templateId);
  state.templateId = template.id;
  state.bodyLayout = template.recommendedBodyLayout;
  state.fontFamily = template.recommendedFontFamily;
  state.currentBodyPage = 0;

  if (lastParsed) {
    renderDocument(lastParsed);
  } else {
    rerenderFromInput({ resetPage: true });
  }

  if (showFeedback) {
    showToast(`已应用模板：${template.name}`);
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("floating-toast-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("floating-toast-visible");
  }, 2200);
}

function showExportToast(message) {
  elements.exportToast.textContent = message;
  elements.exportToast.classList.add("floating-toast-visible");
  window.clearTimeout(showExportToast.timer);
  showExportToast.timer = window.setTimeout(() => {
    elements.exportToast.classList.remove("floating-toast-visible");
  }, 2200);
}

function setRefineButtonLoading(isLoading) {
  state.isRefining = isLoading;
  if (!elements.refineButton) {
    return;
  }

  elements.refineButton.disabled = isLoading;
  elements.refineButton.classList.toggle("opacity-70", isLoading);
  elements.refineButton.classList.toggle("cursor-wait", isLoading);
  elements.refineButtonLabel.textContent = isLoading
    ? "Refining With DeepSeek..."
    : "AI Refine Layout";
}

function ensureMeasurementLayer() {
  if (paginationMeasure) {
    return paginationMeasure;
  }

  const container = document.createElement("div");
  container.className = "body-pagination-measure";
  container.innerHTML = `
    <article class="preview-card preview-card-body rounded-xl bg-white p-8 sm:p-10">
      <header class="preview-page-header">
        <div class="preview-page-meta">
          <span class="material-symbols-outlined text-xs">format_quote</span>
          <span class="preview-page-meta-label">Chapter I</span>
        </div>
        <h3 class="preview-page-title"></h3>
      </header>
      <article class="preview-page-article"></article>
      <footer class="preview-page-footer">
        <span class="preview-page-footer-label">Lumiere Publication</span>
        <span class="preview-page-footer-number"></span>
      </footer>
    </article>
  `;

  document.body.appendChild(container);

  paginationMeasure = {
    container,
    card: container.querySelector(".preview-card-body"),
    title: container.querySelector(".preview-page-title"),
    article: container.querySelector(".preview-page-article"),
    pageNumber: container.querySelector(".preview-page-footer-number"),
  };

  return paginationMeasure;
}

function getPreviewCardWidth() {
  const candidateWidths = [
    elements.bodyPreviewCard?.clientWidth,
    elements.coverPreviewCard?.clientWidth,
    elements.bodyPreviewPanel?.clientWidth,
    elements.coverPreviewCard?.parentElement?.clientWidth,
  ].filter(Boolean);

  const width = candidateWidths[0] || 340;
  return Math.max(Math.min(width, 360), 280);
}

function applyBodyCardStyles(card, parsed) {
  const fontFamily = getActiveFontFamily();
  const activeTemplate = getActiveTemplate();
  card.dataset.bodyLayout = state.bodyLayout;
  card.dataset.script = parsed.isCjk ? "cjk" : "latin";
  card.style.fontFamily = fontFamily;
  card.style.fontSize = `${getBodyTextSize()}px`;
  applyBodyThemeToCard(card, activeTemplate);
}

function syncMeasurementStyles(parsed) {
  const measure = ensureMeasurementLayer();
  const width = getPreviewCardWidth();

  applyBodyCardStyles(measure.card, parsed);
  measure.card.style.width = `${width}px`;
  measure.card.style.height = `${Math.round((width * 4) / 3)}px`;
  measure.title.textContent = parsed.bodyTitle;
  measure.title.style.fontFamily = getActiveFontFamily();
  measure.title.style.fontSize = `${getBodyTitleSize()}px`;
  measure.pageNumber.textContent = "Page 1";
  return measure;
}

function createFragmentNode(fragment) {
  const element = document.createElement(
    fragment.type === "quote" ? "blockquote" : "p"
  );
  element.className = `preview-page-block ${
    fragment.type === "quote" ? "preview-page-quote" : "preview-page-paragraph"
  }`;

  if (
    fragment.type === "paragraph" &&
    fragment.sourceIndex === 0 &&
    !fragment.isContinuation
  ) {
    element.classList.add("body-paragraph-lead", "preview-page-paragraph-lead");
  }

  element.textContent = fragment.text;
  return element;
}

function fillMeasureArticle(fragments) {
  const measure = ensureMeasurementLayer();
  measure.article.replaceChildren();
  fragments.forEach((fragment) => {
    measure.article.appendChild(createFragmentNode(fragment));
  });
}

function articleOverflows() {
  const measure = ensureMeasurementLayer();
  return measure.article.scrollHeight > measure.article.clientHeight + 1;
}

function getTextUnits(text) {
  if (!text) {
    return [];
  }

  if (wordSegmenter) {
    const segments = Array.from(
      wordSegmenter.segment(text),
      ({ segment }) => segment
    );
    if (segments.length) {
      return segments;
    }
  }

  return Array.from(text);
}

function trimFragmentText(text, edge) {
  if (edge === "start") {
    return text.replace(/^\s+/, "");
  }

  if (edge === "end") {
    return text.replace(/\s+$/, "");
  }

  return text;
}

function splitFragmentToFit(segment, acceptedFragments) {
  const units = getTextUnits(segment.text);
  let low = 1;
  let high = units.length;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidateText = trimFragmentText(
      units.slice(0, middle).join(""),
      "end"
    );
    if (!candidateText) {
      low = middle + 1;
      continue;
    }

    fillMeasureArticle([
      ...acceptedFragments,
      { ...segment, text: candidateText },
    ]);
    if (articleOverflows()) {
      high = middle - 1;
    } else {
      best = middle;
      low = middle + 1;
    }
  }

  if (!best) {
    best = Math.min(1, units.length);
  }

  return {
    headText: trimFragmentText(units.slice(0, best).join(""), "end"),
    tailText: trimFragmentText(units.slice(best).join(""), "start"),
  };
}

function paginateBodyContent(parsed) {
  const remaining = parsed.bodySegments.map((segment) => ({ ...segment }));
  const pages = [];
  syncMeasurementStyles(parsed);

  while (remaining.length && pages.length < MAX_PAGE_GUARD) {
    const pageFragments = [];
    fillMeasureArticle([]);

    while (remaining.length) {
      const current = {
        ...remaining[0],
        isContinuation: Boolean(remaining[0].isContinuation),
      };

      const candidateFragments = [...pageFragments, current];
      fillMeasureArticle(candidateFragments);

      if (!articleOverflows()) {
        pageFragments.push(current);
        remaining.shift();
        continue;
      }

      fillMeasureArticle(pageFragments);
      const { headText, tailText } = splitFragmentToFit(current, pageFragments);

      if (headText) {
        pageFragments.push({
          ...current,
          text: headText,
        });
      }

      if (tailText) {
        remaining[0] = {
          ...remaining[0],
          text: tailText,
          isContinuation: true,
        };
      } else {
        remaining.shift();
      }

      break;
    }

    if (!pageFragments.length) {
      const fallback = remaining.shift();
      if (!fallback) {
        break;
      }
      pageFragments.push({ ...fallback });
    }

    pages.push(pageFragments);
  }

  return pages.length ? pages : [[...parsed.bodySegments]];
}

function renderPageInto(card, parsed, fragments, pageNumber, totalPages) {
  const activeTemplate = getActiveTemplate();
  const bodyTheme = getBodyTheme(activeTemplate);
  applyBodyCardStyles(card, parsed);
  card.replaceChildren();

  const header = document.createElement("header");
  header.className = "preview-page-header";

  const meta = document.createElement("div");
  meta.className = "preview-page-meta";
  meta.innerHTML = `
    <span class="material-symbols-outlined text-xs">format_quote</span>
    <span class="preview-page-meta-label">${escapeHtml(bodyTheme.metaLabel)}</span>
  `;

  const title = document.createElement("h3");
  title.className = "preview-page-title";
  title.style.fontFamily = getActiveFontFamily();
  title.style.fontSize = `${getBodyTitleSize()}px`;
  title.textContent = parsed.bodyTitle;

  header.append(meta, title);

  const article = document.createElement("article");
  article.className = "preview-page-article";
  fragments.forEach((fragment) => {
    article.appendChild(createFragmentNode(fragment));
  });

  const footer = document.createElement("footer");
  footer.className = "preview-page-footer";
  footer.innerHTML = `
    <span class="preview-page-footer-label">${escapeHtml(bodyTheme.footerLabel)}</span>
    <span class="preview-page-footer-number">Page ${pageNumber} / ${totalPages}</span>
  `;

  card.append(header, article, footer);
}

function updateBodyPaginationUi(pages) {
  const totalPages = pages.length;
  const safeIndex = Math.min(
    Math.max(state.currentBodyPage, 0),
    totalPages - 1
  );
  state.currentBodyPage = safeIndex;

  renderPageInto(
    elements.bodyPreviewCard,
    lastParsed,
    pages[safeIndex],
    safeIndex + 1,
    totalPages
  );

  elements.bodyPageIndicator.textContent = `Page ${safeIndex + 1} / ${totalPages}`;
  elements.bodyPrevPageButton.disabled = safeIndex === 0;
  elements.bodyNextPageButton.disabled = safeIndex === totalPages - 1;
}

function renderTypography() {
  const fontFamily = getActiveFontFamily();
  elements.coverTitle.style.fontFamily = fontFamily;
  elements.coverTitle.style.fontSize = `${state.fontSize}px`;
  elements.coverHighlights.style.fontFamily = fontFamily;
  elements.editorInput.style.fontFamily = fontFamily;
  elements.fontSizeValue.textContent = `${state.fontSize}px`;
  elements.fontFamilySelect.value = state.fontFamily;
  elements.fontSizeRange.value = String(state.fontSize);
}

function buildExportCards() {
  if (!lastParsed) {
    lastExportCards = [];
    return;
  }

  lastExportCards = [
    {
      id: "cover",
      type: "cover",
      pageNumber: 1,
    },
    ...lastBodyPages.map((fragments, index) => ({
      id: `body-${index + 1}`,
      type: "body",
      pageNumber: index + 1,
      fragments,
    })),
  ];

  const validCardIds = new Set(lastExportCards.map((card) => card.id));
  state.selectedExportCardIds = new Set(
    [...state.selectedExportCardIds].filter((cardId) =>
      validCardIds.has(cardId)
    )
  );

  if (!state.selectedExportCardIds.size) {
    lastExportCards.forEach((card) => state.selectedExportCardIds.add(card.id));
  }
}

function renderExportCoverCard() {
  const wrapper = elements.coverPreviewCard.cloneNode(true);
  wrapper
    .querySelectorAll("[id]")
    .forEach((node) => node.removeAttribute("id"));
  wrapper.removeAttribute("id");
  wrapper.classList.remove("hidden", "mb-8");
  return wrapper;
}

function renderExportBodyCard(card, pageIndex) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "preview-card preview-card-body rounded-xl bg-white p-8 sm:p-10";
  renderPageInto(
    wrapper,
    lastParsed,
    card.fragments,
    pageIndex + 1,
    lastBodyPages.length
  );
  return wrapper;
}

function renderExportCards() {
  const ratio = sizePresetRatios[state.exportSizePreset];
  elements.exportCardGrid.replaceChildren();

  if (!lastExportCards.length) {
    const empty = document.createElement("div");
    empty.className = "export-card-grid-empty md:col-span-2 xl:col-span-3";
    empty.innerHTML = `
      <div class="space-y-3">
        <div class="text-sm font-bold uppercase tracking-[0.24em] text-stone-400">No Pages Yet</div>
        <p class="max-w-sm text-sm leading-relaxed">Add some content in the workspace and your export deck will appear here automatically.</p>
      </div>
    `;
    elements.exportCardGrid.appendChild(empty);
    return;
  }

  lastExportCards.forEach((card, index) => {
    const article = document.createElement("article");
    article.className =
      "export-card group relative rounded-xl p-4 transition-all duration-300 hover:-translate-y-1";
    article.dataset.exportPreviewId = card.id;

    const shell = document.createElement("div");
    shell.className = "export-card-shell export-page-frame";
    shell.style.setProperty("--export-card-ratio", ratio);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "export-check absolute right-4 top-4 z-10";
    toggle.dataset.cardId = card.id;
    toggle.setAttribute(
      "aria-pressed",
      String(state.selectedExportCardIds.has(card.id))
    );
    toggle.setAttribute("aria-label", `Select export page ${index + 1}`);
    toggle.innerHTML = '<span class="material-symbols-outlined">check</span>';

    shell.append(toggle);
    shell.append(
      card.type === "cover"
        ? renderExportCoverCard()
        : renderExportBodyCard(card, index - 1)
    );

    article.append(shell);
    elements.exportCardGrid.appendChild(article);
  });
}

function formatSize(mbValue) {
  return `${mbValue.toFixed(1)}MB`;
}

function renderExportMetadata() {
  const count = state.selectedExportCardIds.size;
  const totalCards = lastExportCards.length;
  const factor = sizePresetFactors[state.exportSizePreset] || 1;
  const totalSize = count * sizePerPage[state.exportFormat] * factor;
  const activeTemplate = getActiveTemplate();

  elements.layoutPresetLabel.textContent = `${
    bodyLayoutLabels[state.bodyLayout] || "Auto Pagination"
  } • ${activeTemplate.shortLabel} • ${totalCards} Pages`;
  elements.selectedCountLabel.textContent = `${count} Page${
    count === 1 ? "" : "s"
  } Selected`;
  elements.estimatedSizeLabel.textContent = `Est. Size: ${formatSize(totalSize)}`;
  elements.downloadButton.textContent = state.isExporting
    ? state.exportProgressLabel || "Preparing Export..."
    : count === 0
      ? "Select Items to Download"
      : count === totalCards
        ? "Download All Pages"
        : `Download ${count} Page${count === 1 ? "" : "s"}`;
  elements.downloadButton.disabled = count === 0 || state.isExporting;
  elements.downloadButton.classList.toggle(
    "opacity-50",
    count === 0 || state.isExporting
  );
  elements.downloadButton.classList.toggle(
    "cursor-not-allowed",
    count === 0 || state.isExporting
  );

  elements.exportCardGrid
    .querySelectorAll("[data-card-id]")
    .forEach((toggleButton) => {
      const cardId = toggleButton.dataset.cardId;
      toggleButton.setAttribute(
        "aria-pressed",
        String(state.selectedExportCardIds.has(cardId))
      );
    });

  $$("[data-format]").forEach((button) => {
    const active = button.dataset.format === state.exportFormat;
    button.classList.toggle("is-active", active);
  });
  elements.sizePresetSelect.value = state.exportSizePreset;
}

function renderAppView() {
  const showingWorkspace = state.activeView === "workspace";
  elements.workspaceView.classList.toggle("hidden", !showingWorkspace);
  elements.exportView.classList.toggle("hidden", showingWorkspace);

  elements.appViewButtons.forEach((button) => {
    const active = button.dataset.appView === state.activeView;
    button.classList.toggle("is-active", active);
    button.classList.toggle("border-[#8d4d4d]", active);
    button.classList.toggle("text-[#8d4d4d]", active);
    button.classList.toggle("text-[#323233]/60", !active);
  });
}

function invalidateCoverCopyForCurrentInput() {
  state.coverCopy = null;
  state.coverCopyKey = "";
}

function renderDocument(parsed) {
  lastParsed = parsed;
  const activeTemplate = getActiveTemplate();

  elements.coverTitle.textContent = parsed.coverTitle;
  renderCoverHighlights(parsed.coverHighlights);
  applyCoverPreviewTemplate(activeTemplate);

  const showCover = state.previewMode === "cover";
  elements.coverPreviewCard.classList.toggle("hidden", !showCover);
  elements.bodyPreviewPanel.classList.toggle("hidden", showCover);

  $$("[data-preview-mode]").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.previewMode === state.previewMode
    );
  });

  $$("[data-body-layout]").forEach((button) => {
    const active = button.dataset.bodyLayout === state.bodyLayout;
    button.classList.toggle("is-active", active);
    button.classList.toggle("border-primary", active);
    button.classList.toggle("bg-primary-container/10", active);
    button.classList.toggle("border-outline-variant/30", !active);
  });

  renderTemplatePicker();
  renderTypography();
  lastBodyPages = paginateBodyContent(parsed);
  updateBodyPaginationUi(lastBodyPages);
  buildExportCards();
  renderExportCards();
  renderExportMetadata();
  renderAppView();
}

function rerenderFromInput({ resetPage = false } = {}) {
  if (resetPage) {
    state.currentBodyPage = 0;
  }

  renderDocument(parseEditorText(readInputText()));
}

function applyGeneratedCoverCopy(coverCopy, cacheKey) {
  state.coverCopy = {
    coverTitle: coverCopy.coverTitle,
    coverHighlights: [...coverCopy.coverHighlights],
  };
  state.coverCopyKey = cacheKey;
  rerenderFromInput();
}

async function requestCoverCopyGeneration(cacheKey, inputText, requestToken) {
  try {
    const response = await fetch("/api/ai/cover-copy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputText,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Cover copy generation failed.");
    }

    const coverTitle = sanitizeCoverTitleText(payload.coverTitle);
    const coverHighlights = sanitizeCoverHighlights(
      payload.coverHighlights,
      isCjkText(inputText)
    );

    if (!coverTitle || coverHighlights.length < 2) {
      throw new Error("AI returned incomplete cover copy.");
    }

    if (
      requestToken !== coverCopyRequestToken ||
      cacheKey !== readInputText()
    ) {
      return;
    }

    const result = { coverTitle, coverHighlights };
    coverCopyCache.set(cacheKey, result);
    applyGeneratedCoverCopy(result, cacheKey);
    didShowCoverCopyFailureToast = false;
  } catch (error) {
    console.warn("Cover copy generation failed", error);
    if (
      requestToken === coverCopyRequestToken &&
      cacheKey === readInputText() &&
      !didShowCoverCopyFailureToast
    ) {
      showToast("封面标题生成失败，已先使用本地提炼结果。");
      didShowCoverCopyFailureToast = true;
    }
  }
}

function scheduleCoverCopyGeneration({ immediate = false } = {}) {
  const inputText = readInputText();
  const cacheKey = inputText;
  window.clearTimeout(coverCopyDebounceTimer);

  if (!cacheKey) {
    return;
  }

  const cached = coverCopyCache.get(cacheKey);
  if (cached) {
    applyGeneratedCoverCopy(cached, cacheKey);
    return;
  }

  const requestToken = ++coverCopyRequestToken;
  coverCopyDebounceTimer = window.setTimeout(
    () => {
      requestCoverCopyGeneration(cacheKey, inputText, requestToken);
    },
    immediate ? 80 : COVER_COPY_DEBOUNCE_MS
  );
}

function setActiveView(view) {
  state.activeView = view;
  renderAppView();
}

async function refineLayoutWithAi() {
  if (state.isRefining) {
    return;
  }

  const inputText = readInputText();
  if (!inputText) {
    showToast("Please add some content before asking DeepSeek to refine it.");
    return;
  }

  setRefineButtonLoading(true);

  try {
    const response = await fetch("/api/ai/refine-layout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputText,
        templateId: state.templateId,
        bodyLayout: state.bodyLayout,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "DeepSeek refine failed.");
    }

    if (payload.refinedText) {
      elements.editorInput.value = payload.refinedText;
    }

    if (fontFamilies[payload.fontFamily]) {
      state.fontFamily = payload.fontFamily;
    }

    if (getTemplateById(payload.templateId)?.id) {
      state.templateId = payload.templateId;
    }

    if (["minimal", "magazine", "grid"].includes(payload.bodyLayout)) {
      state.bodyLayout = payload.bodyLayout;
    }

    state.previewMode = "body";
    state.currentBodyPage = 0;
    invalidateCoverCopyForCurrentInput();
    rerenderFromInput();
    scheduleCoverCopyGeneration({ immediate: true });
    showToast(
      payload.rationale
        ? `DeepSeek: ${payload.rationale}`
        : "DeepSeek finished refining your layout draft."
    );
  } catch (error) {
    showToast(error.message || "DeepSeek refine failed.");
  } finally {
    setRefineButtonLoading(false);
  }
}

function toggleExportCardSelection(cardId) {
  if (state.selectedExportCardIds.has(cardId)) {
    state.selectedExportCardIds.delete(cardId);
  } else {
    state.selectedExportCardIds.add(cardId);
  }

  renderExportMetadata();
}

function setExportLoadingState(isLoading, label = "") {
  state.isExporting = isLoading;
  state.exportProgressLabel = label;
  renderExportMetadata();
}

async function handleDownloadAction() {
  if (state.isExporting) {
    return;
  }

  if (!state.selectedExportCardIds.size) {
    showExportToast("Please select at least one page before exporting.");
    return;
  }

  if (state.exportFormat === "pdf") {
    showExportToast(
      "PDF export will come next. For now, please use PNG or JPEG."
    );
    return;
  }

  try {
    setExportLoadingState(true, "Preparing export...");
    ensureExportRuntime();
    const selectedCards = getSelectedExportCards();
    const singleFile = selectedCards.length === 1;
    const initialFilename = singleFile
      ? `${getExportAssetBasename(selectedCards[0], 0)}.${getExportFileExtension()}`
      : getExportArchiveName(selectedCards);
    const saveTarget = await prepareSaveTarget(
      initialFilename,
      singleFile ? getExportMimeType() : "application/zip"
    );

    const files = [];

    for (const [index, card] of selectedCards.entries()) {
      setExportLoadingState(
        true,
        `Rendering ${index + 1} / ${selectedCards.length}...`
      );
      files.push(await renderCardToBlob(card, index));
    }

    if (files.length === 1) {
      await saveBlobToTarget(saveTarget, files[0].blob, files[0].filename);
      showExportToast("Saved 1 page.");
      return;
    }

    setExportLoadingState(true, `Packaging ${files.length} pages...`);
    const archive = await createArchiveBlob(files);
    const archiveName = saveTarget.filename;
    await saveBlobToTarget(saveTarget, archive, archiveName);
    showExportToast(`Saved ${files.length} pages as ZIP.`);
  } catch (error) {
    showExportToast(error.message || "Export failed. Please try again.");
  } finally {
    setExportLoadingState(false);
  }
}

function bindEvents() {
  elements.appViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.appView);
    });
  });

  elements.homeButton.addEventListener("click", () => {
    setActiveView("workspace");
  });

  elements.editorInput.addEventListener("input", () => {
    invalidateCoverCopyForCurrentInput();
    rerenderFromInput();
    scheduleCoverCopyGeneration();
  });

  elements.fontFamilySelect.addEventListener("change", (event) => {
    state.fontFamily = event.target.value;
    rerenderFromInput();
  });

  elements.fontSizeRange.addEventListener("input", (event) => {
    state.fontSize = Number(event.target.value);
    rerenderFromInput();
  });

  $$("[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.previewMode = button.dataset.previewMode;
      renderDocument(lastParsed);
    });
  });

  elements.coverTemplateList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-template-id]");
    if (!button) {
      return;
    }

    applyTemplateSelection(button.dataset.templateId, { showFeedback: true });
  });

  $$("[data-body-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bodyLayout = button.dataset.bodyLayout;
      rerenderFromInput();
    });
  });

  elements.bodyPrevPageButton.addEventListener("click", () => {
    if (state.currentBodyPage <= 0) {
      return;
    }

    state.currentBodyPage -= 1;
    updateBodyPaginationUi(lastBodyPages);
  });

  elements.bodyNextPageButton.addEventListener("click", () => {
    if (state.currentBodyPage >= lastBodyPages.length - 1) {
      return;
    }

    state.currentBodyPage += 1;
    updateBodyPaginationUi(lastBodyPages);
  });

  elements.refineButton.addEventListener("click", () => {
    refineLayoutWithAi();
  });

  $$("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      state.exportFormat = button.dataset.format;
      renderExportMetadata();
    });
  });

  elements.sizePresetSelect.addEventListener("change", (event) => {
    state.exportSizePreset = event.target.value;
    renderExportCards();
    renderExportMetadata();
  });

  elements.exportCardGrid.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-card-id]");
    if (!toggleButton) {
      return;
    }

    toggleExportCardSelection(toggleButton.dataset.cardId);
  });

  elements.downloadButton.addEventListener("click", () => {
    handleDownloadAction();
  });

  [elements.shareButton, elements.moreButton].forEach((button) => {
    button.addEventListener("click", () => {
      showExportToast(
        "Action captured. Delivery wiring can be added after real export files land."
      );
    });
  });
}

function init() {
  try {
    renderAppView();
    bindEvents();
    rerenderFromInput();
    scheduleCoverCopyGeneration({ immediate: true });
    window.__text2cardInitDone = true;
  } catch (error) {
    console.error("Text2Card init failed", error);
    window.__text2cardInitDone = false;
    showToast("页面初始化失败，请刷新后重试。");
  }
}

init();
