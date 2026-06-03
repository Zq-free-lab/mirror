"use client";
/**
 * Mirror / 镜 —— 认知星云渲染（R4-T01：InstancedMesh billboard 能量体）
 *
 * 技术路线 B：
 *  - 节点从 <Points> 改为 InstancedMesh + PlaneGeometry(1,1) billboard
 *  - 复用三层能量体 fragment shader（外观不变）
 *  - 边缘像素级清晰，hover/点击通过 instanceId 稳准定位
 *  - 保持所有视觉语义（position=坐标, size=置信度, pulse=显著, jitter=怀疑...）
 *
 * R4-T01 变更：
 *  - NebulaParticles：<points> → <instancedMesh>，MAX_NODES=256 预分配
 *  - 核心锐度下限 18→55（见 nebula.glsl.ts）
 *  - 屏幕空间最小尺寸保护（billboardSize ≥ 0.12）
 *  - onClick 用 event.instanceId（精准）
 *  - onPointerOver/Out props 预留（R4-T02 hover 态用）
 */
import { useRef, useMemo, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, QuadraticBezierLine, Text } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { CognitiveNode } from "@/core/types";
import { graphToVisuals } from "./visualMapping";
import { instancedBillboardVertexShader, energyBodyFragmentShader } from "./nebula.glsl";
import { BG, HOLO, MOTION, SYSTEM_COLORS } from "./theme";
import { SYSTEM_META } from "@/core/types";
import type { CognitiveSystemId } from "@/core/types";

// 辅助：从 SYSTEM_META 取颜色和诗意名（R4-T07 用）
const SYSTEM_META_COLOR  = (s: CognitiveSystemId) => SYSTEM_COLORS[s].base;
const SYSTEM_POETIC_NAME = (s: CognitiveSystemId) => SYSTEM_META[s].poeticName;

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 预分配实例上限（覆盖 seed 43 + 用户多轮输入，无需重建几何体）。 */
const MAX_NODES = 256;

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface NebulaCoreProps {
  nodes: CognitiveNode[];
  selectedId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  /** R4-T02 预留：hover 进入节点 */
  onNodeHover?: (nodeId: string | null) => void;
}

// ─── 场景环境设置（FogExp2）────────────────────────────────────────────────────

function SceneSetup() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2(BG.fogColor, BG.fogDensity);
    return () => { scene.fog = null; };
  }, [scene]);
  return null;
}

// ─── 背景星尘 ─────────────────────────────────────────────────────────────────

