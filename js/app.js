import { FILTERS, applyAdjust } from './filters.js';
import { TEMPLATES, drawTemplateThumb, heartPath, sparklePath } from './templates.js';
import { POST_EFFECTS, PostFx } from './post.js';
import { AR_EFFECTS, drawAR, faceMetrics } from './ar.js';
import { loadFace, detectFaces, resetFaceSmoothing, faceState } from './face.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const mk = () => document.createElement('canvas');

// ───────── キャンバス構成 ─────────
// srcC: 元素材(ミラー込み) → glfx(加工) → out: [モザイク] → 書き込み → テンプレート
const out = $('#out');
const octx = out.getContext('2d');
const srcC = mk(), maskC = mk(), drawC = mk(), tmpC = mk(), smallC = mk();
const sctx = srcC.getContext('2d'), mctx = maskC.getContext('2d'), dctx = drawC.getContext('2d');
const tctx = tmpC.getContext('2d'), smctx = smallC.getContext('2d');
const camVideo = $('#camVideo'), fileVideo = $('#fileVideo');

const MAX_PHOTO = 1920, MAX_VIDEO = 1280;
const COLORS = ['#ff4fa3', '#ff9ac7', '#ffffff', '#ffe14d', '#7be0ff', '#a98bff', '#6ee7a8', '#222222'];
const SPARKLE_COLORS = ['#ffffff', '#fff3b0', '#ffd0e6', '#d6ecff', '#e3d4ff'];
const FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif';

const state = {
  mode: 'photo', tool: 'filter',
  W: 0, H: 0, kind: null, source: null, mirror: false, facing: 'user',
  filter: FILTERS[0], adj: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0, vignette: 0 },
  effect: POST_EFFECTS[0], effectAmt: 1,
  ar: AR_EFFECTS[0], beauty: { slim: 0, eyes: 0 }, faces: [], srcId: 0, facesFor: -1,
  template: TEMPLATES[0],
  mosaic: { shape: 'brush', style: 'pixel', mode: 'paint', block: 20, brush: 50, any: false },
  draw: { tool: 'pen', penType: 'normal', stamp: '♡', textStyle: 'pop', color: COLORS[0], size: 14 },
  dirty: true, exporting: false, snapshotJustTaken: false,
};

let glc = null, tex = null, glFailed = false, post = null;

// ───────── ユーティリティ ─────────
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ───────── ソース/サイズ ─────────
const undoStack = [];

function setSize(w, h, keepLayers) {
  const changed = w !== state.W || h !== state.H;
  state.W = w; state.H = h;
  if (changed) for (const c of [srcC, out, tmpC]) { c.width = w; c.height = h; }
  if (changed || !keepLayers) {
    for (const c of [maskC, drawC]) { c.width = w; c.height = h; }
    state.mosaic.any = false; undoStack.length = 0; refreshUndo();
  }
}

function setSource(kind, source, w, h, keepLayers = false) {
  state.kind = kind; state.source = source;
  state.srcId++; state.faces = []; resetFaceSmoothing();
  setSize(w, h, keepLayers);
  $('#empty').classList.add('hide'); out.classList.add('show');
  if (kind === 'image') drawSource();
  state.dirty = true;
  if (kind === 'image') buildThumbs(); else setTimeout(buildThumbs, 400);
}

function drawSource() {
  const { W, H, source, mirror } = state;
  sctx.save();
  if (mirror) { sctx.translate(W, 0); sctx.scale(-1, 1); }
  sctx.drawImage(source, 0, 0, W, H);
  sctx.restore();
}

function clearSource() {
  state.kind = null; state.source = null;
  out.classList.remove('show'); $('#empty').classList.remove('hide');
}

function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

// ───────── 描画パイプライン ─────────
function ensureGL() {
  if (glc || glFailed) return;
  try { glc = fx.canvas(); tex = glc.texture(srcC); }
  catch (e) { glFailed = true; toast('WebGL が使えないため加工フィルターは無効です'); return; }
  try { post = new PostFx(); } catch (e) { console.warn('post effects disabled', e); }
}

