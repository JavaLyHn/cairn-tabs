// AI 整理:prompt 构建 + 响应解析(F-13)。provider 无关的纯逻辑,重点单测。

import type { AIPlan } from '@/shared/ai';

export interface OrganizeTab {
  id: string;
  title: string;
  domain: string;
}
export interface OrganizeTask {
  id: string;
  name: string;
  domains: string[];
  samples: string[];
}

export interface TaskSignals {
  domains: string[];
  samples: string[];
}

/** 汇总一个任务里标签的内容信号:域名(按频次 top 5、去重)+ 示例标题(前 5)。供 AI 判断归属。 */
export function summarizeTaskTabs(tabs: { title: string; domain: string }[]): TaskSignals {
  const freq = new Map<string, number>();
  for (const t of tabs) {
    const d = t.domain.trim();
    if (d) freq.set(d, (freq.get(d) ?? 0) + 1);
  }
  const domains = [...freq.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);
  const samples = tabs
    .map((t) => t.title.trim())
    .filter((s) => s !== '')
    .slice(0, 5);
  return { domains, samples };
}

export function buildOrganizePrompt(
  tabs: OrganizeTab[],
  tasks: OrganizeTask[],
  opts?: { aggressive?: boolean },
): {
  system: string;
  user: string;
  /** 模型只看到短 token(t0/t1…、c0/c1…);这两张表把 token 映射回真实 nanoid,供解析回写。 */
  tabTokenToId: Map<string, string>;
  taskTokenToId: Map<string, string>;
} {
  const classifyRule = opts?.aggressive
    ? [
        '- 这些标签可能来自不同的已有分组;可以把明显更适合别处的标签跨组移动、也可以重新平衡已有分组。',
      ]
    : ['- 保守:重点整理未分类里的标签;拿不准的归到 unclear、留在未分类,不要勉强塞进某个组。'];
  const system = [
    '你是帮程序员整理浏览器标签的助手。像人一眼扫过那样,把「明显该放在一起」的标签归类,并优先并入已有任务。',
    '对每个标签,依次这样判断:',
    '1) 能并入某个「已有任务」吗?逐个对照 existingTasks 的 name / domains / samples,只要明显属于其中某个任务,就 assign 到该任务(最优先)。',
    '2) 否则,它和其它零散标签明显该放一起吗?能就凑成一个新组放进 newGroups —— 哪怕只有 2 个标签,也建组。',
    '3) 实在看不出该和谁一起、也不属于任何已有任务 → 列入 unclear,附一句简短理由(不超过 20 字)。',
    '什么叫「明显该放在一起」(满足任一即可,不必纠结是不是严格的「同一个任务」):',
    '- 同一个产品/服务/站点 —— 例如某工具的 API 文档 + 控制台 + 生图工作台,理应归到一起;',
    '- 同一个代码仓库 / 同一个工单 / 同一个功能模块;',
    '- 同一件正在做的事 —— 查同一个问题、读同一主题的资料、对比同类工具做选型。',
    '只要换成人来看会顺手把它们收进同一个文件夹,就归到一起,别因为「不够像一个正式任务」而放弃。',
    '规则:',
    ...classifyRule,
    '- 别硬凑:不属于同一任务/主题、纯粹八竿子打不着的标签(如「短视频娱乐」与「支付退款文档」)不要塞进一组;真看不出关系的列 unclear。',
    '- 禁止新建与某个已有任务主题重叠的分组 —— 那必须用 assign 并入,不要造重复的组;newGroups 只用于确实没有对应已有任务的新主题。',
    '- 每个标签都要有归宿:恰好出现在 newGroups / assign / unclear 之一;拿不准的一律放 unclear,绝不要让三个数组全空、整个交白卷。',
    '- 新建分组名简短(不超过 16 字),概括该组共同点,语言与标签标题一致。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    '示例(id 就照抄给你的 t0/t1… 与 c0/c1…,勿改写、勿照抄内容):',
    'existingTasks=[{"id":"c0","name":"支付重构","domains":["github.com","stripe.com"],"samples":["Refactor checkout #42","Stripe API"]}]',
    'looseTabs=[{"id":"t0","title":"checkout webhook #47","domain":"github.com"},{"id":"t1","title":"睿库 API 文档","domain":"ruiku.ai"},{"id":"t2","title":"睿库 生图工作台","domain":"ruiku.ai"},{"id":"t3","title":"抖音-记录美好生活","domain":"douyin.com"}]',
    '输出:{"newGroups":[{"name":"睿库","tabIds":["t1","t2"]}],"assign":[{"taskId":"c0","tabIds":["t0"]}],"unclear":[{"tabId":"t3","reason":"与其它标签无共同点"}]}',
    'JSON 结构(tabId/taskId 一律用给定的 t… / c… 短 id):',
    '{"newGroups":[{"name":"组名","tabIds":["标签id"]}],"assign":[{"taskId":"任务id","tabIds":["标签id"]}],"unclear":[{"tabId":"标签id","reason":"简短理由"}]}',
  ].join('\n');
  // 用短 token(t0/t1…、c0/c1…)代替 21 位 nanoid:输出体积骤降 → 不截断、不易抄错、更快。
  const tabTokenToId = new Map<string, string>();
  const looseTabs = tabs.map((t, i) => {
    const token = `t${i}`;
    tabTokenToId.set(token, t.id);
    return { id: token, title: t.title, domain: t.domain };
  });
  const taskTokenToId = new Map<string, string>();
  const existingTasks = tasks.map((t, i) => {
    const token = `c${i}`;
    taskTokenToId.set(token, t.id);
    return { id: token, name: t.name, domains: t.domains, samples: t.samples };
  });
  const user = JSON.stringify({ looseTabs, existingTasks });
  return { system, user, tabTokenToId, taskTokenToId };
}

