"use strict";

const SAMPLE_PRESETS = [
  { id: "exam-a", name: "Exam Form A", description: "Sample preset · Exam application", photo: { width: 3.5, height: 4.5, maxKB: 50 }, signature: { width: 3.5, height: 1.5, maxKB: 20 }, format: "image/jpeg", builtin: true },
  { id: "exam-b", name: "Exam Form B", description: "Sample preset · Exam application", photo: { width: 3.5, height: 4.5, maxKB: 100 }, signature: { width: 3.5, height: 1.5, maxKB: 30 }, format: "image/jpeg", builtin: true },
  { id: "job-app", name: "Job Application", description: "Sample preset · Recruitment", photo: { width: 3.5, height: 4.5, maxKB: 200 }, signature: { width: 3.5, height: 1.5, maxKB: 50 }, format: "image/jpeg", builtin: true }
];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 20_000_000;
const MAX_OUTPUT_EDGE = 16_000;
const state = {
  customPresets: loadCustomPresets(),
  selectedPresetId: "exam-a",
  photo: null,
  signature: null,
  photoResult: null,
  signatureResult: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  drag: null,
  toastTimer: null
};
const $ = (id) => document.getElementById(id);
const elements = {
  presetSelect: $("presetSelect"), photoInput: $("photoInput"), signatureInput: $("signatureInput"),
  cropCanvas: $("cropCanvas"), cropGuide: $("cropGuide"), cropHint: $("cropHint"),
  cropPlaceholder: $("cropPlaceholder"), cropperWrap: $("cropperWrap"), zoom: $("zoomControl"),
  zoomValue: $("zoomValue"), dpi: $("dpiInput"), signatureImg: $("signaturePreviewImage"),
  signatureEmpty: $("signaturePreviewEmpty"), toast: $("toast")
};
let toastTimer;

function loadCustomPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem("form-photo-fixer-presets") || "[]");
    if (!Array.isArray(saved)) throw new Error("Saved presets are not a list.");
    return saved.filter(isValidPreset).map((preset) => ({ ...preset, builtin: false }));
  } catch (error) {
    console.warn("Could not load custom presets:", error);
    return [];
  }
}

function refreshProgress() {
  const processed = Number(Boolean(state.photoResult)) + Number(Boolean(state.signatureResult));
  setStep(processed === 2 ? 4 : processed === 1 ? 3 : state.photo || state.signature ? 2 : 1);
}

function isValidPreset(preset) {
  return preset && typeof preset.id === "string" && typeof preset.name === "string" &&
    [preset.photo, preset.signature].every((item) => item &&
      Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0 &&
      Number.isFinite(item.maxKB) && item.maxKB > 0) &&
    ["image/jpeg", "image/png"].includes(preset.format);
}

function saveCustomPresets() {
  try {
    localStorage.setItem("form-photo-fixer-presets", JSON.stringify(state.customPresets));
  } catch (error) {
    showToast("Could not save your preset. Check browser storage availability.");
    console.error("Could not save custom presets:", error);
  }
}

