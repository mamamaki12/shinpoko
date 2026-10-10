// SNS で流行りのリアルタイム・エフェクト(グリッチ/VHS/平成レトロ など)を 1 本のフラグメントシェーダーで実装。
// glfx の出力を入力テクスチャとして受け取り、時間 t とともに変化させる。

export const POST_EFFECTS = [
  { id: 'none', name: 'なし', mode: 0 },
  { id: 'glitch', name: 'グリッチ', mode: 1 },
  { id: 'rgb', name: 'RGBずらし', mode: 2 },
  { id: 'vhs', name: 'VHS', mode: 3 },
  { id: 'y2k', name: '平成レトロ', mode: 4 },
  { id: 'bloom', name: 'キラふわ', mode: 5 },
  { id: 'kaleido', name: '万華鏡', mode: 6 },
  { id: 'mirror', name: 'ミラー', mode: 7 },
  { id: 'crt', name: 'ブラウン管', mode: 8 },
  { id: 'leak', name: 'ライトリーク', mode: 9 },
  { id: 'pulse', name: 'ビートズーム', mode: 10 },
  { id: 'shake', name: 'シェイク', mode: 11 },
  { id: 'duo', name: 'デュオトーン', mode: 12 },
];

const VS = `
attribute vec2 pos; varying vec2 uv;
void main(){ uv = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }`;

const FS = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 res;
uniform float t, amt, mode;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 S(vec2 p){ return texture2D(tex, clamp(p, 0.0, 1.0)).rgb; }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 screen(vec3 a, vec3 b){ return 1.0 - (1.0 - a) * (1.0 - b); }

vec3 blur(vec2 p, float r){
  vec3 s = S(p) * 2.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * 0.785398;
    s += S(p + vec2(cos(a), sin(a)) * r * vec2(res.y / res.x, 1.0));
    s += S(p + vec2(cos(a), sin(a)) * r * 2.2 * vec2(res.y / res.x, 1.0)) * 0.6;
  }
  return s / 14.8;
}

