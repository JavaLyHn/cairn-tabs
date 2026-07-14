# Cairn Tabs

面向程序员的浏览器标签页上下文管理器 —— 自动把标签按任务聚成「上下文簇」,可整簇收纳、整簇恢复、全局秒搜。Chrome/Edge 侧边栏插件,本地优先、无账号。

> Cairn(玛尼堆)是山道上用石块垒成的路标 —— 为你散乱的标签立个路标。
> 产品代号原为 TabCtx,详见 [`tabctx-prd-tech-spec.md`](./tabctx-prd-tech-spec.md)。

## 当前状态

MVP 核心闭环 + 原生分组双向同步已实现并跑通:

- **侧边栏**:按 Context 分组实时展示当前标签;统计条 / 底部状态栏
- **手动上下文**:创建 / 重命名 / 删除;拖拽标签归属
- **整簇收纳 / 恢复**:一键归档并关闭、一键限速恢复,5 秒可撤销
- **重复检测合并**(F-05):同 URL 标出重复,一键合并(保留最近活跃的)
- **全局搜索**(`⌘⇧K`):fuse.js 模糊匹配打开与已归档标签,`↵` 直达、`⌘↵` 恢复整簇
- **原生 tabGroups 双向同步**(F-06):未分类 = 未分组;每个命名簇 = 一个原生分组,标题/颜色一一对应;原生侧的分组增删改会同步回来,手建分组自动收编
- **自动聚簇引擎**(F-07):基于 opener 链 / 时间窗 / 域名打分,把新标签归入合适的簇;未分类里的 opener 树(≥3、15min 内)自动升格为新簇;从纠正中学习(拖出记负样本、人工归属锁定)。保守优先,宁进未分类不误归
- **localhost 项目名映射**(F-08):`localhost:3000` 显示为你绑定的项目名(如 `auth-service`),端口以等宽字体显示在行尾;检测到未绑定端口时内联建议一键绑定

尚未实现(见设计文档 Roadmap):自动聚簇的「同域升格」、GitHub 元数据、标签挂起、导出、AI 命名。

## 技术栈

WXT (Manifest V3) · React 19 · TypeScript · Tailwind CSS · Dexie (IndexedDB) · Zustand · fuse.js · Vitest

架构要点:Service Worker 是唯一写入方,UI 只发命令、订阅状态快照;所有自发的标签/分组操作都在同步锁内进行以避免事件回环;SW 休眠后靠 hydrate + reconcile 重建并对账。

## 开发

```bash
pnpm install
pnpm dev        # 启动 dev server 并自动打开带插件的 Chrome
pnpm build      # 生产构建到 .output/chrome-mv3
pnpm compile    # 类型检查 (tsc --noEmit)
pnpm test       # 运行 Vitest
```

手动加载:`chrome://extensions` → 开启开发者模式 → 加载 `.output/chrome-mv3`(或 dev 模式的 `.output/chrome-mv3-dev`)。

## 目录结构

```
core/            与 UI 无关的领域逻辑(可单测)
  store/         Dexie schema 与仓储层
  background/    SW:标签同步 / 命令处理 / 原生分组同步 / 撤销 / 同步锁
  search/        fuse.js 索引
entrypoints/     WXT 入口:background + sidepanel(React)
shared/          类型与消息协议
tests/           Vitest(含 fake-chrome 集成测试)
docs/            设计文档
```

## 贡献

欢迎参与,请先读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[AGPL-3.0-only](./LICENSE) © JavaLyHn。基于本项目的衍生作品(含联网 SaaS)需按同协议开源。
