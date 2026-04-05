"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
      + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p) {
    float f = 0.0;
    f += 0.5000 * snoise(p); p *= 2.02;
    f += 0.2500 * snoise(p); p *= 2.03;
    f += 0.1250 * snoise(p); p *= 2.01;
    f += 0.0625 * snoise(p);
    return f / 0.9375;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = u_time * 0.15;

    // Mouse influence — responsive, tight radius
    vec2 mouse = vec2(u_mouse.x * aspect, u_mouse.y);
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.4, 0.0, mouseDist) * 0.4;

    // Layered fluid noise
    float n1 = fbm(p * 1.5 + vec2(t * 0.7, t * 0.4) + mouseInfluence);
    float n2 = fbm(p * 2.0 + vec2(-t * 0.5, t * 0.6) + n1 * 0.5);
    float n3 = fbm(p * 1.2 + vec2(t * 0.3, -t * 0.8) + n2 * 0.3);

    // Neutral dark palette — grays and cool whites
    vec3 col1 = vec3(0.06, 0.06, 0.07);  // near black
    vec3 col2 = vec3(0.10, 0.10, 0.12);  // dark gray
    vec3 col3 = vec3(0.08, 0.09, 0.11);  // charcoal
    vec3 col4 = vec3(0.12, 0.12, 0.14);  // lighter gray

    float blend = n1 * 0.5 + 0.5;
    float blend2 = n2 * 0.5 + 0.5;

    vec3 color = mix(col1, col2, blend);
    color = mix(color, col3, blend2 * 0.6);
    color = mix(color, col4, (n3 * 0.5 + 0.5) * 0.3);

    // Subtle bright wisps — white/silver smoke
    float wisp = smoothstep(0.3, 0.8, n1 * n2 + 0.3);
    color += wisp * vec3(0.18, 0.18, 0.20) * 0.7;

    // Mouse glow — soft white
    float glow = smoothstep(0.35, 0.0, mouseDist) * 0.2;
    color += glow * vec3(0.7, 0.7, 0.75);

    // Vignette
    float vig = 1.0 - smoothstep(0.3, 0.9, length(uv - 0.5) * 1.2);
    color *= vig * 0.85 + 0.15;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseTargetRef = useRef({ x: 0.5, y: 0.5 });
  const mouseCurrentRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    function compileShader(source: string, type: number) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      return shader;
    }

    const vs = compileShader(VERTEX_SHADER, gl.VERTEX_SHADER);
    const fs = compileShader(FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uMouse = gl.getUniformLocation(program, "u_mouse");

    function resize() {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const scale = dpr * 0.5;
      canvas!.width = canvas!.offsetWidth * scale;
      canvas!.height = canvas!.offsetHeight * scale;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    }

    const startTime = performance.now();

    function animate() {
      const t = (performance.now() - startTime) / 1000;

      // Lerp mouse position for smooth tracking
      const cur = mouseCurrentRef.current;
      const tgt = mouseTargetRef.current;
      cur.x += (tgt.x - cur.x) * 0.15;
      cur.y += (tgt.y - cur.y) * 0.15;

      gl!.uniform1f(uTime, t);
      gl!.uniform2f(uResolution, canvas!.width, canvas!.height);
      gl!.uniform2f(uMouse, cur.x, cur.y);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(animate);
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseTargetRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height,
      };
    }

    resize();
    animate();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}
