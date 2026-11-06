# Image Sizing Core · 图片尺寸处理核心

TypeScript + Sharp 的图片尺寸计算与处理核心：物理尺寸/DPI 换算、整图等比缩放、居中白色边距填充。

**当前阶段：处理核心原型。CLI 尚不完整，本仓库不提供 CLI 命令或可用的桌面插件。**

本项目原创代码采用 [MIT 许可证](LICENSE)，版权署名为 `dongyi00323-dev`。允许使用、修改、分发和商用，须保留版权及许可声明；软件按原样提供，不作担保。第三方依赖保留各自许可证，不因本项目采用 MIT 而改变，见 [依赖许可](THIRD_PARTY_NOTICES.md)。

## 已实现

- `cm`、`mm`、`px` 与 DPI 换算；请求解析时 DPI 默认 300。
- 读取 JPG/PNG 的尺寸、EXIF 方向、透明度、ICC 存在情况和 SHA-256。
- 先按 EXIF 方向旋转，再以 Lanczos3 等比缩放完整源图。
- 居中放置，新增区域填充不透明白色；不裁切，不做非等比拉伸。
- 输出 PNG 或 JPEG，写入 DPI 元数据；保留输入嵌入的 ICC 配置。
- 分配独立临时目录、避开已存在的输出名称；清理函数只删除经过身份验证的空目录。

## 计算公式与单位

```text
cm: px = round(cm / 2.54 × DPI)
mm: px = round(mm / 25.4 × DPI)
px: px = round(px)

s = min(targetWidth / orientedSourceWidth,
        targetHeight / orientedSourceHeight)
scaledWidth  = max(1, round(orientedSourceWidth × s))
scaledHeight = max(1, round(orientedSourceHeight × s))
left = floor((targetWidth - scaledWidth) / 2)
top  = floor((targetHeight - scaledHeight) / 2)
```

例如 `50.8 × 76.2 mm @ 100 DPI → 200 × 300 px`。`600 × 300 px` 源图缩放为 `200 × 100 px`，上下各填充 `100 px`。奇数边距会使右侧/下侧比左侧/上侧多 1 像素。

DPI 是每英寸像素数。写入 DPI 元数据与生成正确像素尺寸是两个步骤；提升 DPI 不会自动增加真实细节。JPEG 的 quality 100、4:4:4 仍然是有损编码。

## 格式支持与边界

| 项目 | 当前行为 |
| --- | --- |
| 输入 | 仅 JPG/JPEG 和 PNG；按解码格式检查 |
| 输出 | `png`、`jpeg`，或 `source` 继承输入编码格式 |
| `source` 文件名 | 分配输出路径时仍要求输入扩展名为 `.jpg`、`.jpeg`、`.png`；建议扩展名与内容一致 |
| WebP/GIF/TIFF/AVIF/SVG/HEIC/PDF | 不属于本核心输入支持范围，即使 Sharp 可以解码；合成测试的 SVG 仅用于生成 JPG/PNG 测试素材 |
| PNG 透明度 | 缩放后的源图区域保留 RGBA；新增边距是不透明白色 |
| PNG 转 JPEG | JPEG 不支持透明通道；未配置白色 flatten，透明区域不要假定得到白色底，建议先明确处理透明度 |
| 多页、动画、16 位/CMYK/HDR | 未提供专用处理协议或完整验证；不要当成保留动画/位深/色彩空间的工具 |
| 放大 | 允许等比放大；不包含 AI 超分辨率或细节恢复 |

输入尺寸、DPI 必须为正有限数，换算结果必须是正安全整数。`calculateTargetPixels` 失败时抛普通 `Error("INVALID_TARGET_DIMENSIONS")`；请求解析和其他核心接口主要使用 `EngineError`。

