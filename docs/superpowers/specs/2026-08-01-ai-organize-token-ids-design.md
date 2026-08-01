# AI 整理:短 token 代替 nanoid(治「调用失败」根因)+ 错误可见化

## 现象(第 4 次报告)

上一版把 `max_tokens` 提到 4096 后,整理**由「没能给出可用建议」变成「AI 调用失败,请稍后重试」**(network 错误)。

## 根因(证据已收敛)

两条铁证定位:

1. **「测试连接」成功**(「连接成功 · glm-5.2」)→ key / endpoint / 模型名全对,不是配置问题。
2. **改 `max_tokens` 前调用是成功的**(只是截断 → parse 失败)。这次唯一改的调用参数就是 `1024 → 4096`。
   ⇒ **`max_tokens=4096` 把调用弄挂了**:要么中转站拒绝该值(400),要么更大的生成超过 30s 超时(AbortError)。

两种子因同一个根:**输出太大**。而输出大的根源是——**逼模型逐个回抄 24 个 21 位 nanoid**(每个约 8–14 token)。
这既是 1024 截断的原因,也是 4096 超时/被拒的原因。提示词微调改不了它;这是结构问题。

## 修复

### 1. 短 token 代替 nanoid(`core/ai/organize.ts`)—— 核心

`buildOrganizePrompt` 只把 **`t0/t1…`(标签)、`c0/c1…`(任务)** 发给模型,并回传两张 `token→真实id` 映射表。
`parseOrganizeResponse` 改收这两张表:校验 token、输出真实 id。few-shot 示例与 JSON 结构说明同步改用 t/c token。

效果:输出体积骤降约 4–8×(`"t5"` vs 21 位随机串),**既不截断、又快、还少抄错**;下游拿到的仍是真实 nanoid,apply 链路不变。

### 2. `max_tokens` 4096 → 1024(`core/background/index.ts`)

token 化后输出很小,1024 绰绰有余;且 1024 是该中转站**已验证接受**的值(改 4096 前调用就成功)。一举解决「被拒/超时」。

### 3. 错误可见化(`commands.ts` / `messaging.ts` / `useAiActions.ts`)—— 安全网

以前调用抛错一律吞成笼统「network」。现在 `aiCallError()`:记 `logError('ai.callFailed', message)`,
并把 `friendlyAIError(message)`(如「连接超时」「被限流(429)」「地址或模型不存在(404)」)放进 `AI_ERROR.detail`;
UI 优先显示 `detail`。**下次再失败,提示条直接是人话错误,不必再猜。**

## 不做 / 留意

- 单任务净化(`buildPruneTaskPrompt`/`parsePruneResponse`)暂沿用真实 id(单组、体量小);同款隐患存在,后续可比照改。
- 索引按数组顺序生成,build 与 parse 通过回传的映射表对齐,无顺序耦合风险。

## 测试

`tests/ai-organize.test.ts`:build 断言发出 `t0/c0`、不含 nanoid、回传映射;parse 断言 token→真实 id。
既有 parse 用例把 `Set` 改为 `token→id` Map(取同值,断言不变)。
`ai-apply` / `ai-organize-all` 集成测试的假响应改用 token;network 错误断言改 `toMatchObject`(现带 `detail`)。

## 验证

`tsc` 0 · `oxlint` 0 · `prettier` clean · `vitest` 408 全绿 · `wxt build` OK。
真机:20+ 标签整理应不再「调用失败」;若仍失败,提示条会显示具体原因(超时/限流/…),据此再定位。
