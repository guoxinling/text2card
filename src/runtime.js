import {
  DEFAULT_TEMPLATE_ID,
  getTemplateById,
} from "../card-templates.js?v=20260401-cover-template-fix-2";

export const MAX_PAGE_GUARD = 48;
export const COVER_COPY_DEBOUNCE_MS = 900;

export const sizePerPage = {
  jpeg: 0.8,
  png: 1.35,
  pdf: 2.4,
};

export const sizePresetFactors = {
  "3:4": 1,
  "1:1": 0.92,
  "9:16": 1.16,
};

export const sizePresetRatios = {
  "3:4": "3 / 4",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

export const exportDimensions = {
  "3:4": { width: 1242, height: 1656 },
  "1:1": { width: 1242, height: 1242 },
  "9:16": { width: 1080, height: 1920 },
};

export const exportMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
};

export const exportFileExtensions = {
  jpeg: "jpg",
  png: "png",
};

export const bodyLayoutLabels = {
  minimal: "Minimalist Focus",
  magazine: "Magazine Split",
  grid: "Double Grid",
};

export const fontFamilies = {
  noto: `"Noto Serif", "Songti SC", serif`,
  pingfang: `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`,
  songti: `"Songti SC", "STSong", "SimSun", serif`,
  kaiti: `"Kaiti SC", "STKaiti", "KaiTi", serif`,
  fangsong: `"STFangsong", "FangSong", serif`,
  yahei: `"Microsoft YaHei", "PingFang SC", sans-serif`,
  playfair: `"Playfair Display", "Times New Roman", serif`,
  cormorant: `"Cormorant Garamond", "Times New Roman", serif`,
};

export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => Array.from(document.querySelectorAll(selector));

export const state = {
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
  manualCoverCopy: null,
  manualCoverCopyKey: "",
  exportFormat: "jpeg",
  exportSizePreset: "3:4",
  selectedExportCardIds: new Set(),
  isExporting: false,
  exportProgressLabel: "",
};

export const elements = {
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
  coverTitleInput: $("#coverTitleInput"),
  coverHighlightsInput: $("#coverHighlightsInput"),
  resetCoverCopyButton: $("#resetCoverCopyButton"),
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

export const wordSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh-Hans", { granularity: "word" })
    : null;

export const runtime = {
  paginationMeasure: null,
  lastParsed: null,
  lastBodyPages: [],
  lastExportCards: [],
  exportRenderStage: null,
  coverCopyCache: new Map(),
  coverCopyDebounceTimer: 0,
  coverCopyRequestToken: 0,
  didShowCoverCopyFailureToast: false,
};

export function getActiveFontFamily() {
  return fontFamilies[state.fontFamily] || fontFamilies.noto;
}

export function getBodyTextSize() {
  return Math.max(state.fontSize - 8, 15);
}

export function getBodyTitleSize() {
  return Math.max(state.fontSize - 4, 22);
}
