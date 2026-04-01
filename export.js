const STORAGE_KEY = "digital-atelier-workspace";

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

const bodyLayoutLabels = {
  minimal: "Minimalist Focus",
  magazine: "Magazine Split",
  grid: "Double Grid",
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

const coverLabels = {
  floral: "Core Philosophy",
  brush: "Studio Texture",
  forest: "Quiet Perspective",
  paper: "Editorial Notes",
};

const state = {
  format: "jpeg",
  sizePreset: "3:4",
  workspace: null,
  cards: [],
  selectedCards: new Set(),
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  exportCardGrid: $("#exportCardGrid"),
  layoutPresetLabel: $("#layoutPresetLabel"),
  selectedCountLabel: $("#selectedCountLabel"),
  estimatedSizeLabel: $("#estimatedSizeLabel"),
  downloadButton: $("#downloadButton"),
  exportToast: $("#exportToast"),
  sizePresetSelect: $("#sizePresetSelect"),
};

function showToast(message) {
  elements.exportToast.textContent = message;
  elements.exportToast.classList.add("floating-toast-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.exportToast.classList.remove("floating-toast-visible");
  }, 2200);
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

  const maxLength = isCjkText(trimmed) ? 24 : 56;
  return (
    trimmed.length <= maxLength && countMatches(trimmed, /[。！？.!?]/g) <= 1
  );
}