function render() {
  if (!state.source) return;
  const { W, H } = state;
  if (state.kind !== 'image') drawSource();
  ensureGL();
  updateFaces();
  let base = srcC;
  const t = performance.now() / 1000;
  if (glc) {
    tex.loadContentsOf(srcC);
    glc.draw(tex);
    state.filter.apply(glc, W, H);
    applyBeauty(glc, W, H);
    applyAdjust(glc, state.adj, W, H);
    glc.update();
    base = glc;
  }
  if (post && state.effect.mode) base = post.render(base, W, H, state.effect.mode, t, state.effectAmt);
  octx.drawImage(base, 0, 0, W, H);
  if (state.mosaic.any) applyMosaic();
  if (state.ar.draw && state.faces.length) drawAR(octx, state.ar, state.faces, W, H, t);
  octx.drawImage(drawC, 0, 0);
  state.template.draw(octx, W, H, t);
}

// ───────── 顔認識(AR・美容補正) ─────────
let faceFrame = 0, faceAsked = false;
const wantFaces = () => state.ar.id !== 'none' || state.beauty.slim > 0 || state.beauty.eyes > 0;

function updateFaces() {
  if (!wantFaces()) { state.faces = []; return; }
  if (!faceState.ready) {
    if (!faceAsked) {
      faceAsked = true;
      toast('顔認識を準備中…(初回のみ数秒かかります)', 4000);
      loadFace().then(() => {
        if (faceState.failed) toast('顔認識を読み込めませんでした', 4000);
        state.facesFor = -1; state.dirty = true;
      });
    }
    return;
  }
  if (state.kind === 'image') {
    if (state.facesFor !== state.srcId) {
      state.faces = detectFaces(srcC, false); state.facesFor = state.srcId;
      if (!state.faces.length) toast('顔が見つかりませんでした', 3000);
    }
  } else if ((faceFrame++ & 1) === 0) {
    state.faces = detectFaces(srcC, true);
  }
}

function applyBeauty(c, W, H) {
  const { slim, eyes } = state.beauty;
  if (!state.faces.length || (!slim && !eyes)) return;
  for (const lm of state.faces) {
    const g = faceMetrics(lm, W, H);
    if (eyes) for (const e of [g.eyeL, g.eyeR]) c.bulgePinch(e.x, e.y, g.fw * 0.16, eyes * 0.5);
    if (slim) { const p = g.at(0, -0.22); c.bulgePinch(p.x, p.y, g.fw * 0.62, -slim * 0.4); }
  }
}

function applyMosaic() {
  const { W, H } = state;
  const b = Math.max(2, Math.round(state.mosaic.block * W / 1000));
  const sw = Math.ceil(W / b), sh = Math.ceil(H / b);
  if (smallC.width !== sw || smallC.height !== sh) { smallC.width = sw; smallC.height = sh; }
  smctx.imageSmoothingEnabled = true;
  smctx.drawImage(out, 0, 0, sw, sh);
  tctx.clearRect(0, 0, W, H);
  tctx.imageSmoothingEnabled = state.mosaic.style === 'blur';
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(smallC, 0, 0, sw * b, sh * b);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.drawImage(maskC, 0, 0);
  tctx.globalCompositeOperation = 'source-over';
  octx.drawImage(tmpC, 0, 0);
}

const STATIC_FX = new Set(['none', 'rgb', 'mirror', 'duo', 'bloom']);
function isLive() {
  if (state.template.animated || !STATIC_FX.has(state.effect.id) || state.ar.draw) return true;
  if (state.kind === 'camera') return camVideo.readyState >= 2;
  if (state.kind === 'video') return !fileVideo.paused && !fileVideo.ended;
  return false;
}
function loop() {
  requestAnimationFrame(loop);
  if (state.source && (state.dirty || isLive())) { state.dirty = false; render(); }
}

// ───────── 写真 ─────────
async function loadPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { toast('画像を読み込めませんでした'); URL.revokeObjectURL(url); return; }
  state.mirror = false;
  const [w, h] = fit(img.naturalWidth, img.naturalHeight, MAX_PHOTO);
  setSource('image', img, w, h);
  URL.revokeObjectURL(url);
}