function BackgroundStarfield() {
  const geo = useMemo(() => {
    const count = 600;
    const positions = new Float32Array(count * 3);
    let seed = 98765;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    for (let i = 0; i < count; i++) {
      const r = 4.0 + rng() * 6.0;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  const mat = useMemo(() => new THREE.PointsMaterial({
    size: 0.018,
    color: "#8AB4FF",
    transparent: true,
    opacity: 0.28,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  return <points geometry={geo} material={mat} />;
}

// ─── R4-T08 张力线 → 发光弧光（QuadraticBezierLine）──────────────────────────
// 矛盾节点间用二次贝塞尔弧代替直线虚线，弧向外鼓出，视觉上有张力感。

function TensionLines({ nodes }: { nodes: CognitiveNode[] }) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const arcs = useMemo(() => {
    const result: Array<{
      start: THREE.Vector3;
      end: THREE.Vector3;
      mid: THREE.Vector3;
      key: string;
    }> = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      if (!node.position || node.contradicts.length === 0) continue;
      for (const contraId of node.contradicts) {
        const pair = [node.id, contraId].sort().join("-");
        if (seen.has(pair)) continue;
        seen.add(pair);
        const other = nodeMap.get(contraId);
        if (!other?.position) continue;
        const from = new THREE.Vector3(...node.position);
        const to   = new THREE.Vector3(...other.position);
        // 控制点：两端中点 + 向外（+Y）鼓出，形成弧形张力感
        const mid  = from.clone().lerp(to, 0.5);
        mid.y += 0.25 + from.distanceTo(to) * 0.15;
        result.push({ start: from, end: to, mid, key: pair });
      }
    }
    return result;
  }, [nodes, nodeMap]);

  if (arcs.length === 0) return null;

  return (
    <>
      {arcs.map(({ start, end, mid, key }) => (
        <QuadraticBezierLine
          key={key}
          start={start}
          end={end}
          mid={mid}
          color={HOLO.tension}
          lineWidth={1.2}
          opacity={0.55}
          transparent
        />
      ))}
    </>
  );
}

// ─── R4-T07 常驻标签（高置信/高显著节点）───────────────────────────────────
// 可见性绑真实量（红线）：只有 confidence ≥ 0.65 且 salience ≥ 0.55 的节点显示标签。

// 阈值：只对最突出节点（前 ~20%）显示标签，避免密集覆盖
// seed 数据 conf 峰值约 0.55~0.75，取上四分位
const LABEL_CONF_MIN    = 0.62;
const LABEL_SALIENCE_MIN = 0.60;

function NodeLabels({ nodes, selectedId }: { nodes: CognitiveNode[]; selectedId?: string | null }) {
  // 只渲染符合门槛的节点标签（语义为真，每系统最多 2 个，按 confidence 降序）
  const labelNodes = useMemo(() => {
    const qualifying = nodes.filter((n) =>
      n.position &&
      n.confidence >= LABEL_CONF_MIN &&
      n.salience   >= LABEL_SALIENCE_MIN
    ).sort((a, b) => b.confidence - a.confidence);

    // 每个认知系统最多取 2 个（避免同系统标签密集堆叠）
    const countPerSystem: Record<string, number> = {};
    return qualifying.filter((n) => {
      const c = countPerSystem[n.system] ?? 0;
      if (c >= 2) return false;
      countPerSystem[n.system] = c + 1;
      return true;
    });
  }, [nodes]);

  if (labelNodes.length === 0) return null;

  return (
    <>
      {labelNodes.map((node) => {
        if (!node.position) return null;
        const [x, y, z] = node.position;
        const isSelected = node.id === selectedId;
        // 偏移：标签出现在节点正上方
        const labelY = y + 0.22 + node.confidence * 0.08;

        return (
          <Text
            key={node.id}
            position={[x, labelY, z]}
            fontSize={0.07}
            color={isSelected ? "#ffffff" : SYSTEM_META_COLOR(node.system)}
            anchorX="center"
            anchorY="bottom"
            depthOffset={-1}
            outlineWidth={0.004}
            outlineColor="#000000"
            // billboard：Text 默认跟随相机朝向，无需额外设置
          >
            {SYSTEM_POETIC_NAME(node.system)}
          </Text>
        );
      })}
    </>
  );
}

// ─── InstancedMesh 节点粒子系统（R4-T01 核心改动）────────────────────────────

function NebulaParticles({ nodes, selectedId, onNodeClick, onNodeHover }: NebulaCoreProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  // ── 预分配 per-instance 属性数组（MAX_NODES，全生命周期不重建）──────────
  const colors    = useMemo(() => new Float32Array(MAX_NODES * 3), []);
  const opacities = useMemo(() => new Float32Array(MAX_NODES),     []);
  const sizes     = useMemo(() => new Float32Array(MAX_NODES),     []);
  const pulses    = useMemo(() => new Float32Array(MAX_NODES),     []);
  const jitters   = useMemo(() => new Float32Array(MAX_NODES),     []);
  const sinks     = useMemo(() => new Float32Array(MAX_NODES),     []);
  const uncannys  = useMemo(() => new Float32Array(MAX_NODES),     []);

  // ── 几何体（PlaneGeometry 1×1 + InstancedBufferAttribute）──────────────
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    // InstancedBufferAttribute：每实例一个值，shader 里按 instanceId 取
    geo.setAttribute("aColor",   new THREE.InstancedBufferAttribute(colors,    3));
    geo.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(opacities, 1));
    geo.setAttribute("aSize",    new THREE.InstancedBufferAttribute(sizes,     1));
    geo.setAttribute("aPulse",   new THREE.InstancedBufferAttribute(pulses,    1));
    geo.setAttribute("aJitter",  new THREE.InstancedBufferAttribute(jitters,   1));
    geo.setAttribute("aSinkY",   new THREE.InstancedBufferAttribute(sinks,     1));
    geo.setAttribute("aUncanny", new THREE.InstancedBufferAttribute(uncannys,  1));
    return geo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 依赖稳定 Float32Array 引用，几何体只建一次

  // ── ShaderMaterial（billboard 能量体，additive blending）───────────────
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   instancedBillboardVertexShader,
        fragmentShader: energyBodyFragmentShader,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        side:        THREE.DoubleSide, // 确保任意角度可见（billboard 始终朝相机，保险）
      }),
    []
  );

  // ── 辅助 Object3D（复用，避免 useEffect 里重复 new）─────────────────────
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ── 每次 nodes / selectedId 变化时更新实例矩阵 + per-instance 属性 ──────
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = nodes.length;

    const now     = new Date();
    const visuals = graphToVisuals(nodes, now);
    const hasSelection = selectedId != null;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const vis  = visuals.get(node.id);
      if (!vis) continue;

      // 实例矩阵：语义坐标（sinkY / jitter / noise 由 shader 每帧处理）
      dummy.position.set(vis.position[0], vis.position[1], vis.position[2]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const c = new THREE.Color(vis.color);
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      // R4-T05 选中态：其余节点 opacity × 0.35 压暗（仅渲染层，语义量不变）
      const isSelected = node.id === selectedId;
      opacities[i] = hasSelection && !isSelected ? vis.opacity * 0.35 : vis.opacity;

      sizes[i]     = vis.size;
      pulses[i]    = vis.pulse;
      jitters[i]   = vis.jitter;
      sinks[i]     = vis.sinkY;
      uncannys[i]  = vis.uncannyFlicker ? 1.0 : 0.0;
    }

    mesh.instanceMatrix.needsUpdate = true;
    const geo = mesh.geometry;
    ["aColor", "aOpacity", "aSize", "aPulse", "aJitter", "aSinkY", "aUncanny"].forEach((k) => {
      const attr = geo.attributes[k];
      if (attr) attr.needsUpdate = true;
    });
  }, [nodes, selectedId, dummy, colors, opacities, sizes, pulses, jitters, sinks, uncannys]);

  // ── R4-T05：选中时相机平滑聚焦到选中节点 ─────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node?.position) return;
    const [tx, ty, tz] = node.position;
    const startPos = camera.position.clone();
    // 聚焦方向：向选中节点靠近（保持距离不变，只调整朝向）
    const target = new THREE.Vector3(tx, ty, tz);
    const dir    = camera.position.clone().sub(target).normalize();
    const dist   = Math.max(camera.position.distanceTo(target) * 0.7, 2.0);
    const endPos = target.clone().add(dir.multiplyScalar(dist));

    let start: number | null = null;
    const duration = 800; // ms
    const animate = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
      camera.position.lerpVectors(startPos, endPos, ease);
      camera.lookAt(tx, ty, tz);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  // camera 引用稳定，不需要加入依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── 每帧更新 uTime（驱动动效）────────────────────────────────────────────
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (mesh) {
      (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  if (nodes.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_NODES]}
      frustumCulled={false}  // 实例位置散布，禁用 frustum 剔除防误裁
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && onNodeClick) {
          onNodeClick(nodes[e.instanceId].id);
        }
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && onNodeHover) {
          onNodeHover(nodes[e.instanceId].id);
        }
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onNodeHover?.(null);
      }}
    />
  );
}

