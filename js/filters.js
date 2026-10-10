// 加工フィルター。エフェクト本体は glfx.js (MIT, Evan Wallace) のフィルターを組み合わせたもの。
// apply(c, w, h, k): c は glfx の canvas。w,h は出力サイズ。k はプレビュー用の効果倍率(通常 1)。

const sc = (w, h, k = 1) => (Math.max(w, h) / 1000) * k;

export const FILTERS = [
  { id: 'none', name: 'オリジナル', apply() {} },
  {
    id: 'natural', name: 'ナチュラル',
    apply(c) { c.brightnessContrast(0.05, 0.08).vibrance(0.25); },
  },
  {
    id: 'soft', name: 'ふんわり',
    apply(c, w, h, k = 1) { c.triangleBlur(1.6 * sc(w, h, k)).brightnessContrast(0.1, -0.08).vibrance(0.3); },
  },
  {
    id: 'dreamy', name: 'ゆめかわ',
    apply(c, w, h, k = 1) {
      c.triangleBlur(4 * sc(w, h, k)).brightnessContrast(0.12, -0.12).hueSaturation(0.04, 0.25)
        .curves([[0, 0.05], [1, 1]], [[0, 0], [1, 0.96]], [[0, 0.08], [1, 1]]);
    },
  },
  {
    id: 'pop', name: 'ポップ',
    apply(c) { c.vibrance(0.6).hueSaturation(0, 0.25).brightnessContrast(0.05, 0.2); },
  },
  {
    id: 'fade', name: 'うすいろ',
    apply(c) { c.brightnessContrast(0.1, -0.3).hueSaturation(0, -0.2); },
  },
  {
    id: 'warm', name: 'ウォーム',
    apply(c) { c.curves([[0, 0.03], [1, 1]], [[0, 0], [1, 0.96]], [[0, 0], [1, 0.82]]).brightnessContrast(0.03, 0.05); },
  },
  {
    id: 'cool', name: 'クール',
    apply(c) { c.curves([[0, 0], [1, 0.86]], [[0, 0], [1, 0.98]], [[0, 0.06], [1, 1]]).brightnessContrast(0, 0.05); },
  },
  {
    id: 'mono', name: 'モノクロ',
    apply(c) { c.hueSaturation(0, -1).brightnessContrast(0, 0.15); },
  },
  { id: 'sepia', name: 'セピア', apply(c) { c.sepia(1); } },
  {
    id: 'vintage', name: 'ヴィンテージ',
    apply(c, w, h, k = 1) { c.sepia(0.6).brightnessContrast(-0.02, -0.05).noise(0.15).vignette(0.4, 0.6); },
  },
  {
    id: 'retro', name: 'フィルム',
    apply(c) {
      c.curves([[0, 0.06], [0.5, 0.52], [1, 0.96]], [[0, 0.02], [0.5, 0.5], [1, 0.97]], [[0, 0.1], [0.5, 0.48], [1, 0.88]])
        .noise(0.08).vignette(0.35, 0.45);
    },
  },
  {
    id: 'clear', name: '透明感',
    apply(c) {
      c.brightnessContrast(0.12, -0.05).hueSaturation(0, -0.1)
        .curves([[0, 0], [1, 1]], [[0, 0], [1, 1]], [[0, 0.04], [1, 1]]);
    },
  },
  {
    id: 'milky', name: 'ミルキー',
    apply(c) {
      c.brightnessContrast(0.15, -0.25).hueSaturation(0.02, -0.15)
        .curves([[0, 0.08], [1, 1]], [[0, 0.06], [1, 1]], [[0, 0.08], [1, 1]]);
    },
  },
  {
    id: 'lovely', name: 'ラブリー',
    apply(c) {
      c.brightnessContrast(0.1, -0.05).hueSaturation(-0.03, 0.2)
        .curves([[0, 0.04], [1, 1]], [[0, 0], [1, 0.95]], [[0, 0.03], [1, 1]]);
    },
  },
  {
    id: 'emo', name: 'エモ',
    apply(c) {
      c.curves([[0, 0.02], [0.5, 0.5], [1, 1]], [[0, 0.02], [0.5, 0.49], [1, 0.95]], [[0, 0.12], [0.5, 0.47], [1, 0.86]])
        .hueSaturation(0, -0.1).noise(0.1).vignette(0.3, 0.4);
    },
  },
  {
    id: 'cine', name: 'シネマティック',
    apply(c) {
      c.curves([[0, 0], [0.5, 0.55], [1, 1]], [[0, 0], [0.5, 0.5], [1, 0.97]], [[0, 0.05], [0.5, 0.45], [1, 0.9]])
        .brightnessContrast(-0.02, 0.18).vignette(0.4, 0.5);
    },
  },
  {
    id: 'citypop', name: 'シティポップ',
    apply(c) {
      c.curves([[0, 0.1], [1, 1]], [[0, 0], [1, 0.9]], [[0, 0.15], [1, 1]]).vibrance(0.4).brightnessContrast(0.03, 0.1);
    },
  },
  { id: 'ink', name: 'インク', apply(c) { c.ink(0.3); } },
  {
    id: 'dot', name: 'ドット',
    apply(c, w, h, k = 1) { c.colorHalftone(w / 2, h / 2, 0.3, 7 * sc(w, h, k)); },
  },
  {
    id: 'pixel', name: 'ピクセル',
    apply(c, w, h, k = 1) { c.hexagonalPixelate(w / 2, h / 2, 10 * sc(w, h, k)); },
  },
  {
    id: 'tilt', name: 'ジオラマ',
    apply(c, w, h, k = 1) {
      c.tiltShift(0, h * 0.4, w, h * 0.4, 14 * sc(w, h, k), h * 0.22).vibrance(0.4).brightnessContrast(0, 0.1);
    },
  },
  {
    id: 'zoom', name: 'ズーム',
    apply(c, w, h, k = 1) { c.zoomBlur(w / 2, h / 2, 0.25); },
  },
  {
    id: 'swirl', name: 'うずまき',
    apply(c, w, h, k = 1) { c.swirl(w / 2, h / 2, Math.min(w, h) * 0.5, 2); },
  },
  {
    id: 'puff', name: 'ぷっくり',
    apply(c, w, h, k = 1) { c.bulgePinch(w / 2, h * 0.45, Math.min(w, h) * 0.45, 0.4); },
  },
  {
    id: 'pinch', name: 'きゅっ',
    apply(c, w, h, k = 1) { c.bulgePinch(w / 2, h * 0.45, Math.min(w, h) * 0.45, -0.3); },
  },
];

// 微調整スライダー(-1〜1)を最後にかける
export function applyAdjust(c, adj, w, h) {
  if (adj.brightness || adj.contrast) c.brightnessContrast(adj.brightness, adj.contrast);
  if (adj.saturation) c.hueSaturation(0, adj.saturation);
  if (adj.warmth) {
    const t = adj.warmth * 0.15;
    c.curves([[0, 0], [1, 1 - Math.min(0, t)]], [[0, 0], [1, 1]], [[0, Math.max(0, -t)], [1, 1 - Math.max(0, t)]])
      .brightnessContrast(0, 0);
  }
  if (adj.sharpness > 0) c.unsharpMask(Math.max(w, h) / 150, adj.sharpness * 2.5);
  if (adj.vignette > 0) c.vignette(0.35, adj.vignette);
}