async function savePhoto() {
  if (state.kind !== 'image') return toast('先に写真を選んでください');
  render();
  const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
  await saveBlob(blob, `shinpoko-${stamp()}.jpg`);
}

// ───────── カメラ ─────────
let camStream = null;

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) return toast('このブラウザではカメラを使えません(https が必要です)');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
  } catch (e) { return toast('カメラを使えませんでした: ' + (e.message || e.name), 4000); }
  camVideo.srcObject = camStream;
  await camVideo.play().catch(() => {});
  if (!camVideo.videoWidth) await new Promise((r) => camVideo.addEventListener('loadedmetadata', r, { once: true }));
  state.mirror = state.facing === 'user';
  const [w, h] = fit(camVideo.videoWidth, camVideo.videoHeight, MAX_VIDEO);
  setSource('camera', camVideo, w, h, true);
}

function stopCamera() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null; camVideo.srcObject = null;
}

function shutter() {
  if (state.kind !== 'camera') return;
  drawSource();
  // 撮った一枚(加工前)を写真モードに引き継ぐ。書き込み/モザイクはそのまま残す
  const snap = mk(); snap.width = state.W; snap.height = state.H;
  snap.getContext('2d').drawImage(srcC, 0, 0);
  state.snapshotJustTaken = true;
  stopCamera();
  state.mirror = false; // 既にミラー済みの画像なので二重反転しない
  enterMode('photo');
  setSource('image', snap, state.W, state.H, true);
  toast('撮影しました。加工して保存できます');
}

// ───────── 録画 ─────────
function pickMime() {
  const c = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

function startRecorder(audioTracks = []) {
  if (!window.MediaRecorder) { toast('このブラウザは録画に対応していません'); return null; }
  const stream = out.captureStream(30);
  audioTracks.forEach((t) => stream.addTrack(t));
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }));
  });
  rec.start(250);
  return { rec, done };
}

