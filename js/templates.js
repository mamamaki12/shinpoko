// テンプレート(フレーム/デコ)。出力キャンバスに最後に重ねて描く。

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + 0.45 * s);
  ctx.bezierCurveTo(x - 0.9 * s, y - 0.1 * s, x - 0.5 * s, y - 0.7 * s, x, y - 0.25 * s);
  ctx.bezierCurveTo(x + 0.5 * s, y - 0.7 * s, x + 0.9 * s, y - 0.1 * s, x, y + 0.45 * s);
  ctx.closePath();
}

export function sparklePath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.closePath();
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif';
const unit = (w, h) => Math.min(w, h) / 100;
const pad = (n) => String(n).padStart(2, '0');
const today = (sep = '.') => {
  const d = new Date();
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join(sep);
};

function ring(ctx, w, h, t, r, b, l) {
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(l, t, w - l - r, h - t - b);
  ctx.fill('evenodd');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PASTEL = ['#ffd6e8', '#ffb3d1', '#e3d4ff', '#d2f0ff', '#fff3b0'];

export const TEMPLATES = [
  { id: 'none', name: 'なし', draw() {} },

  {
    id: 'polaroid', name: 'ポラロイド',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      ctx.fillStyle = '#fbfaf6';
      ring(ctx, w, h, 4 * u, 4 * u, 17 * u, 4 * u);
      ctx.strokeStyle = 'rgba(0,0,0,.12)';
      ctx.lineWidth = 0.3 * u;
      ctx.strokeRect(4 * u, 4 * u, w - 8 * u, h - 21 * u);
      ctx.fillStyle = '#6b6560';
      ctx.font = `${3.6 * u}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${today()} ♡`, w / 2, h - 8.5 * u);
      ctx.restore();
    },
  },

  {
    id: 'cute', name: 'ガーリー',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#ffb6d5'); g.addColorStop(1, '#c9b6ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      roundRect(ctx, 5 * u, 5 * u, w - 10 * u, h - 10 * u, 6 * u);
      ctx.fill('evenodd');
      ctx.setLineDash([1.6 * u, 1.4 * u]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.7 * u;
      roundRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, 7 * u);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[5, 5], [w / u - 5, 5], [5, h / u - 5], [w / u - 5, h / u - 5]]) {
        heartPath(ctx, x * u, y * u, 7 * u); ctx.fill();
      }
      ctx.restore();
    },
  },

  {
    id: 'hearts', name: 'ハート枠',
    draw(ctx, w, h) {
      const u = unit(w, h);
      const s = 4.6 * u, gap = 6.2 * u, inset = 3.4 * u;
      ctx.save();
      let i = 0;
      const put = (x, y) => {
        ctx.fillStyle = PASTEL[i++ % 3];
        heartPath(ctx, x, y, s); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5 * u; ctx.stroke();
      };
      for (let x = inset; x <= w - inset + 0.1; x += gap) { put(x, inset); put(x, h - inset); }
      for (let y = inset + gap; y < h - inset - 0.1; y += gap) { put(inset, y); put(w - inset, y); }
      ctx.restore();
    },
  },

  {
    id: 'sparkle', name: 'キラキラ',
    draw(ctx, w, h) {
      const u = unit(w, h), r = rng(7);
      ctx.save();
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,200,230,.45)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const cols = ['#ffffff', '#fff3b0', '#ffd0e6', '#d6ecff'];
      for (let i = 0; i < 70; i++) {
        // 縁に寄せて配置
        let x = r() * w, y = r() * h;
        if (r() < 0.8) { const e = r() * 16 * u; const side = (r() * 4) | 0; if (side === 0) y = e; else if (side === 1) y = h - e; else if (side === 2) x = e; else x = w - e; }
        const s = (0.8 + r() * 2.8) * u;
        ctx.shadowColor = '#fff'; ctx.shadowBlur = s * 2;
        ctx.fillStyle = cols[(r() * cols.length) | 0];
        sparklePath(ctx, x, y, s * 1.6); ctx.fill();
      }
      ctx.restore();
    },
  },

  {
    id: 'purikura', name: 'プリクラ',
    draw(ctx, w, h) {
      const u = unit(w, h), r = rng(21);
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#ff9ccb'); g.addColorStop(0.5, '#d9b8ff'); g.addColorStop(1, '#9fe0ff');
      ctx.globalAlpha = 0.9; ctx.fillStyle = g;
      ring(ctx, w, h, 2.6 * u, 2.6 * u, 15 * u, 2.6 * u);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6 * u;
      ctx.strokeRect(2.6 * u, 2.6 * u, w - 5.2 * u, h - 17.6 * u);
      // ラメ
      for (let i = 0; i < 90; i++) {
        const x = r() * w, y = r() * h, onBand = y > h - 15 * u || y < 2.6 * u || x < 2.6 * u || x > w - 2.6 * u;
        if (!onBand && r() < 0.7) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`;
        ctx.beginPath(); ctx.arc(x, y, (0.3 + r() * 0.8) * u, 0, 7); ctx.fill();
      }
      // ロゴ
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${5.4 * u}px ${FONT}`;
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.4 * u;
      ctx.strokeStyle = '#ff6fae'; ctx.fillStyle = '#fff';
      const ty = h - 9 * u;
      ctx.strokeText('♡ Best Friends ♡', w / 2, ty); ctx.fillText('♡ Best Friends ♡', w / 2, ty);
      ctx.font = `bold ${2.8 * u}px ${FONT}`; ctx.lineWidth = 0.9 * u;
      ctx.strokeText(today('/'), w / 2, ty + 5 * u); ctx.fillText(today('/'), w / 2, ty + 5 * u);
      ctx.fillStyle = '#fff';
      sparklePath(ctx, 8 * u, 8 * u, 3.4 * u); ctx.fill();
      sparklePath(ctx, w - 9 * u, 11 * u, 2.4 * u); ctx.fill();
      ctx.restore();
    },
  },

  {
    id: 'rainbow', name: 'レインボー',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, w, h);
      ['#ff6b6b', '#ffb36b', '#ffe86b', '#7be08a', '#6bc8ff', '#a98bff', '#ff7ad1'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.fillStyle = g; ring(ctx, w, h, 3 * u, 3 * u, 3 * u, 3 * u);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6 * u;
      ctx.strokeRect(3 * u, 3 * u, w - 6 * u, h - 6 * u);
      ctx.restore();
    },
  },

  {
    id: 'neon', name: 'ネオン枠',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      ctx.lineWidth = 1.1 * u;
      ctx.shadowBlur = 3 * u;
      ctx.shadowColor = '#ff2fd0'; ctx.strokeStyle = '#ff7be8';
      roundRect(ctx, 3 * u, 3 * u, w - 6 * u, h - 6 * u, 3 * u); ctx.stroke();
      ctx.shadowColor = '#2fe0ff'; ctx.strokeStyle = '#8ff0ff';
      roundRect(ctx, 5.6 * u, 5.6 * u, w - 11.2 * u, h - 11.2 * u, 2 * u); ctx.stroke();
      ctx.restore();
    },
  },

  {
    id: 'film', name: 'フィルム',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      ctx.fillStyle = '#121212';
      ring(ctx, w, h, 1.6 * u, 8 * u, 1.6 * u, 8 * u);
      ctx.fillStyle = '#e8e4d8';
      const hw = 3 * u, hh = 2.2 * u;
      for (let y = 2 * u; y < h - hh; y += 5 * u) {
        roundRect(ctx, 2.5 * u, y, hw, hh, 0.5 * u); ctx.fill();
        roundRect(ctx, w - 2.5 * u - hw, y, hw, hh, 0.5 * u); ctx.fill();
      }
      ctx.restore();
    },
  },

  {
    id: 'cinema', name: 'シネマ',
    draw(ctx, w, h) {
      ctx.save();
      const bar = h * 0.11;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
      ctx.restore();
    },
  },

  {
    id: 'datecam', name: '日付入り',
    draw(ctx, w, h) {
      const u = unit(w, h);
      ctx.save();
      const d = new Date();
      const t = `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
      ctx.font = `bold ${5 * u}px "Courier New",monospace`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 1.6 * u;
      ctx.fillStyle = '#ff9a2e';
      ctx.fillText(t, w - 5 * u, h - 5 * u);
      ctx.restore();
    },
  },
];

// 一覧用サムネイル
export function drawTemplateThumb(canvas, tpl) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#5b5568'); g.addColorStop(1, '#3a3546');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.arc(w / 2, h * 0.42, w * 0.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.9, w * 0.34, h * 0.3, 0, 0, 7); ctx.fill();
  tpl.draw(ctx, w, h);
}
