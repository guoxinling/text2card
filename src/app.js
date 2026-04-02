import { getTemplateById } from "../card-templates.js?v=20260401-cover-template-fix-2";
import {
  $$,
  COVER_COPY_DEBOUNCE_MS,
  elements,
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
  renderRefineButton();
}

function renderRefineButton() {
  if (!elements.refineButton) {
    return;
  }

  const inCoverMode = state.previewMode === "cover";
  const isLoading = state.isRefining;
  const isAvailable = inCoverMode;

  elements.refineButton.disabled = isLoading || !isAvailable;
  elements.refineButton.classList.toggle("opacity-70", isLoading);
  elements.refineButton.classList.toggle("cursor-wait", isLoading);
  elements.refineButtonLabel.textContent = isLoading
    ? "AI 重写封面中..."
    : isAvailable
      ? "AI 重写封面"
      : "正文 AI 待配置";
  elements.refineButton.title = isAvailable
    ? "根据提示词重新生成封面标题和要点"
    : "你还没有提供正文 AI 提示词，正文模式下暂不启用。";
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

function renderSidebarMode() {
  const showingCoverControls = state.previewMode === "cover";
  elements.coverControlsPanel?.classList.toggle(
    "hidden",
    !showingCoverControls
  );
  elements.bodyControlsPanel?.classList.toggle("hidden", showingCoverControls);
  renderRefineButton();
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

  renderTemplatePicker();
  renderTypography();
  renderSidebarMode();
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

async function fetchCoverCopyFromAi(inputText) {
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

  return { coverTitle, coverHighlights };
}

async function requestCoverCopyGeneration(cacheKey, inputText, requestToken) {
  try {
    const result = await fetchCoverCopyFromAi(inputText);

    if (
      requestToken !== runtime.coverCopyRequestToken ||
      cacheKey !== readInputText()
    ) {
      return;
    }

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

async function handlePreviewAiAction() {
  if (state.previewMode !== "cover") {
    showToast("你还没有提供正文 AI 提示词，正文模式下暂不启用。");
    return;
  }

  if (state.isRefining) {
    return;
  }

  const inputText = readInputText();
  if (!inputText) {
    showToast("请先输入或粘贴正文内容，再生成封面文案。");
    return;
  }

  const cacheKey = inputText;
  const requestToken = ++runtime.coverCopyRequestToken;
  window.clearTimeout(runtime.coverCopyDebounceTimer);
  setRefineButtonLoading(true);

  try {
    const result = await fetchCoverCopyFromAi(inputText);

    if (
      requestToken !== runtime.coverCopyRequestToken ||
      cacheKey !== readInputText()
    ) {
      return;
    }

    state.manualCoverCopy = null;
    state.manualCoverCopyKey = "";
    runtime.coverCopyCache.set(cacheKey, result);
    applyGeneratedCoverCopy(result, cacheKey);
    runtime.didShowCoverCopyFailureToast = false;
    showToast("已根据提示词重新生成封面标题和要点。");
  } catch (error) {
    showToast(error.message || "封面 AI 生成失败。");
  } finally {
    setRefineButtonLoading(false);
  }
}

function applyTemplateSelection(templateId, { showFeedback = false } = {}) {
  const template = getTemplateById(templateId);
  const keepTemplatePickerOpen = state.isTemplatePickerOpen;
  state.templateId = template.id;
  state.bodyLayout = template.recommendedBodyLayout;
  state.fontFamily = template.recommendedFontFamily;
  state.isTemplatePickerOpen = keepTemplatePickerOpen;
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

  elements.templatePickerToggle?.addEventListener("click", () => {
    state.isTemplatePickerOpen = !state.isTemplatePickerOpen;
    renderTemplatePicker();
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

  [
    ["coverTitleSizeRange", "coverTitleSize", 20, 34],
    ["coverHighlightsSizeRange", "coverHighlightsSize", 12, 22],
    ["bodyTitleSizeRange", "bodyTitleSize", 18, 30],
    ["bodyTextSizeRange", "bodyTextSize", 14, 22],
  ].forEach(([elementKey, stateKey, min, max]) => {
    elements[elementKey]?.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state[stateKey] = Math.min(Math.max(value, min), max);
      rerenderFromInput();
    });
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
    handlePreviewAiAction();
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
    renderSidebarMode();
    rerenderFromInput();
    scheduleCoverCopyGeneration({ immediate: true });
    window.__text2cardInitDone = true;
  } catch (error) {
    console.error("Text2Card init failed", error);
    window.__text2cardInitDone = false;
    showToast("页面初始化失败，请刷新后重试。");
  }
}