let resultBlob = null, resultName = '';
function showResult(blob) {
  resultBlob = blob;
  resultName = `shinpoko-${stamp()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
  const v = $('#resultVideo');
  v.src = URL.createObjectURL(blob);
  $('#result').hidden = false;
  v.play().catch(() => {});
}
function closeResult() {
  const v = $('#resultVideo');
  v.pause(); URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load();
  $('#result').hidden = true;
}

// カメラ録画
let camRec = null, camRecTimer = null, camAudio = null;
async function toggleCamRec() {
  const btn = $('#recBtn');
  if (camRec) { camRec.rec.stop(); return; }
  if (state.kind !== 'camera') return;
  let tracks = [];
  try {
    camAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
    tracks = camAudio.getAudioTracks();
  } catch { toast('マイクなしで録画します'); }
  camRec = startRecorder(tracks);
  if (!camRec) return;
  const t0 = Date.now();
  btn.classList.add('recording');
  camRecTimer = setInterval(() => { btn.textContent = `■ ${Math.floor((Date.now() - t0) / 1000)}秒`; }, 250);
  btn.textContent = '■ 0秒';
  camRec.done.then((blob) => {
    clearInterval(camRecTimer); camRec = null;
    camAudio?.getTracks().forEach((t) => t.stop()); camAudio = null;
    btn.classList.remove('recording'); btn.textContent = '● 録画';
    showResult(blob);
  });
}

// ───────── 動画の加工 ─────────
let videoUrl = null, actx = null, vAudioDest = null, vAudioSrc = null;

async function loadVideo(file) {
  if (!file) return;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  fileVideo.src = videoUrl; fileVideo.loop = true;
  await new Promise((res, rej) => {
    fileVideo.addEventListener('loadedmetadata', res, { once: true });
    fileVideo.addEventListener('error', () => rej(new Error('load')), { once: true });
  }).catch(() => toast('動画を読み込めませんでした'));
  if (!fileVideo.videoWidth) return;
  state.mirror = false;
  const [w, h] = fit(fileVideo.videoWidth, fileVideo.videoHeight, MAX_VIDEO);
  setSource('video', fileVideo, w, h);
  try { await fileVideo.play(); } catch { fileVideo.muted = true; $('#muteBtn').textContent = '🔇'; await fileVideo.play().catch(() => {}); }
  syncPlayBtn();
}

function syncPlayBtn() { $('#playBtn').textContent = fileVideo.paused ? '▶' : '⏸'; }

function videoAudioTracks() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!vAudioSrc) {
      vAudioSrc = actx.createMediaElementSource(fileVideo);
      vAudioDest = actx.createMediaStreamDestination();
      vAudioSrc.connect(vAudioDest); vAudioSrc.connect(actx.destination);
    }
    actx.resume();
    return vAudioDest.stream.getAudioTracks();
  } catch { return []; }
}

async function exportVideo() {
  if (state.kind !== 'video' || state.exporting) return toast('先に動画を選んでください');
  state.exporting = true;
  const btn = $('#doneBtn'), bar = $('#progress i');
  btn.disabled = true; btn.textContent = '書き出し中…';
  fileVideo.pause(); fileVideo.loop = false;
  const tracks = videoAudioTracks();
  fileVideo.currentTime = 0;
  await new Promise((r) => { fileVideo.addEventListener('seeked', r, { once: true }); setTimeout(r, 800); });
  const session = startRecorder(tracks);
  if (!session) { state.exporting = false; btn.disabled = false; btn.textContent = '書き出し'; return; }
  const onTime = () => { bar.style.width = `${(fileVideo.currentTime / fileVideo.duration) * 100}%`; };
  fileVideo.addEventListener('timeupdate', onTime);
  const ended = new Promise((r) => fileVideo.addEventListener('ended', r, { once: true }));
  await fileVideo.play().catch(() => {});
  await ended;
  await new Promise((r) => setTimeout(r, 300)); // 最終フレームを描き切る
  session.rec.stop();
  const blob = await session.done;
  fileVideo.removeEventListener('timeupdate', onTime);
  bar.style.width = '0';
  fileVideo.loop = true; fileVideo.currentTime = 0; fileVideo.play().catch(() => {}); syncPlayBtn();
  state.exporting = false; btn.disabled = false; btn.textContent = '書き出し';
  showResult(blob);
}

// ───────── 画面遷移 ─────────
const MODE_UI = {
  photo: { title: '写真', done: '保存', empty: ['写真を選んでください', '写真を選ぶ'] },
  camera: { title: 'カメラ', done: null, empty: ['カメラを起動しています…', 'カメラを開く'] },
  video: { title: '動画', done: '書き出し', empty: ['動画を選んでください', '動画を選ぶ'] },
};

function hasEdits() { return undoStack.length > 0 || state.mosaic.any; }
function refreshUndo() { $('#undoBtn').disabled = undoStack.length === 0; }

function enterMode(m) {
  if (state.exporting) return toast('書き出し中は切り替えできません');
  if (camRec) camRec.rec.stop();
  stopCamera(); fileVideo.pause();
  state.mode = m;
  document.body.dataset.view = 'edit'; document.body.dataset.mode = m;
  const ui = MODE_UI[m], d = $('#doneBtn');
  $('#title').textContent = ui.title;
  d.hidden = !ui.done; if (ui.done) d.textContent = ui.done;
  $('#emptyText').textContent = ui.empty[0]; $('#emptyBtn').textContent = ui.empty[1];
  if (m === 'camera') startCamera();
}

function goHome() {
  if (state.exporting) return toast('書き出し中は戻れません');
  if (state.source && hasEdits() && !confirm('編集中の内容は破棄されます。ホームに戻りますか?')) return;
  if (camRec) camRec.rec.stop();
  stopCamera(); fileVideo.pause(); clearSource();
  state.W = state.H = 0; undoStack.length = 0; state.mosaic.any = false; refreshUndo();
  document.body.dataset.view = 'home';
}

// ───────── サムネイル(実際の素材にフィルター/エフェクト/フレームを当てたプレビュー) ─────────
const TW = 240, TH = 300;
const thumbEls = { filter: [], effect: [], template: [] };
let thumbGL = null, thumbTex = null, thumbPost = null, thumbSrc = null;

function buildThumbs() {
  if (!state.source || !state.W) return;
  if (state.kind !== 'image') drawSource();
  thumbSrc ||= mk(); thumbSrc.width = TW; thumbSrc.height = TH;
  const c = thumbSrc.getContext('2d');
  const sc = Math.max(TW / state.W, TH / state.H), dw = state.W * sc, dh = state.H * sc;
  c.drawImage(srcC, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
  const put = (cv, img) => cv.getContext('2d').drawImage(img, 0, 0, TW, TH);
  try {
    thumbGL ||= fx.canvas();
    thumbTex = thumbTex ? (thumbTex.loadContentsOf(thumbSrc), thumbTex) : thumbGL.texture(thumbSrc);
    for (const { cv, it } of thumbEls.filter) {
      thumbGL.draw(thumbTex); it.apply(thumbGL, TW, TH, 3); thumbGL.update(); put(cv, thumbGL);
    }
  } catch (e) { for (const { cv } of thumbEls.filter) put(cv, thumbSrc); }
  try {
    thumbPost ||= new PostFx();
    for (const { cv, it } of thumbEls.effect) put(cv, thumbPost.render(thumbSrc, TW, TH, it.mode, 0.6, 1));
  } catch (e) { for (const { cv } of thumbEls.effect) put(cv, thumbSrc); }
  for (const { cv, it } of thumbEls.template) { put(cv, thumbSrc); it.draw(cv.getContext('2d'), TW, TH, 0.6); }
}

// ───────── モザイク操作 ─────────
function pushUndo(layer) {
  const src = layer === 'mosaic' ? maskC : drawC;
  const c = mk(); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  undoStack.push({ layer, c });
  if (undoStack.length > 12) undoStack.shift();
  refreshUndo();
}
function undo() {
  const e = undoStack.pop();
  refreshUndo();
  if (!e) return toast('戻す操作がありません');
  const ctx = e.layer === 'mosaic' ? mctx : dctx;
  ctx.clearRect(0, 0, state.W, state.H); ctx.drawImage(e.c, 0, 0);
  state.dirty = true;
}

function mosaicPaint(ctx, a, b, snap) {
  const u = state.W / 1000, m = state.mosaic;
  ctx.save();
  ctx.globalCompositeOperation = m.mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.fillStyle = ctx.strokeStyle = '#000';
  if (m.shape === 'brush') {
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = m.brush * u;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else {
    ctx.restore(); ctx.save();
    ctx.clearRect(0, 0, state.W, state.H); ctx.drawImage(snap, 0, 0);
    ctx.globalCompositeOperation = m.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
  ctx.restore();
  if (m.mode !== 'erase') state.mosaic.any = true;
}

// ───────── 書き込み(プリクラ風) ─────────
function drawGlyph(ctx, type, x, y, size, color) {
  ctx.save();
  if (type === 'sparkle') {
    ctx.fillStyle = SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0];
    ctx.shadowColor = '#fff'; ctx.shadowBlur = size * 0.6;
    sparklePath(ctx, x, y, size); ctx.fill();
  } else {
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 0.12;
    heartPath(ctx, x, y, size * 1.4); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

let pen = { acc: 0, hue: 0 };
function penSegment(a, b, first) {
  const { penType, color, size } = state.draw;
  const u = state.W / 1000, w = size * u, ctx = dctx;
  if (penType === 'sparkle' || penType === 'heart') {
    const sp = w * 2.2, gs = penType === 'sparkle' ? w * 1.4 : w * 1.1;
    if (first) { drawGlyph(ctx, penType, a.x, a.y, gs, color); pen.acc = 0; return; }
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    pen.acc += d;
    while (pen.acc >= sp) {
      pen.acc -= sp;
      const t = d ? 1 - pen.acc / d : 1;
      drawGlyph(ctx, penType, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, gs, color);
    }
    return;
  }
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  const line = (lw) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke(); };
  if (penType === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; line(w * 2);
  } else if (penType === 'neon') {
    ctx.shadowColor = color; ctx.shadowBlur = w * 2.2; ctx.strokeStyle = color; line(w * 1.3);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; line(w * 0.5);
  } else if (penType === 'rainbow') {
    pen.hue = (pen.hue + Math.hypot(b.x - a.x, b.y - a.y) * 0.6) % 360;
    ctx.strokeStyle = `hsl(${pen.hue} 90% 62%)`; line(w);
  } else {
    ctx.strokeStyle = color; line(w);
  }
  ctx.restore();
}

function drawText(ctx, text, x, y, px, color, style) {
  ctx.save();
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (style === 'pop') {
    ctx.lineWidth = px * 0.26; ctx.strokeStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = px * 0.12; ctx.shadowOffsetY = px * 0.05;
    ctx.strokeText(text, x, y);
    ctx.shadowColor = 'transparent'; ctx.fillStyle = color; ctx.fillText(text, x, y);
  } else if (style === 'neon') {
    ctx.shadowColor = color; ctx.shadowBlur = px * 0.5;
    ctx.lineWidth = px * 0.1; ctx.strokeStyle = color; ctx.strokeText(text, x, y);
    ctx.shadowBlur = px * 0.25; ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
  } else if (style === 'outline') {
    ctx.lineWidth = px * 0.2; ctx.strokeStyle = '#222'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  } else {
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function placeStamp(p) {
  const u = state.W / 1000, px = (state.draw.size * 4 + 30) * u;
  dctx.save();
  dctx.font = `${px}px ${FONT}`; dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
  dctx.shadowColor = 'rgba(0,0,0,.2)'; dctx.shadowBlur = px * 0.08;
  if (state.draw.stamp === '♡' || state.draw.stamp === '★') dctx.fillStyle = state.draw.color;
  dctx.fillText(state.draw.stamp, p.x, p.y);
  dctx.restore();
}

// ───────── ポインター入力 ─────────
function needsPointer() { return state.tool === 'mosaic' || state.tool === 'draw'; }
function pt(e) {
  const r = out.getBoundingClientRect();
  return { x: (e.clientX - r.left) * state.W / r.width, y: (e.clientY - r.top) * state.H / r.height };
}
let drag = null;
out.addEventListener('pointerdown', (e) => {
  if (!state.source || !needsPointer()) return;
  e.preventDefault(); out.setPointerCapture(e.pointerId);
  const p = pt(e);
  if (state.tool === 'mosaic') {
    pushUndo('mosaic');
    const snap = mk(); snap.width = state.W; snap.height = state.H; snap.getContext('2d').drawImage(maskC, 0, 0);
    drag = { type: 'mosaic', start: p, last: p, snap };
    mosaicPaint(mctx, p, p, snap);
  } else {
    const d = state.draw;
    pushUndo('draw');
    if (d.tool === 'stamp') { placeStamp(p); drag = null; }
    else if (d.tool === 'text') {
      const u = state.W / 1000, text = $('#textInput').value.trim();
      if (text) drawText(dctx, text, p.x, p.y, (d.size * 3 + 28) * u, d.color, d.textStyle);
      drag = null;
    } else {
      pen = { acc: 0, hue: Math.random() * 360 };
      state.draw.penType = d.tool === 'eraser' ? 'eraser' : state.draw.penType;
      drag = { type: 'pen', last: p };
      penSegment(p, p, true);
    }
  }
  state.dirty = true;
});
out.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pt(e);
  if (drag.type === 'mosaic') mosaicPaint(mctx, state.mosaic.shape === 'rect' ? drag.start : drag.last, p, drag.snap);
  else penSegment(drag.last, p, false);
  drag.last = p; state.dirty = true;
});
const endDrag = () => { drag = null; };
out.addEventListener('pointerup', endDrag);
out.addEventListener('pointercancel', endDrag);

// ───────── UI 組み立て ─────────
function setTool(t) {
  state.tool = t;
  $$('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${t}`));
  out.style.touchAction = needsPointer() ? 'none' : 'auto';
  out.style.cursor = needsPointer() ? 'crosshair' : 'default';
}

