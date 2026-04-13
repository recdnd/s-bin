import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

const PDFJS_VERSION = "4.4.168";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;

/**
 * 由頁面路徑推導公開 PDF 路徑：/career/engineer-1-on-1 → /files/career/engineer-1-on-1.pdf
 * 下載與抬頭用的「原檔名」：優先讀取 <body data-pdf-original-name="...">
 */
function resolvePdfConfig() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) {
    return { pdfUrl: null, originalName: null };
  }
  const category = segments[0];
  const slug = segments[1];
  if (category === "files") {
    return { pdfUrl: null, originalName: null };
  }
  const pdfUrl = `/files/${category}/${slug}.pdf`;
  const fromDataset = document.body?.dataset?.pdfOriginalName?.trim();
  const originalName = fromDataset || `${slug}.pdf`;
  return { pdfUrl, originalName };
}

let PDF_URL = "";
let PDF_ORIGINAL_NAME = "";

const state = {
  pdfDoc: null,
  pageNum: 1,
  pageCount: 0,
  rendering: false,
  pendingPage: null,
  touchStartX: 0,
};

const filenameButton = document.getElementById("filenameButton");
const statusEl = document.getElementById("status");
const canvas = document.getElementById("pdfCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const pageIndicator = document.getElementById("pageIndicator");
const prevHotzone = document.getElementById("prevHotzone");
const nextHotzone = document.getElementById("nextHotzone");
const viewer = document.getElementById("viewer");
const downloadButton = document.getElementById("downloadButton");

function applyPdfUi() {
  filenameButton.textContent = PDF_ORIGINAL_NAME;
  downloadButton.setAttribute("href", PDF_URL);
  downloadButton.setAttribute("download", PDF_ORIGINAL_NAME);
  document.title = PDF_ORIGINAL_NAME;
}

function showLoading() {
  statusEl.style.display = "block";
  statusEl.textContent = "loading...";
  canvas.style.display = "none";
}

function showError() {
  statusEl.style.display = "block";
  statusEl.textContent = "";
  const lead = document.createTextNode("failed to load. ");
  statusEl.appendChild(lead);
  if (PDF_URL) {
    const a = document.createElement("a");
    a.href = PDF_URL;
    a.setAttribute("download", PDF_ORIGINAL_NAME);
    a.textContent = "download";
    statusEl.appendChild(a);
  }
  canvas.style.display = "none";
}

function getPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = Number.parseInt(params.get("page") || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function setPageInUrl(page) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  window.history.replaceState({}, "", url);
}

function clampPage(page) {
  if (!state.pageCount) return 1;
  return Math.min(Math.max(page, 1), state.pageCount);
}

function updatePageIndicator() {
  pageIndicator.textContent = `${state.pageNum} / ${state.pageCount}`;
}

function queueRenderPage(pageNum) {
  if (state.rendering) {
    state.pendingPage = pageNum;
    return;
  }
  void renderPage(pageNum);
}

async function renderPage(pageNum) {
  if (!state.pdfDoc) return;

  state.rendering = true;
  state.pageNum = clampPage(pageNum);
  updatePageIndicator();
  setPageInUrl(state.pageNum);

  try {
    const page = await state.pdfDoc.getPage(state.pageNum);

    const viewerWidth = viewer.clientWidth || 800;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const deviceRatio = window.devicePixelRatio || 1;

    const cssScale = viewerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: cssScale * deviceRatio });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / deviceRatio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / deviceRatio)}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });
    await renderTask.promise;

    statusEl.style.display = "none";
    canvas.style.display = "block";
  } catch (error) {
    console.error(error);
    showError();
  } finally {
    state.rendering = false;

    if (state.pendingPage !== null) {
      const nextPending = state.pendingPage;
      state.pendingPage = null;
      queueRenderPage(nextPending);
    }
  }
}

function goToPage(page) {
  const nextPage = clampPage(page);
  if (nextPage === state.pageNum && state.pdfDoc) return;
  queueRenderPage(nextPage);
}

function goPrev() {
  if (state.pageNum <= 1) return;
  goToPage(state.pageNum - 1);
}

function goNext() {
  if (state.pageNum >= state.pageCount) return;
  goToPage(state.pageNum + 1);
}

async function init() {
  showLoading();

  const resolved = resolvePdfConfig();
  PDF_URL = resolved.pdfUrl || "";
  PDF_ORIGINAL_NAME = resolved.originalName || "";

  if (!PDF_URL || !filenameButton || !downloadButton) {
    statusEl.textContent = "failed to load.";
    canvas.style.display = "none";
    return;
  }

  applyPdfUi();

  const initialPage = getPageFromUrl();

  try {
    const loadingTask = pdfjsLib.getDocument(PDF_URL);
    state.pdfDoc = await loadingTask.promise;
    state.pageCount = state.pdfDoc.numPages;
    state.pageNum = clampPage(initialPage ?? 1);
    updatePageIndicator();
    await renderPage(state.pageNum);
  } catch (error) {
    console.error(error);
    showError();
  }
}

prevButton.addEventListener("click", goPrev);
nextButton.addEventListener("click", goNext);
prevHotzone.addEventListener("click", goPrev);
nextHotzone.addEventListener("click", goNext);

filenameButton.addEventListener("click", () => {
  if (state.pageNum !== 1) queueRenderPage(1);
});

window.addEventListener("keydown", (event) => {
  if (!state.pdfDoc) return;
  if (event.defaultPrevented) return;
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      goPrev();
      break;
    case "ArrowRight":
      event.preventDefault();
      goNext();
      break;
    case "Home":
      event.preventDefault();
      if (state.pageNum !== 1) queueRenderPage(1);
      break;
    case "End":
      event.preventDefault();
      if (state.pageNum !== state.pageCount) queueRenderPage(state.pageCount);
      break;
    case "d":
    case "D":
      event.preventDefault();
      downloadButton.click();
      break;
    default:
      break;
  }
});

viewer.addEventListener(
  "touchstart",
  (event) => {
    if (!event.changedTouches[0]) return;
    state.touchStartX = event.changedTouches[0].clientX;
  },
  { passive: true }
);

viewer.addEventListener(
  "touchend",
  (event) => {
    if (!event.changedTouches[0]) return;
    const deltaX = event.changedTouches[0].clientX - state.touchStartX;
    const threshold = 40;

    if (Math.abs(deltaX) < threshold) return;

    if (deltaX < 0) {
      goNext();
    } else {
      goPrev();
    }
  },
  { passive: true }
);

let resizeRaf = null;
window.addEventListener("resize", () => {
  if (!state.pdfDoc) return;
  if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    queueRenderPage(state.pageNum);
  });
});

void init();
