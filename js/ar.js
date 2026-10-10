// 顔に追従する AR エフェクト(猫・犬・うさぎ・くま …)。MediaPipe の 478 点ランドマークを使って Canvas に描く。
import { heartPath, sparklePath } from './templates.js';

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

// 顔の座標系: 原点=顔の中心、u=顔の横幅単位(右が+)、v=顔の縦幅単位(上が+)。首かしげにも追従する。
function geom(lm, W, H) {
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const top = P(10), chin = P(152), cl = P(234), cr = P(454);
  const fw = len(sub(cr, cl)), fh = len(sub(top, chin));
  const up = unit(sub(top, chin));
  const right = unit(sub(cr, cl));
  const O = mid(top, chin);
  const at = (u, v) => ({ x: O.x + right.x * u * fw + up.x * v * fh, y: O.y + right.y * u * fw + up.y * v * fh });
  return {
    P, fw, fh, up, right, O, at,
    nose: P(1), eyeL: mid(P(33), P(133)), eyeR: mid(P(263), P(362)),
    lipU: P(13), lipD: P(14), cheekL: P(205), cheekR: P(425),
    open: len(sub(P(13), P(14))) / fh,
    roll: Math.atan2(right.y, right.x),
  };
}

// ── 線画(手描き風にぷるぷる揺れる) ──
function doodleStyle(ctx, g) {
  ctx.lineWidth = g.fw * 0.024; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = g.fw * 0.02;
}
function wob(g, t, i) {
  const k = Math.floor(t * 7), a = g.fw * 0.005;
  return { x: (hash(i, k, 1) - 0.5) * a * 2, y: (hash(i, k, 2) - 0.5) * a * 2 };
}
function line(ctx, g, t, pts, seed, close = false) {
  const q = pts.map((p, i) => { const j = wob(g, t, seed * 17 + i); return { x: p.x + j.x, y: p.y + j.y }; });
  ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y);
  for (let i = 1; i < q.length - 1; i++) { const m = mid(q[i], q[i + 1]); ctx.quadraticCurveTo(q[i].x, q[i].y, m.x, m.y); }
  const l = q[q.length - 1]; ctx.lineTo(l.x, l.y);
  if (close) ctx.closePath();
  ctx.stroke();
}