// ─── R4-T04 OrbitControls + 空闲自转 ─────────────────────────────────────────
// 拖动时暂停自转（isDragging），松开后恢复缓慢漂移。
// OrbitControls enableDamping 提供惯性手感。

function OrbitControlsWithDrift() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isDragging   = useRef(false);
  // R4-T09：prefers-reduced-motion → 禁用自转漂移（用户系统偏好）
  const prefersReduced = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  // 自转相位偏移：用户松手时保持当前角度，从该点继续漂移
  const driftOffset  = useRef(0);
  const lastDriftT   = useRef(0);

  const handleStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    // 记录用户松手时的时钟时间，后续漂移从当前方位继续
    lastDriftT.current = -1; // 标记：下一帧重新校准 offset
  }, []);

  useFrame(({ clock, camera }) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (!isDragging.current && !prefersReduced) {
      const t = clock.getElapsedTime();
      // 第一次空闲帧：计算 offset，使漂移从当前相机位置无缝接续
      if (lastDriftT.current === -1) {
        const currentAngle = Math.atan2(camera.position.x, camera.position.z);
        driftOffset.current = currentAngle - t * MOTION.cameraDriftSpeed;
        lastDriftT.current = t;
      }
      const angle = t * MOTION.cameraDriftSpeed + driftOffset.current;
      const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      const r = Math.max(radius, 2.5); // 保持最小距离
      camera.position.x = Math.sin(angle) * r;
      camera.position.z = Math.cos(angle) * r;
      camera.position.y += (Math.sin(t * 0.4) * 0.35 - camera.position.y) * 0.01;
      camera.lookAt(0, 0, 0);
      ctrl.target.set(0, 0, 0);
    }

    ctrl.update(); // 必须每帧调用以应用 damping
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      minDistance={1.5}
      maxDistance={8}
      enablePan={false}
      onStart={handleStart}
      onEnd={handleEnd}
    />
  );
}

// ─── 主导出组件 ───────────────────────────────────────────────────────────────

export function NebulaCoreScene({ nodes, selectedId, onNodeClick, onNodeHover }: NebulaCoreProps) {
  return (
    <>
      {/* 场景环境：FogExp2 深空体积雾 */}
      <SceneSetup />

      {/* R4-T04：OrbitControls（阻尼旋转）+ 空闲缓慢自转 */}
      <OrbitControlsWithDrift />

      {/* 极暗环境光 */}
      <ambientLight intensity={0.015} />

      {/* 背景星尘（远景深空感） */}
      <BackgroundStarfield />

      {/* 认知节点（InstancedMesh billboard 三层能量体） */}
      <NebulaParticles
        nodes={nodes}
        selectedId={selectedId}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
      />

      {/* R4-T08：矛盾张力线（QuadraticBezierLine 发光弧） */}
      <TensionLines nodes={nodes} />

      {/* R4-T07：高置信/高显著节点常驻标签（可见性绑真实量） */}
      <NodeLabels nodes={nodes} selectedId={selectedId} />
    </>
  );
}

export { NebulaCoreScene as default };