function allPresets() { return [...SAMPLE_PRESETS, ...state.customPresets]; }
function selectedPreset() { return allPresets().find((preset) => preset.id === state.selectedPresetId) || SAMPLE_PRESETS[0]; }
function fileSize(bytes) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`; }
function dimensionsFor(spec) {
  const dpi = Math.min(1200, Math.max(30, Number(elements.dpi.value) || 300));
  return { width: Math.max(1, Math.round(spec.width / 2.54 * dpi)), height: Math.max(1, Math.round(spec.height / 2.54 * dpi)) };
}
function formatName(type) { return type === "image/png" ? "PNG" : "JPG"; }
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function initialize() {
  populatePresets();
  renderCustomPresets();
  updateRequirements();
  refreshProgress();
  elements.presetSelect.addEventListener("change", () => {
    state.selectedPresetId = elements.presetSelect.value;
    invalidateResults();
    updateRequirements();
    renderCustomPresets();
    renderCrop();
  });
  setupUpload("photo", elements.photoInput, $("photoDrop"));
  setupUpload("signature", elements.signatureInput, $("signatureDrop"));
  $("resetCrop").addEventListener("click", resetCrop);
  elements.zoom.addEventListener("input", () => { state.zoom = Number(elements.zoom.value); elements.zoomValue.textContent = `${state.zoom.toFixed(1)}×`; clampOffset(); renderCrop(); invalidatePhotoResult(); });
  $("zoomIn").addEventListener("click", () => setZoom(Math.min(3, state.zoom + 0.1)));
  $("zoomOut").addEventListener("click", () => setZoom(Math.max(1, state.zoom - 0.1)));
  elements.dpi.addEventListener("change", () => { elements.dpi.value = String(Math.min(1200, Math.max(30, Number(elements.dpi.value) || 300))); updateRequirements(); invalidateResults(); });
  $("processPhoto").addEventListener("click", () => processAndDisplay("photo"));
  $("processSignature").addEventListener("click", () => processAndDisplay("signature"));
  $("downloadPhoto").addEventListener("click", () => downloadResult("photo"));
  $("downloadSignature").addEventListener("click", () => downloadResult("signature"));
  $("downloadAll").addEventListener("click", downloadAll);
  $("addPresetButton").addEventListener("click", () => openPresetEditor());
  $("closePresetEditor").addEventListener("click", closePresetEditor);
  $("cancelPreset").addEventListener("click", closePresetEditor);
  $("presetForm").addEventListener("submit", savePresetFromForm);
  bindCanvasDrag();
  window.addEventListener("resize", renderCrop);
}

function populatePresets() {
  const current = state.selectedPresetId;
  elements.presetSelect.replaceChildren();
  const samples = document.createElement("optgroup");
  samples.label = "Sample presets";
  SAMPLE_PRESETS.forEach((preset) => samples.append(new Option(preset.name, preset.id)));
  elements.presetSelect.append(samples);
  if (state.customPresets.length) {
    const custom = document.createElement("optgroup");
    custom.label = "My custom presets";
    state.customPresets.forEach((preset) => custom.append(new Option(preset.name, preset.id)));
    elements.presetSelect.append(custom);
  }
  elements.presetSelect.value = allPresets().some((preset) => preset.id === current) ? current : "exam-a";
  state.selectedPresetId = elements.presetSelect.value;
}

function updateRequirements() {
  const preset = selectedPreset();
  $("presetDescription").textContent = preset.builtin
    ? "Sample requirements — confirm the exact specifications in your application notice."
    : "Your custom preset — adjust any values in Custom Presets.";
  $("photoPresetSize").textContent = `${preset.photo.width} × ${preset.photo.height} cm`;
  $("signaturePresetSize").textContent = `${preset.signature.width} × ${preset.signature.height} cm`;
  $("photoOrientation").textContent = preset.photo.width >= preset.photo.height ? "Landscape" : "Portrait";
  $("signatureOrientation").textContent = preset.signature.width >= preset.signature.height ? "Landscape" : "Portrait";
  $("photoMax").textContent = `${preset.photo.maxKB} KB`;
  $("signatureMax").textContent = `${preset.signature.maxKB} KB`;
  const photo = dimensionsFor(preset.photo);
  const signature = dimensionsFor(preset.signature);
  $("photoDimensions").textContent = `${photo.width} × ${photo.height} px`;
  $("signatureDimensions").textContent = `${signature.width} × ${signature.height} px`;
}

function setupUpload(kind, input, dropzone) {
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) acceptFile(kind, file);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropzone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault(); dropzone.classList.remove("drag-over");
  }));
  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) acceptFile(kind, file);
  });
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.click(); }
  });
}

function acceptFile(kind, file) {
  if (!["image/jpeg", "image/png"].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name)) {
    showToast("Please choose a JPG, JPEG, or PNG image.");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast("That image is larger than 20 MB. Choose a smaller file.");
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight) {
      URL.revokeObjectURL(url);
      showToast("This image could not be decoded. Try a different file.");
      return;
    }
    removeFile(kind, false);
    state[kind] = { file, image, url, width: image.naturalWidth, height: image.naturalHeight };
    if (kind === "photo") {
      state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
      elements.zoom.value = "1"; elements.zoomValue.textContent = "1.0×";
      elements.cropCanvas.classList.remove("hidden");
      elements.cropPlaceholder.classList.add("hidden");
      elements.cropGuide.classList.remove("hidden");
      elements.cropHint.classList.remove("hidden");
      $("resetCrop").disabled = false; elements.zoom.disabled = false;
      $("zoomIn").disabled = false; $("zoomOut").disabled = false;
      renderCrop();
    } else {
      elements.signatureImg.src = url;
      elements.signatureImg.classList.remove("hidden");
      elements.signatureEmpty.classList.add("hidden");
    }
    renderFileCard(kind);
    invalidateKind(kind);
    refreshProgress();
  };
  image.onerror = () => { URL.revokeObjectURL(url); showToast("This image could not be opened. Try a different JPG or PNG."); };
  image.src = url;
}

function renderFileCard(kind) {
  const data = state[kind];
  const card = $(`${kind}FileCard`);
  const thumb = kind === "photo" ? `<img class="mini-thumb" src="${data.url}" alt="">` : `<img class="mini-thumb" src="${data.url}" alt="" style="object-fit:contain">`;
  card.innerHTML = `${thumb}<div class="file-meta"><div class="file-name" title="${escapeHtml(data.file.name)}">${escapeHtml(data.file.name)}</div><div class="file-info">${data.width} × ${data.height} px · ${fileSize(data.file.size)}</div></div><div class="file-actions"><button type="button" data-action="replace" aria-label="Replace ${kind}">↻</button><button type="button" data-action="remove" aria-label="Remove ${kind}">×</button></div>`;
  card.classList.remove("hidden");
  card.querySelector('[data-action="replace"]').addEventListener("click", () => $(`${kind}Input`).click());
  card.querySelector('[data-action="remove"]').addEventListener("click", () => removeFile(kind));
  $(`${kind}Drop`).classList.add("hidden");
}

function removeFile(kind, clearInput = true) {
  const old = state[kind];
  if (old) URL.revokeObjectURL(old.url);
  state[kind] = null;
  if (clearInput) $(`${kind}Input`).value = "";
  $(`${kind}FileCard`).classList.add("hidden");
  $(`${kind}Drop`).classList.remove("hidden");
  invalidateKind(kind);
  if (kind === "photo") {
    elements.cropCanvas.classList.add("hidden"); elements.cropPlaceholder.classList.remove("hidden");
    elements.cropGuide.classList.add("hidden"); elements.cropHint.classList.add("hidden");
    $("resetCrop").disabled = true; elements.zoom.disabled = true;
    $("zoomIn").disabled = true; $("zoomOut").disabled = true;
  } else {
    elements.signatureImg.removeAttribute("src"); elements.signatureImg.classList.add("hidden");
    elements.signatureEmpty.classList.remove("hidden");
  }
}

function cropGeometry() {
  const preset = selectedPreset();
  const { width, height } = dimensionsFor(preset.photo);
  const rect = elements.cropperWrap.getBoundingClientRect();
  const ratio = width / height;
  let canvasWidth = rect.width;
  let canvasHeight = canvasWidth / ratio;
  if (canvasHeight > rect.height) { canvasHeight = rect.height; canvasWidth = canvasHeight * ratio; }
  return { width: Math.max(1, Math.round(canvasWidth * (window.devicePixelRatio || 1))), height: Math.max(1, Math.round(canvasHeight * (window.devicePixelRatio || 1))), cssWidth: canvasWidth, cssHeight: canvasHeight, targetWidth: width, targetHeight: height };
}

function renderCrop() {
  if (!state.photo) return;
  const geometry = cropGeometry();
  const canvas = elements.cropCanvas;
  canvas.width = geometry.width; canvas.height = geometry.height;
  canvas.style.width = `${geometry.cssWidth}px`; canvas.style.height = `${geometry.cssHeight}px`;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const image = state.photo.image;
  const coverScale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const scale = coverScale * state.zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (canvas.width - drawWidth) / 2 + state.offsetX * canvas.width;
  const y = (canvas.height - drawHeight) / 2 + state.offsetY * canvas.height;
  context.fillStyle = "#eef1f6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, drawWidth, drawHeight);
  updateRequirements();
}

function clampOffset() {
  if (!state.photo) return;
  const geometry = cropGeometry();
  const cover = Math.max(geometry.width / state.photo.width, geometry.height / state.photo.height) * state.zoom;
  const overflowX = Math.max(0, state.photo.width * cover - geometry.width) / 2;
  const overflowY = Math.max(0, state.photo.height * cover - geometry.height) / 2;
  state.offsetX = Math.max(-overflowX / geometry.width, Math.min(overflowX / geometry.width, state.offsetX));
  state.offsetY = Math.max(-overflowY / geometry.height, Math.min(overflowY / geometry.height, state.offsetY));
}

function bindCanvasDrag() {
  const canvas = elements.cropCanvas;
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.photo) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
    state.drag = { x: event.clientX, y: event.clientY, offsetX: state.offsetX, offsetY: state.offsetY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    const rect = canvas.getBoundingClientRect();
    state.offsetX = state.drag.offsetX + (event.clientX - state.drag.x) / rect.width;
    state.offsetY = state.drag.offsetY + (event.clientY - state.drag.y) / rect.height;
    clampOffset(); renderCrop(); invalidatePhotoResult();
  });
  const endDrag = () => { state.drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

function setZoom(value) {
  state.zoom = Number(value.toFixed(2));
  elements.zoom.value = String(state.zoom);
  elements.zoomValue.textContent = `${state.zoom.toFixed(1)}×`;
  clampOffset(); renderCrop(); invalidatePhotoResult();
}

function resetCrop() {
  state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
  elements.zoom.value = "1"; elements.zoomValue.textContent = "1.0×";
  renderCrop(); invalidatePhotoResult();
}

function invalidateKind(kind) {
  if (kind === "photo") {
    state.photoResult = null; updateOutputCard("photo", null);
    $("downloadPhoto").disabled = true;
    $("processPhoto").disabled = !state.photo;
  } else {
    state.signatureResult = null; updateOutputCard("signature", null);
    $("downloadSignature").disabled = true;
    $("processSignature").disabled = !state.signature;
  }
  $("downloadAll").disabled = !(state.photoResult && state.signatureResult);
  refreshProgress();
}
function invalidatePhotoResult() { if (state.photoResult) invalidateKind("photo"); }
function invalidateResults() { invalidateKind("photo"); invalidateKind("signature"); }

function updateOutputCard(kind, result, error = "") {
  const prefix = kind === "photo" ? "photo" : "signature";
  const status = $(`${prefix}Status`);
  const sizeLabel = $(`${prefix}SizeLabel`);
  const fill = $(`${prefix}SizeFill`);
  const validation = $(`${prefix}Validation`);
  validation.classList.add("hidden");
  status.className = "status-text";
  fill.classList.remove("over");
  if (error) {
    status.textContent = "Needs attention"; status.classList.add("error");
    sizeLabel.textContent = "Could not meet file-size limit";
    validation.textContent = error; validation.classList.remove("hidden"); validation.classList.add("error-detail");
    fill.style.width = "100%"; fill.classList.add("over");
  } else if (result) {
    status.textContent = "Ready"; status.classList.add("success");
    sizeLabel.textContent = `${fileSize(result.blob.size)} of ${result.maxKB} KB`;
    const ratio = result.blob.size / (result.maxKB * 1024);
    fill.style.width = `${Math.max(3, Math.min(100, ratio * 100))}%`;
    fill.classList.remove("over"); validation.classList.remove("hidden"); validation.classList.remove("error-detail");
    validation.textContent = `${result.width} × ${result.height} px · ${formatName(result.blob.type)} · Actual file size ${fileSize(result.blob.size)}. Meets the ${result.maxKB} KB limit.`;
  } else {
    status.textContent = "Waiting"; sizeLabel.textContent = "No file processed"; fill.style.width = "0";
  }
}

async function processImage(kind) {
  const source = state[kind];
  if (!source) throw new Error(`Upload your ${kind === "photo" ? "photograph" : "signature"} first.`);
  const preset = selectedPreset();
  const spec = preset[kind];
  const dimensions = dimensionsFor(spec);
  if (dimensions.width > MAX_OUTPUT_EDGE || dimensions.height > MAX_OUTPUT_EDGE ||
      dimensions.width * dimensions.height > MAX_OUTPUT_PIXELS) {
    throw new Error("These output dimensions are too large for safe browser processing. Lower the DPI or preset dimensions.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { alpha: preset.format === "image/png" });
  if (!context) throw new Error("Your browser could not create an image canvas.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (preset.format !== "image/png") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
  if (kind === "photo") drawPhotoCrop(context, canvas.width, canvas.height);
  else drawSignature(context, source.image, canvas.width, canvas.height);
  const blob = await compressCanvas(canvas, preset.format, spec.maxKB);
  return { blob, width: canvas.width, height: canvas.height, maxKB: spec.maxKB };
}

function drawPhotoCrop(context, targetWidth, targetHeight) {
  const source = state.photo;
  const scale = Math.max(targetWidth / source.width, targetHeight / source.height) * state.zoom;
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  const x = (targetWidth - drawWidth) / 2 + state.offsetX * targetWidth;
  const y = (targetHeight - drawHeight) / 2 + state.offsetY * targetHeight;
  context.drawImage(source.image, x, y, drawWidth, drawHeight);
}

function drawSignature(context, image, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) reject(new Error("Your browser could not encode this image."));
    else resolve(blob);
  }, type, quality));
}

async function compressCanvas(canvas, type, maxKB) {
  const maxBytes = maxKB * 1024;
  if (type === "image/png") {
    const blob = await canvasBlob(canvas, type);
    if (blob.size >= maxBytes) throw new Error(`PNG output is ${fileSize(blob.size)} and is not below the ${maxKB} KB limit. Select JPEG or a larger limit.`);
    return blob;
  }
  for (let quality = 0.94; quality >= 0.1; quality = Math.max(0.1, Number((quality - 0.06).toFixed(2)))) {
    const blob = await canvasBlob(canvas, "image/jpeg", quality);
    if (blob.size < maxBytes) return blob;
    if (quality === 0.1) break;
  }
  throw new Error(`Could not reduce this image below ${maxKB} KB at the required dimensions. Try a larger limit or a simpler crop.`);
}

async function processAndDisplay(kind) {
  const button = $(`process${kind === "photo" ? "Photo" : "Signature"}`);
  const originalText = button.innerHTML;
  button.disabled = true; button.innerHTML = '<span>◌</span> Processing…';
  const status = $(`${kind}Status`);
  status.textContent = "Compressing"; status.className = "status-text processing";
  try {
    const result = await processImage(kind);
    if (kind === "photo") state.photoResult = result; else state.signatureResult = result;
    updateOutputCard(kind, result);
    $(`download${kind === "photo" ? "Photo" : "Signature"}`).disabled = false;
    button.disabled = false;
    button.innerHTML = originalText;
    $("downloadAll").disabled = !(state.photoResult && state.signatureResult);
    refreshProgress();
    return result;
  } catch (error) {
    updateOutputCard(kind, null, error.message);
    showToast(error.message);
    button.disabled = !(kind === "photo" ? state.photo : state.signature);
    $(`download${kind === "photo" ? "Photo" : "Signature"}`).disabled = true;
    button.innerHTML = originalText;
    return null;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadResult(kind) {
  const result = kind === "photo" ? state.photoResult : state.signatureResult;
  if (!result) { showToast("Compress and validate this image before downloading."); return; }
  const suffix = selectedPreset().format === "image/png" ? "png" : "jpg";
  downloadBlob(result.blob, `candidate_${kind}.${suffix}`);
}

async function downloadAll() {
  if (!state.photo || !state.signature) { showToast("Upload both a photo and a signature first."); return; }
  const photo = state.photoResult || await processAndDisplay("photo");
  if (!photo) return;
  const signature = state.signatureResult || await processAndDisplay("signature");
  if (!signature) return;
  downloadBlob(photo.blob, `candidate_photo.${selectedPreset().format === "image/png" ? "png" : "jpg"}`);
  setTimeout(() => downloadBlob(signature.blob, `candidate_signature.${selectedPreset().format === "image/png" ? "png" : "jpg"}`), 250);
  showToast("Both validated files are downloading.");
}

function setStep(step) {
  const nodes = document.querySelectorAll(".steps .step");
  nodes.forEach((node, index) => {
    node.classList.toggle("active", index < step);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3800);
}

function openPresetEditor(preset = null) {
  const editor = $("presetEditor");
  editor.classList.remove("hidden");
  $("presetEditorTitle").textContent = preset ? "Edit your custom preset" : "Create a custom preset";
  $("editingPresetId").value = preset ? preset.id : "";
  $("customName").value = preset ? preset.name : "";
  $("customPhotoWidth").value = preset ? preset.photo.width : 3.5;
  $("customPhotoHeight").value = preset ? preset.photo.height : 4.5;
  $("customPhotoMax").value = preset ? preset.photo.maxKB : 50;
  $("customSignatureWidth").value = preset ? preset.signature.width : 3.5;
  $("customSignatureHeight").value = preset ? preset.signature.height : 1.5;
  $("customSignatureMax").value = preset ? preset.signature.maxKB : 20;
  $("customFormat").value = preset ? preset.format : "image/jpeg";
  editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closePresetEditor() { $("presetEditor").classList.add("hidden"); $("presetForm").reset(); $("editingPresetId").value = ""; }

function savePresetFromForm(event) {
  event.preventDefault();
  const id = $("editingPresetId").value;
  const preset = {
    id: id || `custom-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`,
    name: $("customName").value.trim(),
    description: "Custom application requirements",
    photo: { width: Number($("customPhotoWidth").value), height: Number($("customPhotoHeight").value), maxKB: Number($("customPhotoMax").value) },
    signature: { width: Number($("customSignatureWidth").value), height: Number($("customSignatureHeight").value), maxKB: Number($("customSignatureMax").value) },
    format: $("customFormat").value,
    builtin: false
  };
  if (!isValidPreset(preset)) { showToast("Check the name, dimensions, file-size limits, and output format."); return; }
  const duplicate = state.customPresets.some((item) => item.name.toLowerCase() === preset.name.toLowerCase() && item.id !== preset.id);
  if (duplicate) { showToast("A custom preset with that name already exists."); return; }
  if (id) state.customPresets = state.customPresets.map((item) => item.id === id ? preset : item);
  else state.customPresets.push(preset);
  saveCustomPresets();
  populatePresets(); renderCustomPresets();
  elements.presetSelect.value = preset.id; state.selectedPresetId = preset.id;
  invalidateResults(); updateRequirements(); renderCrop();
  closePresetEditor();
  showToast(id ? "Preset updated." : "Custom preset saved.");
}

function renderCustomPresets() {
  const container = $("customPresetsList");
  container.replaceChildren();
  state.customPresets.forEach((preset) => {
    const chip = document.createElement("div");
    chip.className = "custom-preset-chip";
    chip.innerHTML = `<strong>${escapeHtml(preset.name)}</strong><span>Photo ${escapeHtml(preset.photo.width)} × ${escapeHtml(preset.photo.height)} cm · ${escapeHtml(preset.photo.maxKB)} KB</span><div class="custom-preset-actions"><button type="button" data-action="edit" aria-label="Edit ${escapeHtml(preset.name)}">✎</button><button type="button" data-action="delete" aria-label="Delete ${escapeHtml(preset.name)}">×</button></div>`;
    chip.querySelector('[data-action="edit"]').addEventListener("click", () => openPresetEditor(preset));
    chip.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (!window.confirm(`Delete the "${preset.name}" preset?`)) return;
      state.customPresets = state.customPresets.filter((item) => item.id !== preset.id);
      if (state.selectedPresetId === preset.id) { state.selectedPresetId = "exam-a"; invalidateResults(); }
      saveCustomPresets(); populatePresets(); updateRequirements(); renderCrop(); renderCustomPresets();
      showToast("Custom preset deleted.");
    });
    container.append(chip);
  });
}

initialize();