function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function ell(ctx, c, rx, ry, rot, fill, stroke, lw) {
  ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
const SIDES = [-1, 1];
const soft = (ctx, g) => { ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = g.fw * 0.03; ctx.shadowOffsetY = g.fw * 0.008; };
const noShadow = (ctx) => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

function noseTri(ctx, g, color, k = 1) {
  const n = g.nose, w = g.fw * 0.045 * k;
  poly(ctx, [
    { x: n.x - g.right.x * w + g.up.x * w * 0.4, y: n.y - g.right.y * w + g.up.y * w * 0.4 },
    { x: n.x + g.right.x * w + g.up.x * w * 0.4, y: n.y + g.right.y * w + g.up.y * w * 0.4 },
    { x: n.x - g.up.x * w * 0.7, y: n.y - g.up.y * w * 0.7 },
  ], color, color, g.fw * 0.012);
}

export const AR_EFFECTS = [
  { id: 'none', name: 'なし', icon: '🚫' },

  {
    id: 'cat-doodle', name: 'ねこ(線画)', icon: '🐱',
    draw(ctx, g, t) {
      doodleStyle(ctx, g);
      let s = 1;
      for (const sd of SIDES) {
        line(ctx, g, t, [g.at(sd * 0.10, 0.45), g.at(sd * 0.37, 0.82), g.at(sd * 0.47, 0.28)], s++);
        line(ctx, g, t, [g.at(sd * 0.19, 0.48), g.at(sd * 0.36, 0.69), g.at(sd * 0.42, 0.38)], s++);
        for (const k of [-1, 0, 1]) {
          line(ctx, g, t, [g.at(sd * 0.30, -0.13 + k * 0.05), g.at(sd * 0.48, -0.13 + k * 0.09), g.at(sd * 0.68, -0.14 + k * 0.15)], s++);
        }
      }
      // 額のしましま
      for (const k of [-1, 0, 1]) line(ctx, g, t, [g.at(k * 0.06, 0.40 - Math.abs(k) * 0.02), g.at(k * 0.07, 0.31 - Math.abs(k) * 0.015)], s++);
      // 鼻と「ω」の口
      const c = { x: g.nose.x - g.up.x * g.fh * 0.06, y: g.nose.y - g.up.y * g.fh * 0.06 };
      const w = g.fw * 0.05, dn = (a) => ({ x: -g.up.x * a, y: -g.up.y * a });
      const R = (a) => ({ x: g.right.x * a, y: g.right.y * a });
      ctx.beginPath();
      const L = { x: c.x - R(w * 2).x, y: c.y - R(w * 2).y }, Rr = { x: c.x + R(w * 2).x, y: c.y + R(w * 2).y };
      ctx.moveTo(L.x, L.y);
      ctx.quadraticCurveTo(c.x - R(w).x + dn(w * 2.2).x, c.y - R(w).y + dn(w * 2.2).y, c.x, c.y);
      ctx.quadraticCurveTo(c.x + R(w).x + dn(w * 2.2).x, c.y + R(w).y + dn(w * 2.2).y, Rr.x, Rr.y);
      ctx.stroke();
      line(ctx, g, t, [g.nose, c], s++);
      noseTri(ctx, g, 'rgba(255,255,255,0)', 1);
    },
  },

  {
    id: 'cat', name: 'ねこ', icon: '😺',
    draw(ctx, g, t) {
      const lw = g.fw * 0.014;
      for (const sd of SIDES) {
        soft(ctx, g);
        poly(ctx, [g.at(sd * 0.08, 0.44), g.at(sd * 0.36, 0.86), g.at(sd * 0.50, 0.26)], '#d7d3dc', '#fff', lw);
        noShadow(ctx);
        poly(ctx, [g.at(sd * 0.17, 0.48), g.at(sd * 0.35, 0.72), g.at(sd * 0.43, 0.36)], '#ffb3c8', null, 0);
      }
      noseTri(ctx, g, '#ff7fa6', 1.1);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = g.fw * 0.012; ctx.lineCap = 'round';
      soft(ctx, g);
      for (const sd of SIDES) for (const k of [-1, 0, 1]) {
        const a = g.at(sd * 0.27, -0.12 + k * 0.04), b = g.at(sd * 0.66, -0.13 + k * 0.1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      noShadow(ctx);
      blush(ctx, g, 0.5);
    },
  },

  {
    id: 'dog', name: 'いぬ', icon: '🐶',
    draw(ctx, g, t) {
      const lw = g.fw * 0.012;
      for (const sd of SIDES) {
        soft(ctx, g);
        ell(ctx, g.at(sd * 0.55, 0.22), g.fw * 0.13, g.fh * 0.25, g.roll + sd * -0.28, '#a9743f', '#7a4e26', lw);
        noShadow(ctx);
        ell(ctx, g.at(sd * 0.55, 0.20), g.fw * 0.07, g.fh * 0.17, g.roll + sd * -0.28, 'rgba(255,170,150,.55)');
      }
      // 舌(口を開けたときだけ)
      if (g.open > 0.11) {
        const c = { x: g.lipD.x - g.up.x * g.fh * 0.045, y: g.lipD.y - g.up.y * g.fh * 0.045 };
        const ry = g.fh * (0.04 + Math.min(g.open, 0.3) * 0.45);
        ell(ctx, c, g.fw * 0.07, ry, g.roll, '#ff7a9b', '#e0557a', lw);
        ctx.strokeStyle = '#e0557a'; ctx.lineWidth = lw; ctx.beginPath();
        ctx.moveTo(c.x + g.up.x * ry * 0.5, c.y + g.up.y * ry * 0.5); ctx.lineTo(c.x - g.up.x * ry * 0.7, c.y - g.up.y * ry * 0.7); ctx.stroke();
      }
      // 黒い鼻
      soft(ctx, g);
      ell(ctx, g.nose, g.fw * 0.085, g.fw * 0.06, g.roll, '#1d1a1a');
      noShadow(ctx);
      ell(ctx, { x: g.nose.x + g.up.x * g.fw * 0.02 - g.right.x * g.fw * 0.025, y: g.nose.y + g.up.y * g.fw * 0.02 - g.right.y * g.fw * 0.025 }, g.fw * 0.022, g.fw * 0.012, g.roll, 'rgba(255,255,255,.7)');
      // マズルのドット
      ctx.fillStyle = 'rgba(60,40,30,.55)';
      for (const sd of SIDES) for (const k of [0, 1, 2]) {
        const p = g.at(sd * (0.13 + (k % 2) * 0.04), -0.15 - k * 0.025);
        ctx.beginPath(); ctx.arc(p.x, p.y, g.fw * 0.007, 0, 7); ctx.fill();
      }
      blush(ctx, g, 0.45);
    },
  },

  {
    id: 'bunny', name: 'うさぎ', icon: '🐰',
    draw(ctx, g, t) {
      const lw = g.fw * 0.012;
      for (const sd of SIDES) {
        const c = g.at(sd * 0.17, 1.0), rot = g.roll + sd * 0.14;
        soft(ctx, g);
        ell(ctx, c, g.fw * 0.1, g.fh * 0.42, rot, '#fffafc', '#f3d4e0', lw);
        noShadow(ctx);
        ell(ctx, g.at(sd * 0.17 - sd * 0.01, 0.98), g.fw * 0.055, g.fh * 0.34, rot, '#ffc4d6');
      }
      noseTri(ctx, g, '#ff8fb0', 1);
      blush(ctx, g, 0.5);
    },
  },

  {
    id: 'bear', name: 'くま', icon: '🐻',
    draw(ctx, g, t) {
      const lw = g.fw * 0.012;
      for (const sd of SIDES) {
        const c = g.at(sd * 0.40, 0.52);
        soft(ctx, g);
        ell(ctx, c, g.fw * 0.13, g.fw * 0.13, 0, '#8b5e3c', '#6a4328', lw);
        noShadow(ctx);
        ell(ctx, c, g.fw * 0.07, g.fw * 0.07, 0, '#e0b08a');
      }
      ell(ctx, g.nose, g.fw * 0.06, g.fw * 0.042, g.roll, '#2b1e18');
      ell(ctx, { x: g.nose.x - g.up.x * g.fh * 0.07, y: g.nose.y - g.up.y * g.fh * 0.07 }, g.fw * 0.003, g.fw * 0.003, 0, '#2b1e18');
      blush(ctx, g, 0.5);
    },
  },

  {
    id: 'blush', name: 'ほっぺ', icon: '😊',
    draw(ctx, g, t) {
      blush(ctx, g, 1);
      ctx.fillStyle = 'rgba(150,90,60,.45)';
      for (const sd of SIDES) for (const k of [0, 1, 2]) {
        const p = g.at(sd * (0.07 + k * 0.045), 0.0 - (k % 2) * 0.02);
        ctx.beginPath(); ctx.arc(p.x, p.y, g.fw * 0.007, 0, 7); ctx.fill();
      }
    },
  },

  {
    id: 'sparkle-eyes', name: '目キラ', icon: '✨',
    draw(ctx, g, t) {
      [g.eyeL, g.eyeR].forEach((e, i) => {
        const sd = i ? 1 : -1, k = 0.75 + 0.25 * Math.sin(t * 5 + i * 2);
        ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = g.fw * 0.04;
        ctx.fillStyle = '#fff';
        const p = { x: e.x + g.up.x * g.fh * 0.05 + g.right.x * sd * g.fw * 0.045, y: e.y + g.up.y * g.fh * 0.05 + g.right.y * sd * g.fw * 0.045 };
        sparklePath(ctx, p.x, p.y, g.fw * 0.07 * k); ctx.fill();
        const q = { x: e.x - g.up.x * g.fh * 0.025 - g.right.x * sd * g.fw * 0.04, y: e.y - g.up.y * g.fh * 0.025 - g.right.y * sd * g.fw * 0.04 };
        sparklePath(ctx, q.x, q.y, g.fw * 0.035 * (1.2 - k * 0.3)); ctx.fill();
        ctx.restore();
      });
      // ふわっと広がる星
      for (let i = 0; i < 6; i++) {
        const a = hash(i, 3, 4) * 6.28, r = 0.5 + hash(i, 5, 6) * 0.25, ph = Math.sin(t * 3 + i * 1.7);
        if (ph < 0) continue;
        const p = g.at(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        ctx.save(); ctx.globalAlpha = ph; ctx.fillStyle = '#fff6b8'; ctx.shadowColor = '#fff'; ctx.shadowBlur = g.fw * 0.03;
        sparklePath(ctx, p.x, p.y, g.fw * 0.04 * ph); ctx.fill(); ctx.restore();
      }
    },
  },

  {
    id: 'crown', name: '王冠', icon: '👑',
    draw(ctx, g, t) {
      const pts = [g.at(-0.28, 0.50), g.at(-0.30, 0.78), g.at(-0.15, 0.64), g.at(0, 0.88), g.at(0.15, 0.64), g.at(0.30, 0.78), g.at(0.28, 0.50)];
      const a = pts[0], b = pts[3];
      const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, '#ffe27a'); gr.addColorStop(1, '#ffb300');
      soft(ctx, g);
      poly(ctx, pts, gr, '#c98a00', g.fw * 0.012);
      noShadow(ctx);
      [[pts[1], '#ff5a7a'], [pts[3], '#5ac8ff'], [pts[5], '#ff5a7a']].forEach(([p, c]) => ell(ctx, p, g.fw * 0.022, g.fw * 0.022, 0, c, '#fff', g.fw * 0.006));
    },
  },

  {
    id: 'halo', name: '天使の輪', icon: '😇',
    draw(ctx, g, t) {
      const bob = Math.sin(t * 3) * g.fh * 0.012;
      const c = g.at(0, 0.74 + bob / g.fh);
      ctx.save(); ctx.shadowColor = '#ffd24d'; ctx.shadowBlur = g.fw * 0.06;
      ell(ctx, c, g.fw * 0.30, g.fw * 0.07, g.roll, null, '#ffe27a', g.fw * 0.032);
      ctx.restore();
      ell(ctx, c, g.fw * 0.30, g.fw * 0.07, g.roll, null, 'rgba(255,255,255,.7)', g.fw * 0.01);
    },
  },

  {
    id: 'heart-glasses', name: 'ハートめがね', icon: '😍',
    draw(ctx, g, t) {
      const sz = g.fw * 0.3;
      for (const e of [g.eyeL, g.eyeR]) {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(g.roll);
        heartPath(ctx, 0, 0, sz);
        ctx.fillStyle = 'rgba(255,100,160,.35)'; ctx.fill();
        ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = g.fw * 0.022; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = g.fw * 0.018; ctx.lineCap = 'round';
      const b1 = { x: g.eyeL.x + g.right.x * sz * 0.5, y: g.eyeL.y + g.right.y * sz * 0.5 };
      const b2 = { x: g.eyeR.x - g.right.x * sz * 0.5, y: g.eyeR.y - g.right.y * sz * 0.5 };
      ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    },
  },
];

function blush(ctx, g, a) {
  for (const c of [g.cheekL, g.cheekR]) {
    const rx = g.fw * 0.13, ry = g.fw * 0.085;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(g.roll); ctx.scale(1, ry / rx);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(255,105,140,${0.55 * a})`); gr.addColorStop(1, 'rgba(255,105,140,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill();
    ctx.restore();
  }
}

// 美容補正用: glfx に渡す座標
export function faceMetrics(lm, W, H) { return geom(lm, W, H); }

export function drawAR(ctx, effect, faces, W, H, t) {
  if (!effect.draw) return;
  for (const lm of faces) {
    const g = geom(lm, W, H);
    if (!(g.fw > 4 && g.fh > 4)) continue;
    ctx.save();
    effect.draw(ctx, g, t);
    ctx.restore();
  }
}
