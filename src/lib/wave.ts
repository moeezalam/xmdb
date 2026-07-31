/**
 * PSP XMB wave background.
 *
 * WebGL1 fragment shader: a stack of phase-offset ribbons rendered as inverse
 * distance glow over a vertical gradient, plus drifting motes. The original
 * firmware picks its theme colour from the system month; the palette below is
 * an approximation by eye, not a rip of the firmware theme files.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uColA;   // ribbon / highlight colour
uniform vec3  uColB;   // deep background colour
uniform float uIntensity;

// One ribbon: two summed sines so the crest never looks like a pure sinusoid.
float ribbon(vec2 uv, float phase, float amp, float freq, float speed, float thick) {
  float y = amp * sin(uv.x * freq + uTime * speed + phase)
          + amp * 0.45 * sin(uv.x * freq * 1.73 - uTime * speed * 0.66 + phase * 2.1)
          + amp * 0.2  * sin(uv.x * freq * 3.1  + uTime * speed * 1.4  + phase * 0.7);
  float d = abs(uv.y - y);
  // Wide, soft falloff — the PSP wave is a glow, not a stroked line.
  return thick / (d * d * 140.0 + d * 1.6 + thick);
}

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  // -0.5..0.5 on y, aspect-corrected x so the wave keeps its shape when scaled.
  vec2 uv = vec2(frag.x, frag.y - 0.5);

  // Deep vertical gradient. Darkest at the top, like the PSP's default theme.
  vec3 col = mix(uColB * 0.28, uColB * 0.85, smoothstep(0.0, 1.0, frag.y));
  col += uColA * 0.06 * (1.0 - abs(uv.y) * 1.4);

  float glow = 0.0;
  glow += ribbon(uv, 0.0, 0.10, 3.1, 0.30, 0.030) * 1.00;
  glow += ribbon(uv, 2.1, 0.15, 2.2, 0.22, 0.048) * 0.62;
  glow += ribbon(uv, 4.3, 0.07, 4.6, 0.41, 0.020) * 0.48;
  glow += ribbon(uv, 1.2, 0.19, 1.6, 0.16, 0.062) * 0.34;

  col += uColA * glow * 0.55 * uIntensity;
  col += vec3(1.0) * glow * glow * 0.14 * uIntensity;

  // Slow rising motes.
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float sx = hash(fi * 12.9898);
    float sp = 0.010 + hash(fi * 78.233) * 0.024;
    float py = fract(hash(fi * 3.14159) + uTime * sp);
    float px = sx + sin(uTime * 0.25 + fi) * 0.015;
    float r  = 0.0016 + hash(fi * 5.5) * 0.0035;
    float d  = length((vec2(px, py) - frag) * vec2(uRes.x / uRes.y, 1.0));
    col += uColA * (r / (d + r * 0.9)) * 0.30 * smoothstep(0.0, 0.15, py) * (1.0 - py);
  }

  // Vignette.
  float v = 1.0 - 0.55 * pow(length((frag - 0.5) * vec2(1.15, 1.0)), 2.2);
  gl_FragColor = vec4(col * v, 1.0);
}
`

/** Approximate month palette: [ribbon, background]. Index 0 = January. */
const MONTH_COLOURS: [number[], number[]][] = [
  [[0.35, 0.55, 0.95], [0.05, 0.10, 0.26]], // Jan  ice blue
  [[0.85, 0.45, 0.70], [0.18, 0.05, 0.16]], // Feb  rose
  [[0.55, 0.85, 0.55], [0.06, 0.16, 0.08]], // Mar  spring green
  [[0.95, 0.72, 0.85], [0.18, 0.08, 0.18]], // Apr  blossom
  [[0.55, 0.90, 0.70], [0.05, 0.17, 0.13]], // May  fresh green
  [[0.45, 0.70, 0.95], [0.04, 0.11, 0.24]], // Jun  rain blue
  [[0.40, 0.90, 0.95], [0.03, 0.15, 0.20]], // Jul  aqua
  [[0.98, 0.78, 0.35], [0.20, 0.11, 0.03]], // Aug  sun
  [[0.90, 0.60, 0.30], [0.18, 0.09, 0.04]], // Sep  amber
  [[0.85, 0.45, 0.25], [0.17, 0.06, 0.04]], // Oct  rust
  [[0.70, 0.55, 0.85], [0.11, 0.07, 0.20]], // Nov  dusk violet
  [[0.60, 0.75, 0.98], [0.06, 0.09, 0.22]], // Dec  winter
]

export interface WaveHandle {
  stop(): void
  setIntensity(v: number): void
}

export function startWave(canvas: HTMLCanvasElement, month = new Date().getMonth()): WaveHandle | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
  if (!gl) {
    console.warn('WebGL unavailable — falling back to the CSS gradient background.')
    return null
  }

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Wave shader failed to compile:', gl.getShaderInfoLog(sh))
      gl.deleteShader(sh)
      return null
    }
    return sh
  }

  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null

  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Wave program failed to link:', gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uRes = gl.getUniformLocation(prog, 'uRes')
  const uTime = gl.getUniformLocation(prog, 'uTime')
  const uColA = gl.getUniformLocation(prog, 'uColA')
  const uColB = gl.getUniformLocation(prog, 'uColB')
  const uIntensity = gl.getUniformLocation(prog, 'uIntensity')

  const [colA, colB] = MONTH_COLOURS[((month % 12) + 12) % 12]
  gl.uniform3fv(uColA, colA)
  gl.uniform3fv(uColB, colB)

  let intensity = 1
  let raf = 0
  let running = true
  const t0 = performance.now()

  const resize = () => {
    // Half-resolution render: the wave is soft, nobody can tell, and it keeps
    // the shader cheap on integrated GPUs.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * 0.6))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * 0.6))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    gl.uniform2f(uRes, canvas.width, canvas.height)
  }

  const frame = () => {
    if (!running) return
    resize()
    gl.uniform1f(uTime, (performance.now() - t0) / 1000)
    gl.uniform1f(uIntensity, intensity)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    raf = requestAnimationFrame(frame)
  }
  frame()

  return {
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    setIntensity(v: number) {
      intensity = v
    },
  }
}
