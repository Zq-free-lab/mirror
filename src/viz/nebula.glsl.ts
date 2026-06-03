/**
 * Mirror / 镜 —— 星云粒子 GLSL（R4-T01：InstancedMesh billboard 能量体）
 *
 * 技术路线 B：PlaneGeometry(1,1) + 相机空间 billboard 偏移，
 * 复用三层能量体外观（halo / shell / core），用 vUv 替代 gl_PointCoord。
 *
 * 改进点（R4-T01）：
 *  - 边缘像素级清晰（无 GL 点精灵大小限制）
 *  - 核心锐度下限 18 → 55（低置信节点也有清晰内核）
 *  - 屏幕空间最小尺寸保护（billboardSize ≥ 0.12 世界单位）
 *  - hover/点击通过 instanceId 而非 Points.index 稳准定位
 *
 * 颜色语义（AC-RL-1 红线，与旧版完全一致）：
 *  颜色   = 认知系统（vColor）
 *  亮度   = 置信度（vConfidence 驱动核心亮度/锐度）
 *  抖动   = 怀疑者质疑（aJitter）
 *  闪烁   = 恐怖谷（aUncanny，色差故障感）
 *  下沉   = 衰减/剪枝（aSinkY）
 *  脉动   = 显著性（aPulse）
 */

// ─── Vertex Shader（InstancedMesh billboard）──────────────────────────────────

export const instancedBillboardVertexShader = /* glsl */ `
uniform float uTime;

// 每实例属性（InstancedBufferAttribute）
attribute float aOpacity;
attribute float aSize;
attribute float aPulse;
attribute float aJitter;
attribute vec3  aColor;
attribute float aSinkY;
attribute float aUncanny;

varying float vOpacity;
varying vec3  vColor;
varying float vUncanny;
varying float vConfidence;
varying vec2  vUv;

void main() {
  vUv         = uv;          // PlaneGeometry UV (0~1)，传到 frag 替代 gl_PointCoord
  vColor      = aColor;
  vUncanny    = aUncanny;

  // 从 aSize 反推 confidence：lerp(0.5, 1.5, conf) 的逆操作
  vConfidence = clamp(aSize - 0.5, 0.0, 1.0);

  // ── 从 instanceMatrix 提取节点语义世界坐标 ─────────────────────────────────
  vec4 baseWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // ── 等离子噪声微扰（活体内部感）───────────────────────────────────────────
  float noise = sin(baseWorld.x * 5.1 + uTime * 0.8) *
                cos(baseWorld.y * 4.3 + uTime * 1.1) * 0.012;

  // ── 抖动（怀疑者质疑，红线：来自 aJitter = skepticFlag）─────────────────
  float jitter = aJitter * sin(uTime * 13.0 + baseWorld.y * 7.3) * 0.03;

  // ── 世界空间位移（jitter + noise + 衰减下沉）────────────────────────────
  vec3 worldPos = baseWorld.xyz + vec3(
    jitter + noise,
    jitter * 0.7 + noise - aSinkY,
    jitter * 1.3
  );

  // ── 变换到相机空间 ────────────────────────────────────────────────────────
  vec4 camPos = modelViewMatrix * vec4(worldPos, 1.0);

  // ── 呼吸脉动（salience → 大小波动，红线：来自 aPulse = salience）──────────
  float breath      = sin(uTime * 1.5 + baseWorld.x * 3.14) * 0.5 + 0.5;
  float pulseFactor = 1.0 + aPulse * 0.3 * breath;

  // ── Billboard 尺寸（世界空间，含最小尺寸保护）────────────────────────────
  // aSize ∈ [0.5, 1.5]，乘 0.23 → 直径 0.115~0.345 世界单位
  // clamp 最小 0.12 ≈ 21px（@depth 3.5, fov 60°, h 700px），清晰度底线
  float billboardSize = max(aSize * 0.23 * pulseFactor, 0.12);

  // ── Billboard：在相机空间叠加顶点偏移（始终朝向相机）─────────────────────
  // position.xy ∈ [-0.5, 0.5]（PlaneGeometry 局部顶点）
  camPos.xy += position.xy * billboardSize;

  gl_Position = projectionMatrix * camPos;

  // ── Opacity（含恐怖谷幽暗闪烁）──────────────────────────────────────────
  float uncannyF = aUncanny * (0.5 + 0.5 * sin(uTime * 4.1 + baseWorld.z * 5.1));
  vOpacity = aOpacity * (aUncanny > 0.5 ? (0.35 + 0.65 * (1.0 - uncannyF)) : 1.0);
}
`;

