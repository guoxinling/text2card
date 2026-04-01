import { elements, state } from "./runtime.js";
import {
  clampText,
  getFirstSentence,
  isCjkText,
  isLikelyTitle,
  normalizeText,
} from "./utils.js";

export function readInputText() {
  return normalizeText(elements.editorInput.value);
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

export function sanitizeCoverTitleText(text) {
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

export function sanitizeCoverHighlights(items, cjk) {
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

export function parseCoverHighlightsText(text, cjk) {
  return sanitizeCoverHighlights(
    String(text || "")
      .split(/\r?\n+/)
      .map((item) => item.trim())
      .filter(Boolean),
    cjk
  );
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

export function renderCoverHighlights(highlights) {
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

export function parseEditorText(text) {
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
  const manualCoverCopy =
    state.manualCoverCopyKey === normalized ? state.manualCoverCopy : null;
  const manualCoverTitle = sanitizeCoverTitleText(
    manualCoverCopy?.titleText || ""
  );
  const manualCoverHighlights = parseCoverHighlightsText(
    manualCoverCopy?.highlightsText || "",
    cjk
  );
  const coverTitle =
    manualCoverTitle ||
    sanitizeCoverTitleText(activeCoverCopy?.coverTitle) ||
    fallbackCoverCopy.coverTitle;
  const coverHighlights = sanitizeCoverHighlights(
    activeCoverCopy?.coverHighlights,
    cjk
  );

  return {
    coverTitle,
    coverHighlights:
      manualCoverHighlights.length >= 2
        ? manualCoverHighlights
        : coverHighlights.length >= 2
          ? coverHighlights
          : fallbackCoverCopy.coverHighlights,
    bodyTitle: coverTitle,
    bodySegments,
    isCjk: cjk,
  };
}

export function getEditableCoverCopy(parsed, rawInputText = readInputText()) {
  const cjk = parsed?.isCjk ?? isCjkText(rawInputText);
  const manualCoverCopy =
    state.manualCoverCopyKey === rawInputText ? state.manualCoverCopy : null;

  return {
    titleText: manualCoverCopy?.titleText ?? parsed.coverTitle ?? "",
    highlightsText:
      manualCoverCopy?.highlightsText ??
      (Array.isArray(parsed.coverHighlights)
        ? parsed.coverHighlights.join("\n")
        : ""),
    cjk,
  };
}