function getFirstSentence(text) {
  const clean = String(text || "").trim();
  if (!clean) {
    return "";
  }

  const sentenceMatch = clean.match(
    /^.*?[。！？.!?](?=\s|$|["'”」』）)])|^.+$/
  );
  return (sentenceMatch ? sentenceMatch[0] : clean).trim();
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

function buildSummary(source, cjk) {
  if (!source) {
    return cjk
      ? "在轻量排版工作区里，将文字自动分割为适合小红书发布的分页图片。"
      : "Shape text into a paced sequence of Xiaohongshu-ready image pages.";
  }

  return clampText(source, cjk ? 46 : 110);
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

function getActiveFontFamily(workspace) {
  return fontFamilies[workspace.fontFamily] || fontFamilies.noto;
}

function getDefaultWorkspaceData() {
  return {
    coverStyle: "floral",
    bodyLayout: "magazine",
    fontFamily: "noto",
    fontSize: 24,
    parsed: {
      coverTitle: "在数字工坊里编排一篇图文",
      coverSummary:
        "让正文按小红书的 3:4 画布自动分页，而不是输出一张无法阅读的长图。",
      bodyTitle: "在数字工坊里编排一篇图文",
      isCjk: true,
      bodyPages: [
        [
          {
            type: "paragraph",
            text: "让正文按小红书的 3:4 画布自动分页，而不是输出一张无法阅读的长图。这样每一页都保持合适的信息密度，也更方便用户浏览和保存。",
            sourceIndex: 0,
            isContinuation: false,
          },
          {
            type: "quote",
            text: "好的图文不是拉长内容，而是为每一页安排清晰的阅读停顿。",
            sourceIndex: 1,
            isContinuation: false,
          },
        ],
      ],
    },
  };
}

function buildLegacyParsed(raw) {
  const inputText = String(raw?.inputText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!inputText) {
    return getDefaultWorkspaceData().parsed;
  }

  const rawParagraphs = inputText
    .split(/\n\s*\n/)
    .map((item) => item.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const cjk = isCjkText(inputText);
  const paragraphs = [...rawParagraphs];
  let explicitTitle = "";

  if (paragraphs.length > 1 && isLikelyTitle(paragraphs[0])) {
    explicitTitle = paragraphs.shift();
  }

  const workingParagraphs = paragraphs.length
    ? paragraphs
    : getDefaultWorkspaceData()
        .parsed.bodyPages.flat()
        .map((item) => item.text);

  const titleSource =
    explicitTitle ||
    getFirstSentence(workingParagraphs[0]) ||
    workingParagraphs[0];
  const summarySource =
    getFirstSentence(workingParagraphs[0]) || workingParagraphs[0];
  const segments = workingParagraphs.map((paragraph, index) => ({
    type: isQuoteParagraph(paragraph, index) ? "quote" : "paragraph",
    text: paragraph,
    sourceIndex: index,
    isContinuation: false,
  }));

  const pageCharLimit = cjk ? 120 : 280;
  const bodyPages = [];
  let currentPage = [];
  let currentChars = 0;

  segments.forEach((segment) => {
    const weight = segment.type === "quote" ? 0.75 : 1;
    const length = Math.ceil(segment.text.length * weight);

    if (currentPage.length && currentChars + length > pageCharLimit) {
      bodyPages.push(currentPage);
      currentPage = [];
      currentChars = 0;
    }

    currentPage.push(segment);
    currentChars += length;
  });

  if (currentPage.length) {
    bodyPages.push(currentPage);
  }

  return {
    coverTitle: buildTitle(titleSource, cjk),
    coverSummary: buildSummary(summarySource, cjk),
    bodyTitle: buildTitle(titleSource, cjk),
    isCjk: cjk,
    bodyPages: bodyPages.length
      ? bodyPages
      : getDefaultWorkspaceData().parsed.bodyPages,
  };
}

function normalizeWorkspaceData(raw) {
  const fallback = getDefaultWorkspaceData();
  const parsed = raw?.parsed || fallback.parsed;
  const normalizedParsed =
    Array.isArray(parsed.bodyPages) && parsed.bodyPages.length
      ? parsed
      : buildLegacyParsed(raw);
  const bodyPages =
    Array.isArray(parsed.bodyPages) && parsed.bodyPages.length
      ? parsed.bodyPages
      : normalizedParsed.bodyPages;

  return {
    coverStyle: raw?.coverStyle || fallback.coverStyle,
    bodyLayout: raw?.bodyLayout || fallback.bodyLayout,
    fontFamily: raw?.fontFamily || fallback.fontFamily,
    fontSize: Number(raw?.fontSize) || fallback.fontSize,
    parsed: {
      coverTitle: normalizedParsed.coverTitle || fallback.parsed.coverTitle,
      coverSummary:
        normalizedParsed.coverSummary || fallback.parsed.coverSummary,
      bodyTitle:
        normalizedParsed.bodyTitle ||
        normalizedParsed.coverTitle ||
        fallback.parsed.bodyTitle,
      isCjk: Boolean(normalizedParsed.isCjk),
      bodyPages,
    },
  };
}

function hydrateWorkspace() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    state.workspace = getDefaultWorkspaceData();
    return;
  }

  try {
    state.workspace = normalizeWorkspaceData(JSON.parse(saved));
  } catch {
    state.workspace = getDefaultWorkspaceData();
  }
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

function renderCoverCard(card, workspace) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-card preview-card-cover rounded-xl bg-white p-6";
  wrapper.dataset.coverStyle = workspace.coverStyle;
  wrapper.style.fontFamily = getActiveFontFamily(workspace);

  const badge = document.createElement("div");
  badge.className =
    "mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/20 text-2xl shadow-sm";
  badge.id = "coverBadge";
  badge.innerHTML = `<span class="material-symbols-outlined text-primary">auto_awesome</span>`;

  const body = document.createElement("div");
  body.className = "flex-1 space-y-3";

  const title = document.createElement("h3");
  title.className = "font-headline font-bold leading-tight text-on-surface";
  title.style.fontFamily = getActiveFontFamily(workspace);
  title.style.fontSize = `${Math.max(workspace.fontSize - 4, 18)}px`;
  title.textContent = workspace.parsed.coverTitle;

  const summary = document.createElement("p");
  summary.className = "leading-relaxed text-on-surface-variant opacity-80";
  summary.style.fontFamily = getActiveFontFamily(workspace);
  summary.style.fontSize = `${Math.max(workspace.fontSize - 12, 11)}px`;
  summary.textContent = workspace.parsed.coverSummary;

  const footer = document.createElement("div");
  footer.className =
    "mt-6 flex items-center justify-between border-t border-surface-container pt-4";
  footer.innerHTML = `
    <span class="text-[9px] font-label font-bold uppercase tracking-widest text-primary">${coverLabels[workspace.coverStyle] || coverLabels.floral}</span>
    <span class="material-symbols-outlined text-sm text-surface-variant">arrow_forward</span>
  `;

  body.append(title, summary);
  wrapper.append(badge, body, footer);
  return wrapper;
}

function renderBodyCard(card, workspace, pageIndex) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-card preview-card-body rounded-xl bg-white p-6";
  wrapper.dataset.bodyLayout = workspace.bodyLayout;
  wrapper.dataset.script = workspace.parsed.isCjk ? "cjk" : "latin";
  wrapper.style.fontFamily = getActiveFontFamily(workspace);
  wrapper.style.fontSize = `${Math.max(workspace.fontSize - 12, 11)}px`;

  const header = document.createElement("header");
  header.className = "preview-page-header";

  const meta = document.createElement("div");
  meta.className = "preview-page-meta";
  meta.innerHTML = `
    <span class="material-symbols-outlined text-xs">format_quote</span>
    <span class="preview-page-meta-label">Chapter ${String(pageIndex + 1).padStart(2, "0")}</span>
  `;

  const title = document.createElement("h3");
  title.className = "preview-page-title";
  title.style.fontFamily = getActiveFontFamily(workspace);
  title.style.fontSize = `${Math.max(workspace.fontSize - 10, 16)}px`;
  title.textContent = workspace.parsed.bodyTitle;

  const article = document.createElement("article");
  article.className = "preview-page-article";
  card.fragments.forEach((fragment) => {
    article.appendChild(createFragmentNode(fragment));
  });

  const footer = document.createElement("footer");
  footer.className = "preview-page-footer";
  footer.innerHTML = `
    <span class="preview-page-footer-label">Lumiere Publication</span>
    <span class="preview-page-footer-number">Page ${String(pageIndex + 2).padStart(2, "0")}</span>
  `;

  header.append(meta, title);
  wrapper.append(header, article, footer);
  return wrapper;
}

function buildCards() {
  const workspace = state.workspace;
  const cards = [
    {
      id: "cover",
      type: "cover",
      pageNumber: 1,
    },
    ...workspace.parsed.bodyPages.map((fragments, index) => ({
      id: `body-${index + 1}`,
      type: "body",
      pageNumber: index + 1,
      fragments,
    })),
  ];

  state.cards = cards;

  const validCardIds = new Set(cards.map((card) => card.id));
  state.selectedCards = new Set(
    [...state.selectedCards].filter((cardId) => validCardIds.has(cardId))
  );

  if (!state.selectedCards.size) {
    cards.forEach((card) => state.selectedCards.add(card.id));
  }
}

function renderExportCards() {
  const workspace = state.workspace;
  const ratio = sizePresetRatios[state.sizePreset];

  elements.exportCardGrid.replaceChildren();

  if (!state.cards.length) {
    const empty = document.createElement("div");
    empty.className = "export-card-grid-empty md:col-span-2 xl:col-span-3";
    empty.innerHTML = `
      <div class="space-y-3">
        <div class="text-sm font-bold uppercase tracking-[0.24em] text-stone-400">No Pages Yet</div>
        <p class="max-w-sm text-sm leading-relaxed">Return to the workspace and add some content. Export cards will appear here automatically.</p>
      </div>
    `;
    elements.exportCardGrid.appendChild(empty);
    return;
  }

  state.cards.forEach((card, index) => {
    const article = document.createElement("article");
    article.className =
      "export-card group relative rounded-xl p-4 transition-all duration-300 hover:-translate-y-1";

    const shell = document.createElement("div");
    shell.className = "export-card-shell export-page-frame";
    shell.style.setProperty("--export-card-ratio", ratio);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "export-check absolute right-4 top-4 z-10";
    toggle.dataset.cardId = card.id;
    toggle.setAttribute(
      "aria-pressed",
      String(state.selectedCards.has(card.id))
    );
    toggle.setAttribute("aria-label", `Select ${card.type} page ${index + 1}`);
    toggle.innerHTML = `<span class="material-symbols-outlined">check</span>`;

    shell.append(toggle);
    shell.append(
      card.type === "cover"
        ? renderCoverCard(card, workspace)
        : renderBodyCard(card, workspace, index - 1)
    );

    article.append(shell);
    elements.exportCardGrid.appendChild(article);
  });
}

function formatSize(mbValue) {
  return `${mbValue.toFixed(1)}MB`;
}

function renderMetadata() {
  const count = state.selectedCards.size;
  const totalCards = state.cards.length;
  const factor = sizePresetFactors[state.sizePreset] || 1;
  const totalSize = count * sizePerPage[state.format] * factor;

  elements.layoutPresetLabel.textContent = `${bodyLayoutLabels[state.workspace.bodyLayout] || "Auto Pagination"} • ${totalCards} Pages`;
  elements.selectedCountLabel.textContent = `${count} Page${count > 1 ? "s" : ""} Selected`;
  elements.estimatedSizeLabel.textContent = `Est. Size: ${formatSize(totalSize)}`;
  elements.downloadButton.textContent =
    count === 0
      ? "Select Items to Download"
      : count === totalCards
        ? "Download All Pages"
        : `Download ${count} Page${count > 1 ? "s" : ""}`;
  elements.downloadButton.disabled = count === 0;
  elements.downloadButton.classList.toggle("opacity-50", count === 0);
  elements.downloadButton.classList.toggle("cursor-not-allowed", count === 0);

  elements.exportCardGrid
    .querySelectorAll("[data-card-id]")
    .forEach((toggleButton) => {
      const cardId = toggleButton.dataset.cardId;
      toggleButton.setAttribute(
        "aria-pressed",
        String(state.selectedCards.has(cardId))
      );
    });
}

function toggleCardSelection(cardId) {
  if (state.selectedCards.has(cardId)) {
    state.selectedCards.delete(cardId);
  } else {
    state.selectedCards.add(cardId);
  }

  renderMetadata();
}

function bindEvents() {
  elements.exportCardGrid.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-card-id]");
    if (!toggleButton) {
      return;
    }

    toggleCardSelection(toggleButton.dataset.cardId);
  });

  document.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      state.format = button.dataset.format;
      document
        .querySelectorAll("[data-format]")
        .forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderMetadata();
    });
  });

  elements.sizePresetSelect.addEventListener("change", (event) => {
    state.sizePreset = event.target.value;
    renderExportCards();
    renderMetadata();
  });

  elements.downloadButton.addEventListener("click", () => {
    if (!state.selectedCards.size) {
      showToast("Please select at least one page before exporting.");
      return;
    }

    showToast(
      `Prepared ${state.selectedCards.size} export page${state.selectedCards.size > 1 ? "s" : ""}. Download wiring is the next backend step.`
    );
  });

  ["#topExportButton", "#shareButton", "#moreButton"].forEach((selector) => {
    const element = $(selector);
    if (!element) {
      return;
    }
    element.addEventListener("click", () => {
      showToast(
        "Action captured. Next step is wiring real delivery and storage."
      );
    });
  });
}

function init() {
  hydrateWorkspace();
  buildCards();
  renderExportCards();
  bindEvents();
  renderMetadata();
}

init();