void main(){
  vec2 p = uv;
  vec3 c = S(p);
  float m = mode;

  if (m < 0.5) {
    // none
  } else if (m < 1.5) {                       // グリッチ
    float tt = floor(t * 9.0);
    float band = floor(p.y * 26.0 + tt * 7.0);
    float on = step(0.84, hash(vec2(band, tt))) * amt;
    p.x += (hash(vec2(band, 1.0)) - 0.5) * 0.16 * on;
    float s = (0.006 + 0.02 * on) * amt;
    c = vec3(S(p + vec2(s, 0.0)).r, S(p).g, S(p - vec2(s, 0.0)).b);
    c += on * 0.1 * hash(p * res + t);
    float blk = step(0.97, hash(vec2(floor(p.x * 12.0), floor(p.y * 9.0) + tt))) * amt;
    c = mix(c, c.gbr, blk);
  } else if (m < 2.5) {                       // RGBずらし(色収差)
    vec2 d = (p - 0.5) * 0.05 * amt;
    c = vec3(S(p + d).r, S(p).g, S(p - d).b);
  } else if (m < 3.5) {                       // VHS
    float wob = sin(p.y * 180.0 + t * 9.0) * 0.0012 + sin(p.y * 12.0 + t * 2.0) * 0.002;
    float track = smoothstep(0.0, 0.03, abs(fract(p.y - t * 0.12) - 0.5) - 0.46) ;
    p.x += (wob + (1.0 - track) * 0.03 * sin(t * 40.0)) * amt;
    vec3 v = vec3(S(p + vec2(0.004 * amt, 0.0)).r, S(p).g, S(p - vec2(0.004 * amt, 0.0)).b);
    v *= 0.9 + 0.1 * sin(p.y * res.y * 1.5);
    v = mix(v, vec3(lum(v)), 0.15 * amt);
    v += (hash(p * res + t) - 0.5) * 0.12 * amt;
    v += (1.0 - track) * 0.15 * amt;
    c = mix(c, v, amt);
  } else if (m < 4.5) {                       // 平成レトロ / Y2K
    vec3 g = blur(p, 0.006);
    vec3 v = screen(c, g * 0.55);
    v *= mix(vec3(1.0), vec3(1.06, 0.95, 1.1), amt);
    v = v * 0.92 + 0.05;
    v = mix(vec3(lum(v)), v, 1.25);
    v += (hash(p * res + floor(t * 12.0)) - 0.5) * 0.09;
    v *= 1.0 - 0.35 * dot(p - 0.5, p - 0.5) * 2.0;
    c = mix(c, v, clamp(amt, 0.0, 1.0));
  } else if (m < 5.5) {                       // キラふわ(グロー)
    vec3 g = blur(p, 0.012);
    vec3 hi = max(g - 0.45, 0.0) * 1.8;
    vec3 v = screen(c, hi * amt) + 0.04 * amt;
    v = mix(v, v * vec3(1.04, 0.98, 1.05), amt);
    c = v;
  } else if (m < 6.5) {                       // 万華鏡
    vec2 q = (p - 0.5) * vec2(res.x / res.y, 1.0);
    float r = length(q), a = atan(q.y, q.x);
    float seg = 6.2831853 / 6.0;
    a = mod(a + t * 0.2, seg); a = abs(a - seg * 0.5);
    vec2 k = vec2(cos(a), sin(a)) * r;
    k = k / vec2(res.x / res.y, 1.0) + 0.5;
    c = mix(c, S(k), clamp(amt, 0.0, 1.0));
  } else if (m < 7.5) {                       // ミラー
    vec2 q = p; if (q.x > 0.5) q.x = 1.0 - q.x;
    c = mix(c, S(q), clamp(amt, 0.0, 1.0));
  } else if (m < 8.5) {                       // ブラウン管
    vec2 q = p * 2.0 - 1.0;
    q *= 1.0 + dot(q, q) * 0.09 * amt;
    vec2 p2 = q * 0.5 + 0.5;
    if (p2.x < 0.0 || p2.x > 1.0 || p2.y < 0.0 || p2.y > 1.0) { c = vec3(0.0); }
    else {
      vec3 v = vec3(S(p2 + vec2(0.0015, 0.0)).r, S(p2).g, S(p2 - vec2(0.0015, 0.0)).b);
      float sl = 0.82 + 0.18 * sin(p2.y * res.y * 1.2);
      float mask = 0.9 + 0.1 * sin(p2.x * res.x * 2.0);
      v *= mix(1.0, sl * mask, amt);
      v *= 1.0 - 0.5 * dot(q, q) * 0.4 * amt;
      v *= 1.0 + 0.03 * sin(t * 60.0) * amt;
      c = v;
    }
  } else if (m < 9.5) {                       // ライトリーク
    vec3 g = vec3(1.0, 0.5, 0.2) * pow(max(0.0, 1.0 - length(p - vec2(0.1 + 0.12 * sin(t * 0.7), 0.92)) * 1.5), 2.0);
    g += vec3(1.0, 0.2, 0.55) * pow(max(0.0, 1.0 - length(p - vec2(0.95, 0.12 + 0.12 * cos(t * 0.5))) * 1.7), 2.0);
    g += vec3(1.0, 0.85, 0.4) * 0.25 * pow(max(0.0, 1.0 - abs(p.x - 0.03 - 0.02 * sin(t))) * 1.0, 8.0);
    c = screen(c, g * 0.9 * amt);
  } else if (m < 10.5) {                      // ビートズーム
    float beat = pow(max(0.0, sin(t * 6.2831853 * 1.8)), 4.0) * amt;
    float z = 1.0 + 0.09 * beat;
    vec2 q = (p - 0.5) / z + 0.5;
    vec2 d = (q - 0.5) * 0.03 * beat;
    c = vec3(S(q + d).r, S(q).g, S(q - d).b);
    c *= 1.0 + 0.12 * beat;
  } else if (m < 11.5) {                      // シェイク
    vec2 o = vec2(sin(t * 53.0), cos(t * 47.0)) * 0.008 * amt;
    vec2 d = vec2(0.004 * amt, 0.0);
    c = vec3(S(p + o + d).r, S(p + o).g, S(p + o - d).b);
  } else {                                    // デュオトーン
    float l = lum(c);
    vec3 d = mix(vec3(0.12, 0.02, 0.38), vec3(1.0, 0.45, 0.75), smoothstep(0.0, 1.0, l));
    c = mix(c, d, clamp(amt, 0.0, 1.0));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class PostFx {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('webgl');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
    gl.useProgram(pg);
    this.pg = pg;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pg, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['tex', 'res', 't', 'amt', 'mode']) this.u[n] = gl.getUniformLocation(pg, n);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  // src: canvas。結果は this.canvas に出る
  render(src, w, h, mode, t, amt) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform1i(this.u.tex, 0);
    gl.uniform2f(this.u.res, w, h);
    gl.uniform1f(this.u.t, t);
    gl.uniform1f(this.u.amt, amt);
    gl.uniform1f(this.u.mode, mode);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