/**
 * 净化单个任务:只判断「哪些标签明显不属于这个任务的主题」→ 踢回未分类;拿不准的留原位。
 * 明显属于的不必列出(留下)。不往任务里塞新标签,只做「清理出界的」。
 */
export function buildPruneTaskPrompt(
  taskName: string,
  tabs: OrganizeTab[],
): { system: string; user: string } {
  const system = [
    '你在帮程序员「净化」一个已命名的浏览器标签任务分组。',
    `分组名:「${taskName}」。下面是它当前的标签。`,
    '判断每个标签是否属于这个分组的主题:',
    '- 明显【不属于】这个主题的 → 列入 "evict"(会被移回未分类),附一句简短理由(≤20 字)。',
    '- 明显属于的 → 不用列出(默认留在原组)。',
    '- 拿不准的 → 列入 "unclear"(保持原位),附简短理由。',
    '规则:',
    '- 只踢「明显跑题」的;宁可留着不动,也不要凭猜测踢出。仅仅同域名/同类型不构成「属于/不属于」的理由,看主题。',
    '- 不要新建分组、不要往这个组里加别的标签 —— 只输出该踢出的与拿不准的。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    'JSON 结构:',
    '{"evict":[{"tabId":"标签id","reason":"简短理由"}],"unclear":[{"tabId":"标签id","reason":"简短理由"}]}',
  ].join('\n');
  const user = JSON.stringify({
    task: taskName,
    tabs: tabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain })),
  });
  return { system, user };
}

/** 解析净化响应:返回 evict / unclear(去重:一个标签至多一处;校验 tabId;理由截断)。JSON 不可解析 → null。 */
export function parsePruneResponse(
  raw: string,
  validTabIds: Set<string>,
): {
  evict: { tabId: string; reason: string }[];
  unclear: { tabId: string; reason: string }[];
} | null {
  const data = extractJsonObject(raw);
  if (!data || typeof data !== 'object') return null;

  const seen = new Set<string>();
  const take = (arr: unknown): { tabId: string; reason: string }[] => {
    if (!Array.isArray(arr)) return [];
    const out: { tabId: string; reason: string }[] = [];
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue;
      const rawId = (x as { tabId?: unknown }).tabId;
      const tabId = typeof rawId === 'string' ? rawId : '';
      if (!validTabIds.has(tabId) || seen.has(tabId)) continue;
      seen.add(tabId);
      const rawReason = (x as { reason?: unknown }).reason;
      const reason = (typeof rawReason === 'string' ? rawReason : '').trim().slice(0, 40);
      out.push({ tabId, reason });
    }
    return out;
  };

  const d = data as { evict?: unknown; unclear?: unknown };
  const evict = take(d.evict); // 先处理 evict,占用 seen → unclear 与之去重
  const unclear = take(d.unclear);
  return { evict, unclear };
}

export function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1]! : s).trim();
}