function seg(id, key, obj, after) {
  $$(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
    obj[key] = b.dataset.v;
    $$(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b));
    after?.();
  }));
}

function chips(el, items, get, set) {
  items.forEach((it) => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.addEventListener('click', () => { set(it); $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); state.dirty = true; });
    if (get(it)) b.classList.add('on');
    el.appendChild(b);
  });
}

function thumbList(el, key, items, isOn, onPick, placeholder) {
  items.forEach((it) => {
    const b = document.createElement('button');
    const cv = mk(); cv.width = TW; cv.height = TH;
    if (placeholder) placeholder(cv, it); else { const g = cv.getContext('2d'); g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, TW, TH); }
    thumbEls[key].push({ cv, it });
    b.append(cv, it.name);
    if (isOn(it)) b.classList.add('on');
    b.addEventListener('click', () => {
      onPick(it); $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); state.dirty = true;
    });
    el.appendChild(b);
  });
}

function buildUI() {
  // 画面遷移
  $$('[data-start]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.start;
    enterMode(m);
    if (m === 'photo') $('#photoInput').click();
    else if (m === 'video') $('#videoInput').click();
  }));
  $('#closeBtn').addEventListener('click', goHome);
  $('#undoBtn').addEventListener('click', undo);
  $('#doneBtn').addEventListener('click', () => (state.mode === 'photo' ? savePhoto() : exportVideo()));
  $$('#tools button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  // フィルター / エフェクト / フレーム(サムネイル付き)
  thumbList($('#filterChips'), 'filter', FILTERS, (f) => f === state.filter, (f) => { state.filter = f; });
  thumbList($('#effectChips'), 'effect', POST_EFFECTS, (f) => f === state.effect, (f) => { state.effect = f; });
  thumbList($('#templateGrid'), 'template', TEMPLATES, (t) => t === state.template, (t) => { state.template = t; }, (cv, t) => drawTemplateThumb(cv, t));
  AR_EFFECTS.forEach((it) => {
    const b = document.createElement('button'), d = document.createElement('div');
    d.className = 'emoji'; d.textContent = it.icon;
    b.append(d, it.name);
    if (it === state.ar) b.classList.add('on');
    b.addEventListener('click', () => {
      state.ar = it; $$('#arChips button').forEach((x) => x.classList.toggle('on', x === b)); state.dirty = true;
    });
    $('#arChips').appendChild(b);
  });
  $('#beautySlim').addEventListener('input', (e) => { state.beauty.slim = e.target.value / 100; state.dirty = true; });
  $('#beautyEyes').addEventListener('input', (e) => { state.beauty.eyes = e.target.value / 100; state.dirty = true; });
  $('#effectAmt').addEventListener('input', (e) => { state.effectAmt = e.target.value / 100; state.dirty = true; });

  // 調整
  $$('[data-adj]').forEach((inp) => inp.addEventListener('input', () => { state.adj[inp.dataset.adj] = inp.value / 100; state.dirty = true; }));
  $('#adjReset').addEventListener('click', () => {
    $$('[data-adj]').forEach((inp) => { inp.value = 0; state.adj[inp.dataset.adj] = 0; inp.parentElement.querySelector('output').textContent = '0'; });
    state.dirty = true;
  });
  // スライダーの数値表示
  $$('.slider input').forEach((i) => i.addEventListener('input', () => {
    const o = i.parentElement.querySelector('output'); if (o) o.textContent = i.value;
  }));

  // モザイク
  seg('mosaicShape', 'shape', state.mosaic);
  seg('mosaicStyle', 'style', state.mosaic, () => { state.dirty = true; });
  seg('mosaicMode', 'mode', state.mosaic);
  $('#mosaicBlock').addEventListener('input', (e) => { state.mosaic.block = +e.target.value; state.dirty = true; });
  $('#mosaicBrush').addEventListener('input', (e) => { state.mosaic.brush = +e.target.value; });
  $('#mosaicAll').addEventListener('click', () => {
    if (!state.source) return;
    pushUndo('mosaic'); mctx.globalCompositeOperation = 'source-over'; mctx.fillStyle = '#000'; mctx.fillRect(0, 0, state.W, state.H);
    state.mosaic.any = true; state.dirty = true;
  });
  $('#mosaicClear').addEventListener('click', () => {
    if (!state.source) return;
    pushUndo('mosaic'); mctx.clearRect(0, 0, state.W, state.H); state.mosaic.any = false; state.dirty = true;
  });

  // 書き込み
  const showSub = () => {
    const t = state.draw.tool;
    $$('#pane-draw .sub').forEach((s) => { s.style.display = s.dataset.for === t ? '' : 'none'; });
    $('#colors').style.display = t === 'eraser' ? 'none' : '';
  };
  seg('drawTool', 'tool', state.draw, () => { if (state.draw.tool !== 'eraser' && state.draw.penType === 'eraser') state.draw.penType = 'normal'; showSub(); });
  chips($('#penTypes'), [
    { v: 'normal', label: 'ふつう' }, { v: 'neon', label: 'ネオン' }, { v: 'rainbow', label: 'レインボー' },
    { v: 'sparkle', label: 'キラキラ' }, { v: 'heart', label: 'ハート' },
  ], (i) => i.v === state.draw.penType, (i) => { state.draw.penType = i.v; });
  chips($('#stamps'), ['♡', '★', '✿', '♪', '✨', '🎀', '🌸', '💖', '👑', '☁️', '🍓', '🦋'].map((s) => ({ s, label: s })),
    (i) => i.s === state.draw.stamp, (i) => { state.draw.stamp = i.s; });
  chips($('#textStyles'), [
    { v: 'pop', label: 'ポップ' }, { v: 'neon', label: 'ネオン' }, { v: 'outline', label: 'ふちどり' }, { v: 'plain', label: 'シンプル' },
  ], (i) => i.v === state.draw.textStyle, (i) => { state.draw.textStyle = i.v; });
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c; if (i === 0) b.classList.add('on');
    b.addEventListener('click', () => { state.draw.color = c; $$('#colors button').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#colors').appendChild(b);
  });
  $('#penSize').addEventListener('input', (e) => { state.draw.size = +e.target.value; });
  $('#drawClear').addEventListener('click', () => {
    if (!state.source) return;
    pushUndo('draw'); dctx.clearRect(0, 0, state.W, state.H); state.dirty = true;
  });
  showSub();

  // 写真
  $('#photoInput').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });

  // カメラ
  $('#flipCam').addEventListener('click', () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCamera(); });
  $('#shutter').addEventListener('click', shutter);
  $('#recBtn').addEventListener('click', toggleCamRec);

  // 動画
  $('#videoInput').addEventListener('change', (e) => { loadVideo(e.target.files[0]); e.target.value = ''; });
  $('#playBtn').addEventListener('click', () => { if (fileVideo.paused) fileVideo.play(); else fileVideo.pause(); syncPlayBtn(); state.dirty = true; });
  $('#muteBtn').addEventListener('click', () => { fileVideo.muted = !fileVideo.muted; $('#muteBtn').textContent = fileVideo.muted ? '🔇' : '🔊'; });
  $('#seek').addEventListener('input', (e) => { if (fileVideo.duration) { fileVideo.currentTime = e.target.value / 1000 * fileVideo.duration; state.dirty = true; } });
  fileVideo.addEventListener('timeupdate', () => { if (fileVideo.duration && !state.exporting) $('#seek').value = fileVideo.currentTime / fileVideo.duration * 1000; });
  fileVideo.addEventListener('seeked', () => { state.dirty = true; });

  // 空状態ボタン
  $('#emptyBtn').addEventListener('click', () => {
    if (state.mode === 'photo') $('#photoInput').click();
    else if (state.mode === 'video') $('#videoInput').click();
    else startCamera();
  });

  // 結果ダイアログ
  $('#resultSave').addEventListener('click', () => saveBlob(resultBlob, resultName));
  $('#resultClose').addEventListener('click', closeResult);
}

buildUI();
setTool('filter');
loop();

// テスト用フック
window.__shinpoko = { state, render, loadPhoto, enterMode, goHome, setTool, undoStack };
