# Mirror / 镜

**你也能看见的，AI 眼中的你。**

Mirror 不展示 AI 记住了什么——它展示 **AI 把你理解成了一个什么样的人**，并把改写这个理解的权力交还给你。

🔗 **Live demo**：[mirror-app-wine.vercel.app](https://mirror-app-wine.vercel.app)

---

## 核心差异

现有 AI 记忆产品（ChatGPT Memory、Mem0…）只让你看 AI 记住的**事实**。Mirror 给你看的是更有价值、也更让人不安的东西：**推断层**——AI 从你的行为里猜出来的、你从没明说过的"关于你的理论"，每条带置信度、证据链、可否决权。

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 2 · 认知身体（浏览器）                                   │
│  认知星云(r3f+shader+bloom) · 视觉映射 · 对质重组 · 时间机器  │
├─────────────────────────────────────────────────────────────┤
│ Layer 1 · 认知引擎                                            │
│  ┌ 浏览器侧：embedding(transformers.js) · UMAP · 衰减        │
│  └ serverless：五 Agent 编排 · 校准 · 信念修正               │
├─────────────────────────────────────────────────────────────┤
│ Layer 0 · 数据入口（浏览器）                                   │
│  预置 seed · 现场补一句 · 导入(ChatGPT/Claude 导出)           │
│  持久化：IndexedDB(Dexie) —— 数据不出本机                     │
└─────────────────────────────────────────────────────────────┘
```

### 五 Agent 心智社会

| Agent | 职责 | AI 能力 |
|---|---|---|
| **Observer** | 从对话流抽取事实 + 行为信号 | 结构化抽取 |
| **Inferer** | 形成心理假设（置信度 + 证据链）| 校准化推理 |
| **Skeptic** | 红队审查：过拟合？越界？恐怖谷？| 自我批判 |
| **Reconciler** | 新旧证据矛盾时做信念修正 | 矛盾检测 + 信念更新 |
| **Reflector** | 定期全局元认知反思 | meta-cognition |

### 视觉语义为真（核心红线）

每个视觉属性 = 一个真实内部量，无纯装饰：

| 视觉 | 语义 |
|---|---|
| 亮度 | confidence × decayFactor |
| 大小 | 置信度 |
| 脉动 | salience（情绪显著性）|
| 抖动 | Skeptic 正在质疑 |
| 张力线 | 两条推断互相矛盾 |
| 下沉 | 记忆衰减 |
| 幽暗闪烁 | 恐怖谷推断 |

---

## 交互

- **星云旋转**：拖动旋转（OrbitControls 阻尼）；空闲时缓慢自转
- **节点 hover**：悬停显示诗意名 + 脑区 + 置信度
- **节点点击**：右侧展开证据链 + 否决权；点其他节点直接切换
- **关闭面板**：点击空白区域 / 按 Esc / 点 ×
- **对质**：NodeInspector 底部输入否决原因 → 左侧展开审议流

---

## 快速开始

### 1. 克隆 & 安装

```bash
git clone <repo-url>
cd mirror
npm install
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env.local`，填入你的 LLM API Key：

```bash
cp .env.example .env.local
```

```env
# 默认使用 DeepSeek（国内可用、推理强）
LLM_API_KEY=your_deepseek_api_key_here
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL_FAST=deepseek-chat
LLM_MODEL_REASONING=deepseek-reasoner

# Embedding 默认本地（@xenova/transformers），无需 Key
NEXT_PUBLIC_EMBEDDING_PROVIDER=local
```

### 3. 本地运行

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，即见"认识你三个月"的预置星云。

### 4. 一键部署 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=<repo-url>)

在 Vercel 环境变量中填入 `LLM_API_KEY` 等配置，部署后分享 URL 即可演示。

---

## 演示流程（Demo）

### 无 Key 演示（5 分钟，看星云）
1. 直接打开 URL，看预置的"三个月星云"
2. 点击任意节点 → 右侧展开证据链 + 否决权
3. 注意恐怖谷节点（幽暗闪烁）——"你脑子里一直有件事没说出口"
4. 底部时间机器 → 拖动滑块，看推断如何被修正（"上月以为X → 本周改判Y"）

### 有 Key 演示（现场补一句）
1. 底部输入框补一句话（如"我最近睡眠很差"）
2. 观察星云实时生长——新粒子从边缘凝结进来
3. 点击新节点，看 AI 推断 + 证据链
4. 输入"这条判断错了，因为……" → 触发对质
5. 左侧展开审议流（怀疑者+调和者实时思考）→ 星云结构重组

---

## 技术亮点

- **多 Agent 编排**：自研轻量编排（无 LangChain），五 Agent 顺序 pipeline，每步 Zod 校验，失败降级不阻断
- **校准化推理**：双层校准（先验规则 + 在线分桶）防 LLM 虚报置信度，并暴露校准曲线（声称 vs 实际命中率）
- **本地 Embedding**：@xenova/transformers 浏览器本地运行，零 Key，数据不出本机，语义位置由 UMAP 降维决定
- **事件溯源**：所有信念变化以 EvolutionEvent 记录，时间机器可回放任意时刻的认知状态
- **可配置 Provider**：LLM / Embedding 双抽象层，一行配置切换 DeepSeek / Claude / OpenAI
- **像素级清晰渲染**：InstancedMesh billboard + 自定义 GLSL，三层能量体（亮核/菲涅尔壳/Halo）边缘锐利，无 GL 点精灵大小限制

---

## 测试

```bash
npm run test          # 全量单测（16 文件，256 条）
npm run test:coverage # 覆盖率报告
```

主要覆盖：五 Agent AC 验收、校准 AC-CAL-1/2/3、布局 AC-LAY-1/2、衰减 AC-DEC-1/2、数据层 AC-DB-1、Seed AC-SEED-1/AC-RL-3/AC-RL-6、视觉映射 AC-RL-1。

---

## 目录结构

```
src/
├── core/                # ⭐ Layer 1 引擎（可单独集成）
│   ├── agents/          # 五 Agent + pipeline
│   ├── llm/             # LLMProvider 抽象 + DeepSeek adapter
│   ├── embedding/       # EmbeddingProvider + 本地 MiniLM
│   ├── calibration.ts   # 置信度校准（先验 + 在线分桶）
│   ├── layout.ts        # UMAP + 星团引力布局
│   └── decay.ts         # 记忆衰减/显著性模型
├── data/                # Layer 0 数据入口
│   ├── db.ts            # Dexie IndexedDB
│   ├── seed.ts          # 预置"三个月"星云（43 节点）
│   └── import.ts        # ChatGPT/Claude 导出解析
├── viz/                 # Layer 2 认知身体
│   ├── Nebula.tsx       # 星云粒子系统（r3f）
│   ├── nebula.glsl.ts   # 自定义 GLSL shader
│   ├── visualMapping.ts # 节点 → 视觉属性（红线）
│   ├── NodeInspector.tsx# 证据链 + 否决权
│   ├── Confrontation.tsx# 对质状态机 + 审议流
│   ├── TimeMachine.tsx  # 演变层时间轴
│   ├── ShareCard.tsx    # 脱敏分享卡
│   └── LoadingNebula.tsx# 凝结加载动画
├── store/
│   └── useMirrorStore.ts# Zustand 全局状态
└── app/
    ├── page.tsx          # 主页面
    └── api/
        ├── infer/        # POST /api/infer（五 Agent pipeline）
        └── confront/     # POST /api/confront（流式对质 SSE）
```

---

## 配置项

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `LLM_API_KEY` | LLM API Key（服务端，不暴露前端）| 无（必填）|
| `LLM_BASE_URL` | OpenAI 兼容端点 | DeepSeek |
| `LLM_MODEL_FAST` | 抽取/推断用模型 | `deepseek-chat` |
| `LLM_MODEL_REASONING` | 对质审议用模型（支持 reasoning）| `deepseek-reasoner` |
| `NEXT_PUBLIC_EMBEDDING_PROVIDER` | `local` 或 `cloud` | `local` |

---

## 关于

Mirror / 镜 是一个 AI 产品探索项目，开源地址：[github.com/Zq-free-lab/mirror](https://github.com/Zq-free-lab/mirror)。

核心命题：**推断层透明化**——把 AI 对用户的"理论"可见化，并把纠正权还给用户。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