/**
 * 从可能夹带推理文字 / 多段输出的响应里,健壮地提取一个可解析的顶层 JSON 对象。
 * 策略:先整体 parse;失败则扫描「平衡花括号」(跳过字符串内部的括号)收集每个顶层 {...} 段,
 * 从后往前逐个 parse(答案通常在推理之后),返回首个成功的。都不行 → null。
 * 注:响应被 max_tokens 截断(末段无闭合)时该段不会入选,返回 null(此时应提高 max_tokens,而非在此硬救)。
 */
export function extractJsonObject(raw: string): unknown | null {
  const text = stripFences(raw);
  try {
    return JSON.parse(text);
  } catch {
    // 继续走平衡扫描
  }
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(candidates[i]!);
    } catch {
      // 试下一个候选
    }
  }
  return null;
}

/** AI 改名:据一组标签的标题+域名建议一个简短任务名。 */
export function buildNamePrompt(tabs: { title: string; domain: string }[]): {
  system: string;
  user: string;
} {
  const system = [
    '你为一组浏览器标签起一个简短的任务名。',
    '规则:',
    '- 概括这些标签共同的任务/主题。',
    '- 简短:不超过 12 个字;不要引号、书名号、标点包裹;不要解释。',
    '- 语言与标签标题一致。',
    '- 只输出这个名字本身,一行。',
  ].join('\n');
  const user = JSON.stringify({ tabs: tabs.map((t) => ({ title: t.title, domain: t.domain })) });
  return { system, user };
}

/** 解析 AI 改名响应:去围栏/首尾引号、取首行、截断;空则 null。 */
export function parseNameResponse(raw: string): string | null {
  const first = stripFences(raw).split('\n')[0] ?? '';
  const name = first
    .trim()
    .replace(/^["'「『《]+|["'」』》]+$/g, '')
    .trim();
  return name ? name.slice(0, 40) : null;
}

export function parseOrganizeResponse(
  raw: string,
  tabTokenToId: Map<string, string>,
  taskTokenToId: Map<string, string>,
): AIPlan | null {
  const data = extractJsonObject(raw);
  if (!data || typeof data !== 'object') return null;

  const seen = new Set<string>(); // 一个 token 至多归一处
  const takeTabs = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x === 'string' && tabTokenToId.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(tabTokenToId.get(x)!); // token → 真实 id
      }
    }
    return out;
  };

  const d = data as { newGroups?: unknown; assign?: unknown; unclear?: unknown };

  // Process assign first so existing tasks win in dedup
  const assign: AIPlan['assign'] = [];
  if (Array.isArray(d.assign)) {
    for (const a of d.assign) {
      if (!a || typeof a !== 'object') continue;
      const rawTaskId = (a as { taskId?: unknown }).taskId;
      const token = typeof rawTaskId === 'string' ? rawTaskId : '';
      if (!taskTokenToId.has(token)) continue;
      const tabIds = takeTabs((a as { tabIds?: unknown }).tabIds);
      if (tabIds.length) assign.push({ taskId: taskTokenToId.get(token)!, tabIds });
    }
  }

  // Then process newGroups
  const newGroups: AIPlan['newGroups'] = [];
  if (Array.isArray(d.newGroups)) {
    for (const g of d.newGroups) {
      if (!g || typeof g !== 'object') continue;
      const rawName = (g as { name?: unknown }).name;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const tabIds = takeTabs((g as { tabIds?: unknown }).tabIds);
      if (name && tabIds.length) newGroups.push({ name: name.slice(0, 40), tabIds });
    }
  }

  // unclear:AI 拿不准、刻意留原位的标签 + 理由。放最后解析,seen 已含所有已归类标签 → 去重。
  const unclear: NonNullable<AIPlan['unclear']> = [];
  if (Array.isArray(d.unclear)) {
    for (const u of d.unclear) {
      if (!u || typeof u !== 'object') continue;
      const rawId = (u as { tabId?: unknown }).tabId;
      const token = typeof rawId === 'string' ? rawId : '';
      if (!tabTokenToId.has(token) || seen.has(token)) continue;
      seen.add(token);
      const rawReason = (u as { reason?: unknown }).reason;
      const reason = (typeof rawReason === 'string' ? rawReason : '').trim().slice(0, 40);
      unclear.push({ tabId: tabTokenToId.get(token)!, reason });
    }
  }

  if (newGroups.length === 0 && assign.length === 0 && unclear.length === 0) return null;
  return unclear.length ? { newGroups, assign, unclear } : { newGroups, assign };
}
