import { getTemplateById } from "../card-templates.js?v=20260401-cover-template-fix-2";
import {
  $$,
  COVER_COPY_DEBOUNCE_MS,
  elements,
  fontFamilies,
  runtime,
  state,
} from "./runtime.js";
import {
  getEditableCoverCopy,
  parseEditorText,
  readInputText,
  renderCoverHighlights,
  sanitizeCoverHighlights,
  sanitizeCoverTitleText,
} from "./models.js";
import {
  applyCoverPreviewTemplate,
  getActiveTemplate,
  paginateBodyContent,
  renderTemplatePicker,
  renderTypography,
  updateBodyPaginationUi,
} from "./preview.js";
import {
  buildExportCards,
  handleDownloadAction,
  renderExportCards,
  renderExportMetadata,
} from "./exporter.js";

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
  state.manualCoverCopy = null;
  state.manualCoverCopyKey = "";
}

function syncCoverCopyEditor(parsed) {
  const editable = getEditableCoverCopy(parsed, readInputText());

  if (
    document.activeElement !== elements.coverTitleInput ||
    elements.coverTitleInput.value !== editable.titleText
  ) {
    elements.coverTitleInput.value = editable.titleText;
  }

  if (
    document.activeElement !== elements.coverHighlightsInput ||
    elements.coverHighlightsInput.value !== editable.highlightsText
  ) {
    elements.coverHighlightsInput.value = editable.highlightsText;
  }
}

function applyManualCoverCopyFromInputs() {
  const cacheKey = readInputText();
  state.manualCoverCopy = {
    titleText: elements.coverTitleInput.value,
    highlightsText: elements.coverHighlightsInput.value,
  };
  state.manualCoverCopyKey = cacheKey;
  rerenderFromInput();
}

function resetManualCoverCopy() {
  state.manualCoverCopy = null;
  state.manualCoverCopyKey = "";
  rerenderFromInput();

  if (!state.coverCopyKey) {
    scheduleCoverCopyGeneration({ immediate: true });
  }
}

function renderDocument(parsed) {
  runtime.lastParsed = parsed;
  const activeTemplate = getActiveTemplate();

  elements.coverTitle.textContent = parsed.coverTitle;
  renderCoverHighlights(parsed.coverHighlights);
  syncCoverCopyEditor(parsed);
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
  runtime.lastBodyPages = paginateBodyContent(parsed);
  updateBodyPaginationUi(runtime.lastBodyPages);
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
      /[\u3400-\u9fff]/.test(inputText)
    );

    if (!coverTitle || coverHighlights.length < 2) {
      throw new Error("AI returned incomplete cover copy.");
    }

    if (
      requestToken !== runtime.coverCopyRequestToken ||
      cacheKey !== readInputText()
    ) {
      return;
    }

    const result = { coverTitle, coverHighlights };
    runtime.coverCopyCache.set(cacheKey, result);
    applyGeneratedCoverCopy(result, cacheKey);
    runtime.didShowCoverCopyFailureToast = false;
  } catch (error) {
    console.warn("Cover copy generation failed", error);
    if (
      requestToken === runtime.coverCopyRequestToken &&
      cacheKey === readInputText() &&
      !runtime.didShowCoverCopyFailureToast
    ) {
      showToast("封面标题生成失败，已先使用本地提炼结果。");
      runtime.didShowCoverCopyFailureToast = true;
    }
  }
}

function scheduleCoverCopyGeneration({ immediate = false } = {}) {
  const inputText = readInputText();
  const cacheKey = inputText;
  window.clearTimeout(runtime.coverCopyDebounceTimer);

  if (!cacheKey) {
    return;
  }

  const cached = runtime.coverCopyCache.get(cacheKey);
  if (cached) {
    applyGeneratedCoverCopy(cached, cacheKey);
    return;
  }

  const requestToken = ++runtime.coverCopyRequestToken;
  runtime.coverCopyDebounceTimer = window.setTimeout(
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

function applyTemplateSelection(templateId, { showFeedback = false } = {}) {
  const template = getTemplateById(templateId);
  state.templateId = template.id;
  state.bodyLayout = template.recommendedBodyLayout;
  state.fontFamily = template.recommendedFontFamily;
  state.currentBodyPage = 0;

  if (runtime.lastParsed) {
    renderDocument(runtime.lastParsed);
  } else {
    rerenderFromInput({ resetPage: true });
  }

  if (showFeedback) {
    showToast(`已应用模板：${template.name}`);
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

  elements.coverTitleInput.addEventListener("input", () => {
    applyManualCoverCopyFromInputs();
  });

  elements.coverHighlightsInput.addEventListener("input", () => {
    applyManualCoverCopyFromInputs();
  });

  elements.resetCoverCopyButton.addEventListener("click", () => {
    resetManualCoverCopy();
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
      renderDocument(runtime.lastParsed);
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
    updateBodyPaginationUi(runtime.lastBodyPages);
  });

  elements.bodyNextPageButton.addEventListener("click", () => {
    if (state.currentBodyPage >= runtime.lastBodyPages.length - 1) {
      return;
    }

    state.currentBodyPage += 1;
    updateBodyPaginationUi(runtime.lastBodyPages);
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
    handleDownloadAction(showExportToast);
  });

  [elements.shareButton, elements.moreButton].forEach((button) => {
    button.addEventListener("click", () => {
      showExportToast(
        "Action captured. Delivery wiring can be added after real export files land."
      );
    });
  });
}

export function initApp() {
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
