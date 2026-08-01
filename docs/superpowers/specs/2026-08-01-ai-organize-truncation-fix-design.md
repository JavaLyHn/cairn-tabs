# AI 整理:治「标签多时必失败」——max_tokens 截断 + 脆弱 JSON 提取 + 零日志

## 现象(第 3 次报告)

未分类 20 个标签,肉眼可见多组可分(octok 三件套、DeepSeek/GLM 系列、面试八股、Jira sprint……),
点「整理全部」却弹「AI 没能给出可用的分组建议,已保持原样」。此前两次(6 个标签)偶发,20 个标签**必现**。

## 根因调查(systematic-debugging;此前两轮都是猜)

诚实复盘:前两次我改的都是**提示词**(先精确化、再放宽),但从没看过模型**真实返回**——
因为**代码里从不记录原始响应**。这次先补齐证据:

1. `ai.error.parse` = SW 端 `parseOrganizeResponse` 返回 `null`(commands.ts)。
2. **`max_tokens: 1024`**(index.ts,整理/命名共用的 `complete`)——响应长度硬上限。
3. **原始响应从不落日志**——3 轮都在盲猜的根源。

关键信号:失败**随标签数升级**(6 个偶发 → 20 个必现)。这正是**响应被 max_tokens 截断**的指纹:

- 现提示词要求「每个标签都要有归宿」,20 个标签的输出要**逐个列出 21 位 nanoid**(每个 nanoid 约 8–14 token)+ 中文理由。
  粗估 1500–2000+ token,再叠加模型可能夹带的推理文字,**轻松越过 1024** → JSON 从中间被砍断 → 解析失败 → null。
- 兜底提取是「首个 `{` 到末个 `}`」的朴素切片:模型只要在 JSON **前后夹带含花括号的推理文字**(如「先把 {t1,t2} 归一组」),
  切出来的就不是合法 JSON → 也 null。

两轮提示词微调都动不了这两条**结构性**原因——所以按调试纪律,这次不再改提示词。

## 修复(三层,同治「响应畸形/截断 → null」)

1. **提高 `max_tokens` 1024 → 4096**(`core/background/index.ts`)——给足余量,标签多也不截断。
2. **健壮 JSON 提取 `extractJsonObject`**(`core/ai/organize.ts`)——先整体 parse;失败则**扫描平衡花括号**
   (跳过字符串内部的括号)收集每个顶层 `{...}` 段,**从后往前**逐个 parse(答案通常在推理之后),返回首个成功的。
   替换 `parseOrganizeResponse` / `parsePruneResponse` 里那段脆弱的「首`{`末`}`」切片。
   截断(末段无闭合)时该段不入选、返回 null——由 max_tokens 治本,不在此硬救半截 JSON。
3. **解析失败时打印原始响应**(`core/background/commands.ts` · `logAIParseFailure`)——
   `logError('ai.parseFailure:organize', {len, raw:前 4000 字})`。以后**再失败,SW 控制台直接能看到模型真实输出**
   (截断?空?schema 不符?),不必再猜第 4 次。

## 不做 / 留作下一步(YAGNI + 一次一假设)

- **暂不**把标签 id 从 nanoid 换成小整数索引。这是另一条假设(弱模型抄 20 个长 id 易错/费 token),
  也是很有效的结构改造(输出体积可再降 5–10×)。但本轮先验证「截断 + 脆弱提取」这条最强假设;
  若上线后仍复现,日志会给出真实响应,再据此上索引这一步。
- 不做截断 JSON 的「修复式」解析(复杂、收益低);提高 max_tokens 更干净。

## 模型这个杠杆(仍然成立)

结构修好后,分组质量上限仍由模型定。用户当前是自定义中转站,模型未知;弱模型即便不截断也可能 schema 跑偏。
换 Sonnet 类更强模型会明显更稳。

## 测试

`tests/ai-organize.test.ts` 新增 `extractJsonObject` 一组(纯 JSON / 去围栏 / 前置推理带花括号 / 后置文字 /
字符串内含 `}` / 多段取最后可解析 / 无 JSON 与截断 → null),并给 `parseOrganizeResponse` 加「推理带花括号也能解析」回归。

## 验证

`tsc` 0 · `oxlint` 0 · `prettier` clean · `vitest` 406 全绿 · `wxt build` OK。
真机:重载 → 20 标签整理若仍失败,打开 `chrome://extensions` → 该扩展 Service worker → 控制台,
应能看到 `ai.parseFailure:organize` 及原始响应,据此定位下一步。
