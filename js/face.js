// 顔のランドマーク検出(MediaPipe Face Landmarker / Apache-2.0)。初回に必要になったときだけ読み込む。
const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;

let landmarker = null, loading = null, failed = false;
let lastTs = 0;
let prev = []; // 動画/カメラ用のスムージング

export const faceState = {
  get ready() { return !!landmarker; },
  get failed() { return failed; },
};

export function loadFace() {
  if (loading) return loading;
  loading = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import(BASE + 'vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
    const make = (delegate) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: 3,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
  })().catch((e) => { failed = true; console.warn('face landmarker failed', e); });
  return loading;
}

export function resetFaceSmoothing() { prev = []; }

// canvas から顔を検出。戻り値: [[{x,y,z}×478], ...] (0〜1 正規化)
export function detectFaces(canvas, smooth) {
  if (!landmarker) return [];
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  let res;
  try { res = landmarker.detectForVideo(canvas, ts); } catch (e) { return []; }
  const faces = res.faceLandmarks || [];
  if (!smooth) { prev = []; return faces; }
  const a = 0.6;
  const out = faces.map((f, i) => {
    const p = prev[i];
    if (!p) return f;
    return f.map((pt, j) => ({ x: p[j].x + (pt.x - p[j].x) * a, y: p[j].y + (pt.y - p[j].y) * a, z: pt.z }));
  });
  prev = out;
  return out;
}
