import {
  bodyLayoutLabels,
  elements,
  exportDimensions,
  exportFileExtensions,
  exportMimeTypes,
  runtime,
  sizePerPage,
  sizePresetFactors,
  sizePresetRatios,
  state,
} from "./runtime.js";
import { formatExportTimestamp, slugify } from "./utils.js";
import { renderPageInto } from "./preview.js";

function getSelectedExportCards() {
  return runtime.lastExportCards.filter((card) =>
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
  if (runtime.exportRenderStage) {
    return runtime.exportRenderStage;
  }

  runtime.exportRenderStage = document.createElement("div");
  runtime.exportRenderStage.setAttribute("aria-hidden", "true");
  Object.assign(runtime.exportRenderStage.style, {
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
  document.body.appendChild(runtime.exportRenderStage);
  return runtime.exportRenderStage;
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

async function createArchiveBlob(files) {
  const archiveEntries = {};
  for (const file of files) {
    archiveEntries[file.filename] = [await blobToUint8Array(file.blob)];
  }

  const archiveBytes = window.fflate.zipSync(archiveEntries, { level: 6 });
  return new Blob([archiveBytes], { type: "application/zip" });
}

export function buildExportCards() {
  if (!runtime.lastParsed) {
    runtime.lastExportCards = [];
    return;
  }

  runtime.lastExportCards = [
    {
      id: "cover",
      type: "cover",
      pageNumber: 1,
    },
    ...runtime.lastBodyPages.map((fragments, index) => ({
      id: `body-${index + 1}`,
      type: "body",
      pageNumber: index + 1,
      fragments,
    })),
  ];

  const validCardIds = new Set(runtime.lastExportCards.map((card) => card.id));
  state.selectedExportCardIds = new Set(
    [...state.selectedExportCardIds].filter((cardId) =>
      validCardIds.has(cardId)
    )
  );

  if (!state.selectedExportCardIds.size) {
    runtime.lastExportCards.forEach((card) =>
      state.selectedExportCardIds.add(card.id)
    );
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
    runtime.lastParsed,
    card.fragments,
    pageIndex + 1,
    runtime.lastBodyPages.length
  );
  return wrapper;
}

export function renderExportCards() {
  const ratio = sizePresetRatios[state.exportSizePreset];
  elements.exportCardGrid.replaceChildren();

  if (!runtime.lastExportCards.length) {
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

  runtime.lastExportCards.forEach((card, index) => {
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

export function renderExportMetadata() {
  const selectedCards = getSelectedExportCards();
  const count = selectedCards.length;
  const estimated =
    count *
    (sizePerPage[state.exportFormat] || sizePerPage.png) *
    (sizePresetFactors[state.exportSizePreset] || 1);
  const bodyLabel = bodyLayoutLabels[state.bodyLayout] || "Minimalist Focus";

  elements.layoutPresetLabel.textContent = runtime.lastExportCards.length
    ? `${bodyLabel} • ${runtime.lastExportCards.length} Pages`
    : `${bodyLabel} • Awaiting Pages`;
  elements.selectedCountLabel.textContent =
    count === 0
      ? "No pages selected"
      : `${count} page${count === 1 ? "" : "s"} selected`;
  elements.estimatedSizeLabel.textContent =
    count === 0 ? "0MB" : `Est. ${formatSize(estimated)}`;

  if (state.isExporting) {
    elements.downloadButton.textContent =
      state.exportProgressLabel || "Preparing export...";
  } else {
    elements.downloadButton.textContent =
      count === 0
        ? "Select Pages First"
        : count === runtime.lastExportCards.length
          ? "Download All Pages"
          : `Download ${count} Page${count === 1 ? "" : "s"}`;
  }
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

  document.querySelectorAll("[data-format]").forEach((button) => {
    const active = button.dataset.format === state.exportFormat;
    button.classList.toggle("is-active", active);
  });
  elements.sizePresetSelect.value = state.exportSizePreset;
}

function setExportLoadingState(isLoading, label = "") {
  state.isExporting = isLoading;
  state.exportProgressLabel = label;
  renderExportMetadata();
}

export async function handleDownloadAction(showExportToast) {
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
