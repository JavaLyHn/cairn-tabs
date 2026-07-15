# Cairn Tabs

面向程序员的浏览器标签页上下文管理器 —— 自动把标签按任务归类,一键归档、恢复整个任务、全局秒搜。Chrome/Edge 侧边栏插件,本地优先、无账号。

> Cairn(玛尼堆)是山道上用石块垒成的路标 —— 为你散乱的标签立个路标。
> 产品代号原为 TabCtx,详见 [`tabctx-prd-tech-spec.md`](./tabctx-prd-tech-spec.md)。

## 当前状态

MVP 核心闭环、v1.1 程序员特化、v1.5 AI 均已实现并跑通:

- **侧边栏**:按任务分组实时展示当前标签;统计条 / 底部状态栏
- **手动任务**:创建 / 重命名 / 删除;拖拽标签归属
- **整任务归档 / 恢复**:一键归档并关闭、一键限速恢复,5 秒可撤销
- **重复检测合并**(F-05):同 URL 标出重复,一键合并(保留最近活跃的)
- **全局搜索**(`⌘⇧K`):fuse.js 模糊匹配打开与已归档标签,`↵` 直达、`⌘↵` 恢复整个任务
- **原生 tabGroups 双向同步**(F-06):未分类 = 未分组;每个命名任务 = 一个原生分组,标题/颜色一一对应;原生侧的分组增删改会同步回来,手建分组自动收编
- **自动归类引擎**(F-07):基于 opener 链 / 时间窗 / 域名打分,把新标签归入合适的任务;未分类里的 opener 树(≥3、15min 内)自动归成一个新任务;**同站归类建议**——未分类里同一网站(eTLD+1)标签攒够阈值(默认 4,设置里可调 2–8)时,顶部出现「归类」建议,确认即归成一个新任务(弱信号只建议、不自动,区别于 opener 树的自动归类);从纠正中学习(拖出记负样本、人工归属锁定)。保守优先,宁进未分类不误归。**可在设置里一键关闭**(关闭后新标签只进「未分类」,不自动分组)
- **localhost 项目名映射**(F-08):`localhost:3000` 显示为你绑定的项目名(如 `auth-service`),端口以等宽字体显示在行尾;检测到未绑定端口时内联建议一键绑定
- **GitHub 元数据**(F-09):PR / Issue 行显示「类型 + 编号」等宽徽章(`PR #482` / `#212`),剥掉冗长标题尾部只留真正标题,悬停显示 `owner/repo`。纯 URL 解析,零请求零权限
- **重点标注(Star)**:标签行悬停点星标为「重点」——加星的标签浮到所在任务顶部、汇总到面板顶部的「★ 重点」区快速直达,且**永不被判定陈旧下沉、永不被自动休眠**(重点的东西系统不自作主张收走)。归档/恢复后星标保留
- **AI 改名**(需配置 AI):给任务改名时,输入框旁的「✦」让 AI 依据该任务里标签的标题+域名建议一个简短任务名、填入输入框,你确认或再改(只发标题+域名,不自动应用)
- **陈旧检测**(F-10):超过阈值天数(默认 7 天,设置里可调)没访问的打开标签,从各任务抽出、集中到底部灰暗下沉区,一键「全部归档」(可撤销)。不弹通知,可在设置里关闭
- **标签休眠与内存回收**(F-11):**默认关闭**;开启后每 5 分钟扫描,休眠空闲超阈值(默认 30 分钟,设置里可调)、非活跃/音频/置顶且非 localhost 的标签,释放内存(点击自动重载),底部状态栏显示累计估算回收量。localhost 白名单护 dev server
- **导出**(F-12):任务一键导出为 Markdown(标题+链接,复制到剪贴板,贴周报/Notion);设置里「导出全部数据 (JSON)」做备份/迁移
- **AI 整理未分类**(F-13,可选):填入自己的 Anthropic / OpenAI API key 后,「未分类」头部出现「✦ AI 整理」,AI 读标签标题+域名与已有任务名,提议分成新任务或并入已有任务,预览确认后生效。默认关闭;仅发送标题+域名+任务名,直连官方,key 只存本机。
  - **自定义中转站**:除官方外可选「自定义中转站」,填 OpenAI 兼容的接口地址(如 `https://newapi.elevatesphere.com/v1`)+ key + 模型,直连你自己的中转站。隐私边界不变(仍只发标题+域名+任务名),key 只存本机,授权只针对你所填域名。
  - **测试连接**:设置里一键「测试连接」,发一次极小请求验证 key/地址/模型是否可用,即时反馈 `✓ 连接成功 · 模型 · 耗时` 或人话错误(认证失败 / 地址或模型不存在 / 连接超时 / 网络错误…)。

尚未实现(见设计文档 Roadmap):Firefox 适配、跨设备同步。

## 本地安装使用

未上架商店,自己构建一次、以「已解压扩展」加载即可长期使用(无账号、无服务器、数据全在本地)。

**前置**:[Node](https://nodejs.org) 20+ 与 [pnpm](https://pnpm.io)(`npm i -g pnpm`)。

**1. 构建**

```bash
git clone https://github.com/JavaLyHn/cairn-tabs.git
cd cairn-tabs
pnpm install
pnpm build          # 产物在 .output/chrome-mv3
```

**2. 加载进浏览器**(Chrome / Edge)

1. 打开 `chrome://extensions`(Edge 为 `edge://extensions`)
2. 右上角开启 **开发者模式**
3. 点 **「加载已解压的扩展程序」**,选择项目里的 **`.output/chrome-mv3`** 目录
4. 建议把工具栏图标 **固定**;点它即可打开侧边栏(或用快捷键 `⌘⇧K` / `Ctrl+Shift+K` 唤起搜索)

> ⚠️ 一定选 **`.output/chrome-mv3`**(生产版,自包含、装上即用)。`.output/chrome-mv3-dev` 是开发版,**必须** `pnpm dev` 一直运行才不白屏,普通使用请勿加载它。

**3. 更新到新版本**

```bash
git pull && pnpm build
```

然后到 `chrome://extensions`,点该扩展的 **刷新 ↻**(不必删除重加)。

**4.(可选)开启 AI**:设置 ⚙ → AI 整理 → 选服务商填 API key(或自定义中转站的地址+key+模型)→ 点「测试连接」确认 → 保存。默认关闭,只发标签标题+域名+任务名。

**数据与备份**:所有任务/标签存于浏览器本地 IndexedDB,不上传。设置里「导出全部数据 (JSON)」可随时备份/迁移。

## 技术栈

WXT (Manifest V3) · React 19 · TypeScript · Tailwind CSS · Dexie (IndexedDB) · Zustand · fuse.js · Vitest

架构要点:Service Worker 是唯一写入方,UI 只发命令、订阅状态快照;所有自发的标签/分组操作都在同步锁内进行以避免事件回环;SW 休眠后靠 hydrate + reconcile 重建并对账。

## 开发

```bash
pnpm install
pnpm dev        # 启动 dev server(HMR);不自动开浏览器,手动加载 .output/chrome-mv3-dev
pnpm build      # 生产构建到 .output/chrome-mv3
pnpm compile    # 类型检查 (tsc --noEmit)
pnpm test       # 运行 Vitest
```

普通使用见上方「[本地安装使用](#本地安装使用)」。开发时用 `pnpm dev` 并加载 `.output/chrome-mv3-dev`(支持热更新,但需 dev server 常驻,否则白屏)。

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