使用 `parseJobRequest` 验证外部数据。低层 `createAdaptationPlan`、`classifyAspectRisk` 假定调用方传入有效的正尺寸/比例，并不独立验证所有参数。像素安全整数校验不代表可分配内存：本核心没有应用级目标像素、内存、磁盘或执行时间预算。调用方应限制资源，并保持源文件在检查和渲染期间不变。

## 安装与验证

验证环境为 Windows x64、Node.js 24.16.0、npm 11.13.0。其他平台和 Node 版本尚未在此次提取中验证。

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run example
```

依赖版本固定在 `package-lock.json`。此次环境的 npm 下载被离线配置阻止，因此测试使用从原工程复制的本机依赖；**尚未成功验证全新联网 `npm ci`**。本仓库不附带 `node_modules` 或原生二进制。

`npm test` 会先在 `tests/fixtures/synthetic/generated/` 本地生成素材，再运行 8 个测试文件、88 个用例。测试包括单位换算和非法参数、比例风险、请求解析、格式拒绝、EXIF、ICC、DPI、PNG 透明度、JPEG 编码、像素区域对比、输入哈希不变、输出路径碰撞与清理边界。详见 [验证记录](docs/VERIFICATION.md)。

示例输出在 `demo-output/` 下每次新建的目录内。示例只生成几何图形，不读取客户图片。测试中的 `photo.jpg` 也是程序生成的图形，不是真实照片；中英文字样使用内置位图点阵，不包含客户商标或字体文件。生成素材和输出均不进入发布文件清单。

## API 使用

```ts
import {
  parseJobRequest, calculateTargetPixels, inspectSource,
  createAdaptationPlan, allocateJobPaths, renderSafeJob,
} from "./dist/index.js";

const request = parseJobRequest({
  schemaVersion: 1,
  jobId: "example",
  inputPath: "./example.png",
  outputDirectory: "./output",
  target: { width: 50.8, height: 76.2, unit: "mm", dpi: 100 },
  output: { format: "png" },
  background: { strategy: "SOLID_EXTEND" },
});
const source = await inspectSource(request.inputPath);
const pixels = calculateTargetPixels(request.target);
const plan = createAdaptationPlan(source.oriented, pixels);
const paths = await allocateJobPaths(request, pixels);
const artifacts = await renderSafeJob({ request, source, plan, paths });
// artifacts.candidateOutput 是候选文件；检查后由调用方负责提交与清理。
```

可直接运行的合成示例见 [examples/synthetic-demo.mjs](examples/synthetic-demo.mjs)。

## 尚未完成

- 渲染器目前始终使用白色填充，**不根据 `background.strategy` 进行策略分派**。枚举包含 AUTO/渐变/边缘/镜像/图案不代表实现了对应算法。`assertStrategyAvailable` 仅单独拒绝纹理合成/内容感知两项，渲染器不会自动调用它。当前应只使用 `SOLID_EXTEND`。
- `preview`/`export` 已是请求字段，但尚未实现独立的预览执行流程。
- 渲染器返回临时候选图，并不写入 `paths.finalImage`。未完成最终输出验证、原子提交、并发输出名称预留、完整质量报告、取消、批处理和 CLI。
- `cleanupJobPaths` 会拒绝非空目录。调用方需要先明确处理本任务生成的三个文件，再调用它；它不会递归删除任意内容。
- 尚未对真实生产图、超大图片、打印设备或 Electron/桌面平台进行联调。

## 依赖与许可

运行依赖：Sharp 0.35.4（Apache-2.0）、Zod 4.6.5（MIT）。此次 Windows x64 原生包 `@img/sharp-win32-x64` 0.35.4 声明 **Apache-2.0 AND LGPL-3.0-or-later**，包含 libvips 和多种编解码库，不能统一视作 MIT。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及上游声明副本。

源码展示与分发附带原生库的安装器是不同的交付范围。若后续打包 DLL、安装器或修改依赖，应针对实际平台产物保留完整声明、许可文本及所需源代码/重新链接资料；此源码稿没有打包这些产物。