// ─── Fragment Shader（三层能量体，vUv 替代 gl_PointCoord）────────────────────

export const energyBodyFragmentShader = /* glsl */ `
varying float vOpacity;
varying vec3  vColor;
varying float vUncanny;
varying float vConfidence;
varying vec2  vUv;

void main() {
  vec2  uv   = vUv - 0.5;   // 居中：-0.5~0.5
  float dist = length(uv);

  // 超出圆盘范围丢弃（圆形裁切）
  if (dist > 0.5) discard;

  // ────────────────────────────────────────────────────────────────────────
  // ① Halo（Layer 3：外层弥散辉光，宽广、低亮）
  // ────────────────────────────────────────────────────────────────────────
  float halo = exp(-dist * dist * 4.5) * 0.22;

  // ────────────────────────────────────────────────────────────────────────
  // ② Shell（Layer 2：菲涅尔边缘光——中心透明、边缘发光）
  // ────────────────────────────────────────────────────────────────────────
  float shellRise = smoothstep(0.05, 0.35, dist);
  float shellFall = smoothstep(0.5,  0.25, dist);
  float shell     = shellRise * shellFall * (0.2 + 0.8 * vConfidence) * 0.55;

  // ────────────────────────────────────────────────────────────────────────
  // ③ Core（Layer 1：锐利亮核——置信度→锐度）
  // R4-T01：下限 18 → 55，低置信节点也有清晰内核
  // ────────────────────────────────────────────────────────────────────────
  float coreSharpness = mix(55.0, 140.0, vConfidence);
  float core          = exp(-dist * dist * coreSharpness) * (0.5 + 0.9 * vConfidence);

  // ────────────────────────────────────────────────────────────────────────
  // 颜色合成（语义为真：颜色=认知系统，亮度=置信度）
  // ────────────────────────────────────────────────────────────────────────
  vec3 haloColor  = vColor * 0.45;
  vec3 shellColor = vColor * 1.1;
  vec3 warmWhite  = vec3(1.0, 0.96, 0.88);            // 暖白金核心
  vec3 coreColor  = mix(vColor, warmWhite, 0.65 * vConfidence);

  vec3  finalColor = haloColor * halo + shellColor * shell + coreColor * core;
  float finalAlpha = (halo * 0.7 + shell * 0.8 + core) * vOpacity;

  // ────────────────────────────────────────────────────────────────────────
  // 恐怖谷：色差抖动（红/蓝通道错位，营造故障感）
  // ────────────────────────────────────────────────────────────────────────
  if (vUncanny > 0.5) {
    float glitch = sin(uv.y * 60.0 + vConfidence * 6.28) * 0.28;
    finalColor.r = clamp(finalColor.r + glitch * 0.25,  0.0, 1.5);
    finalColor.b = clamp(finalColor.b - glitch * 0.18,  0.0, 1.5);
  }

  gl_FragColor = vec4(finalColor, clamp(finalAlpha, 0.0, 1.0));
}
`;

// ── 保留旧名兼容（内部过渡期，将在 R4 完成后删除）──────────────────────────
/** @deprecated Use instancedBillboardVertexShader */
export const nebulaVertexShader = instancedBillboardVertexShader;
/** @deprecated Use energyBodyFragmentShader */
export const nebulaFragmentShader = energyBodyFragmentShader;
