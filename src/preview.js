import {
  elements,
  getActiveFontFamily,
  getCoverHighlightsSize,
  getCoverTitleSize,
  getBodyTextSize,
  getBodyTitleSize,
  MAX_PAGE_GUARD,
  runtime,
  state,
  wordSegmenter,
} from "./runtime.js";
import { escapeHtml } from "./utils.js";
import {
  CARD_TEMPLATES,
  getTemplateById,
  getTemplateTheme,
} from "../card-templates.js?v=20260401-cover-template-fix-2";

export function getActiveTemplate() {
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

export function getBodyTheme(template) {
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

function getEffectiveBodyLayout(parsed) {
  if (parsed?.isCjk && state.bodyLayout === "grid") {
    return "magazine";
  }

  return state.bodyLayout;
}

function applyTemplateThemeToCard(card, template) {
  const theme = getTemplateTheme(template.id);
  card.style.setProperty("--cover-background", theme.coverBackground);
  card.style.setProperty("--cover-thumb-background", theme.thumbBackground);
  card.style.setProperty("--cover-thumb-ink", theme.thumbInk);
}

export function applyBodyThemeToCard(card, template) {
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

function syncTemplateOptionButton(button, template) {
  const theme = getTemplateTheme(template.id);
  button.dataset.templateId = template.id;

  const thumb = button.querySelector(".template-option-thumb");
  const index = button.querySelector(".template-option-index");
  const icon = button.querySelector(".template-option-icon");
  const shortLabel = button.querySelector(".template-option-label");
  const copy = button.querySelector(".min-w-0.flex-1");
  let name = copy?.children?.[0] ?? null;
  let subtitle = copy?.children?.[1] ?? null;

  if (thumb) {
    thumb.style.setProperty(
      "--template-thumb-background",
      theme.thumbBackground
    );
    thumb.style.setProperty("--template-thumb-ink", theme.thumbInk);
  }

  if (index) {
    index.textContent = String(template.index).padStart(2, "0");
  }

  if (icon) {
    icon.textContent = template.badgeIcon;
  }

  if (shortLabel) {
    shortLabel.textContent = template.shortLabel;
  }

  if (!copy) {
    return;
  }

  if (!name) {
    name = document.createElement("span");
    name.className = "block text-sm font-semibold text-on-surface";
    copy.append(name);
  }

  if (!subtitle) {
    subtitle = document.createElement("span");
    subtitle.className =
      "mt-1 block text-[11px] leading-relaxed text-on-surface-variant";
    copy.append(subtitle);
  }

  name.textContent = template.name;
  subtitle.textContent = template.en;
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

function renderCurrentTemplateSummary() {
  const template = getActiveTemplate();
  const theme = getTemplateTheme(template.id);

  elements.currentTemplateThumb.style.setProperty(
    "--template-thumb-background",
    theme.thumbBackground
  );
  elements.currentTemplateThumb.style.setProperty(
    "--template-thumb-ink",
    theme.thumbInk
  );
  elements.currentTemplateIndex.textContent = String(template.index).padStart(
    2,
    "0"
  );
  elements.currentTemplateIcon.textContent = template.badgeIcon;
  elements.currentTemplateShortLabel.textContent = template.shortLabel;
  elements.currentTemplateName.textContent = template.name;
  elements.currentTemplateSubtitle.textContent = template.en;
  elements.templatePickerToggle?.classList.toggle(
    "is-open",
    state.isTemplatePickerOpen
  );
  elements.templatePickerToggle?.setAttribute(
    "aria-expanded",
    String(state.isTemplatePickerOpen)
  );
  if (elements.templatePickerToggleLabel) {
    elements.templatePickerToggleLabel.textContent = state.isTemplatePickerOpen
      ? "收起模板"
      : "更换模板";
  }
  elements.templatePickerPanel?.classList.toggle(
    "hidden",
    !state.isTemplatePickerOpen
  );
}

export function renderTemplatePicker() {
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
    renderCurrentTemplateSummary();
    elements.coverTemplateList.scrollTop = currentScrollTop;
    return;
  }

  existingButtons.forEach((button, index) => {
    const template = CARD_TEMPLATES[index];
    if (!template) {
      return;
    }
    syncTemplateOptionButton(button, template);
  });

  syncTemplatePickerSelection();
  renderCurrentTemplateSummary();
}

export function applyCoverPreviewTemplate(template) {
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

function ensureMeasurementLayer() {
  if (runtime.paginationMeasure) {
    return runtime.paginationMeasure;
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

  runtime.paginationMeasure = {
    container,
    card: container.querySelector(".preview-card-body"),
    title: container.querySelector(".preview-page-title"),
    article: container.querySelector(".preview-page-article"),
    pageNumber: container.querySelector(".preview-page-footer-number"),
  };

  return runtime.paginationMeasure;
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
  card.dataset.bodyLayout = getEffectiveBodyLayout(parsed);
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

function getFragmentUnits(text) {
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
  const units = getFragmentUnits(segment.text);
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

export function paginateBodyContent(parsed) {
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

export function renderPageInto(
  card,
  parsed,
  fragments,
  pageNumber,
  totalPages
) {
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

export function updateBodyPaginationUi(pages) {
  const totalPages = pages.length;
  const safeIndex = Math.min(
    Math.max(state.currentBodyPage, 0),
    totalPages - 1
  );
  state.currentBodyPage = safeIndex;

  renderPageInto(
    elements.bodyPreviewCard,
    runtime.lastParsed,
    pages[safeIndex],
    safeIndex + 1,
    totalPages
  );

  elements.bodyPageIndicator.textContent = `Page ${safeIndex + 1} / ${totalPages}`;
  elements.bodyPrevPageButton.disabled = safeIndex === 0;
  elements.bodyNextPageButton.disabled = safeIndex === totalPages - 1;
}

export function renderTypography() {
  const fontFamily = getActiveFontFamily();
  elements.coverTitle.style.fontFamily = fontFamily;
  elements.coverTitle.style.fontSize = `${getCoverTitleSize()}px`;
  elements.coverHighlights.style.fontFamily = fontFamily;
  elements.coverHighlights.style.fontSize = `${getCoverHighlightsSize()}px`;
  elements.editorInput.style.fontFamily = fontFamily;
  elements.fontFamilySelect.value = state.fontFamily;
  elements.coverTitleSizeValue.textContent = `${state.coverTitleSize}px`;
  elements.coverTitleSizeRange.value = String(state.coverTitleSize);
  elements.coverHighlightsSizeValue.textContent = `${state.coverHighlightsSize}px`;
  elements.coverHighlightsSizeRange.value = String(state.coverHighlightsSize);
  elements.bodyTitleSizeValue.textContent = `${state.bodyTitleSize}px`;
  elements.bodyTitleSizeRange.value = String(state.bodyTitleSize);
  elements.bodyTextSizeValue.textContent = `${state.bodyTextSize}px`;
  elements.bodyTextSizeRange.value = String(state.bodyTextSize);
}
