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
  // 提示词刻意精简:输入越短、要求越明确,推理型模型思考越快(过长提示曾导致 30s 超时)。
  const system = [
    '你在帮程序员整理浏览器标签。把「明显该放一起」的归类,能并入已有任务就并入。快速判断,不要长篇推理。',
    '按顺序判断每个标签:',
    '1) 对照 existingTasks 的 name/domains/samples —— 明显属于某个已有任务,就 assign 到它(最优先)。',
    '2) 否则和其它标签凑成新组放 newGroups:同一产品/服务/站点、同一仓库/工单/模块、同一件正在做的事,都算;哪怕只有 2 个也建组。',
    '3) 看不出关系 → 直接省略(自动留在未分类);想说明原因才放 unclear(reason 可省)。',
    '规则:',
    ...classifyRule,
    '- 别硬凑:八竿子打不着的(如短视频娱乐 vs 支付文档)不要塞一组。判断「同一任务」看主题,不是只看域名。',
    '- 禁止新建与某个已有任务主题重叠的分组 —— 那种情况必须用 assign 并入,别造重复的组。',
    '- 输出越短越好:没提到的自动留在未分类,拿不准的省略即可。但别整个交白卷 —— 有明显该放一起的就给出来。',
    '- 组名 ≤16 字,语言与标签标题一致。只输出严格 JSON,不要解释、不要 Markdown 代码块。',
    '示例(id 照抄给你的 t0/c0,勿改写):',
    '输入 existingTasks=[{"id":"c0","name":"支付重构","domains":["github.com","stripe.com"]}] looseTabs=[{"id":"t0","title":"checkout webhook #47","domain":"github.com"},{"id":"t1","title":"睿库 API 文档","domain":"ruiku.ai"},{"id":"t2","title":"睿库 生图工作台","domain":"ruiku.ai"},{"id":"t3","title":"抖音","domain":"douyin.com"}]',
    '输出 {"newGroups":[{"name":"睿库","tabIds":["t1","t2"]}],"assign":[{"taskId":"c0","tabIds":["t0"]}]}',
    'JSON 结构:{"newGroups":[{"name":"组名","tabIds":["t…"]}],"assign":[{"taskId":"c…","tabIds":["t…"]}],"unclear":[{"tabId":"t…","reason":"简短理由"}]}',
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
 * AI 失灵(不可解析 / 全空)时的**本地兜底**分组:同一个可注册域名 ≥2 个标签即成一组。
 * 纯本地规则、不联网,保证用户至少拿到「明显该在一起」的那部分,而不是一句「没有可用建议」。
 * 组名取域名主体(如 ruiku.ai → ruiku)。返回空数组表示确实无可分的。
 */
export function localGroupSuggestion(tabs: OrganizeTab[]): { name: string; tabIds: string[] }[] {
  const byDomain = new Map<string, string[]>();
  for (const t of tabs) {
    const d = t.domain.trim().toLowerCase();
    if (!d) continue;
    const list = byDomain.get(d);
    if (list) list.push(t.id);
    else byDomain.set(d, [t.id]);
  }
  const out: { name: string; tabIds: string[] }[] = [];
  for (const [domain, tabIds] of byDomain) {
    if (tabIds.length < 2) continue; // 孤例不成组
    const name = (domain.split('.')[0] || domain).slice(0, 16);
    out.push({ name, tabIds });
  }
  // 组大的排前面,便于用户先看重点
  return out.toSorted((a, b) => b.tabIds.length - a.tabIds.length);
}

/** 我们期待的顶层键(含常见别名);用于在多个 JSON 候选里挑出「真正的答案」。 */
const PLAN_KEYS = [
  'newGroups',
  'new_groups',
  'newgroups',
  'groups',
  'assign',
  'assignments',
  'assigns',
  'unclear',
  'unsure',
  'unknown',
  'evict',
];

/**
 * 从可能夹带推理文字 / 多个代码块 / 多段 JSON 的响应里,健壮地提取「答案」对象。
 * 关键:**直接扫描原始文本**(不先 stripFences —— 那会在有多个代码块时丢掉答案),
 * 用平衡花括号(跳过字符串内部括号)收集所有顶层 {...} 段,逐个 parse,
 * 优先返回**含预期键**的那段;都不含则返回最后一个可解析的。全失败 → null。
 * 注:被 max_tokens 截断(末段无闭合)的片段不会入选。
 */
export function extractJsonObject(raw: string): unknown | null {
  const hasPlanKey = (v: unknown): boolean =>
    !!v && typeof v === 'object' && PLAN_KEYS.some((k) => k in (v as Record<string, unknown>));

  // 整体就是 JSON 的快路径(去围栏后再试一次)
  for (const t of [raw.trim(), stripFences(raw)]) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object') return v;
    } catch {
      // 走扫描
    }
  }

  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
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
          candidates.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  let fallback: unknown | null = null;
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(candidates[i]!);
      if (hasPlanKey(v)) return v; // 含预期键 → 就是答案
      if (fallback === null && v && typeof v === 'object') fallback = v;
    } catch {
      // 试下一个候选
    }
  }
  return fallback;
}

/** 取对象里首个存在的键(容忍模型用别名 / 下划线 / 大小写变体)。 */
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in obj) return obj[k];
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase().replace(/_/g, ''), k]));
  for (const k of keys) {
    const hit = lower.get(k.toLowerCase().replace(/_/g, ''));
    if (hit !== undefined) return obj[hit];
  }
  return undefined;
}

/**
 * 把模型给出的各种 id 写法归一成我们的 token(t3 / c1)。
 * 容忍:数字 3、裸序号 "3"、大小写 "T3"、带空格/井号 " #t3 "、对象 {id:"t3"}。
 * 归一后必须在映射表里,否则 null(丢弃)。
 */
function normalizeToken(v: unknown, prefix: 't' | 'c', valid: Map<string, string>): string | null {
  if (typeof v === 'number' && Number.isInteger(v)) {
    const tok = `${prefix}${v}`;
    return valid.has(tok) ? tok : null;
  }
  if (v && typeof v === 'object') {
    const inner = pick(v as Record<string, unknown>, 'id', 'tabId', 'taskId', 'token');
    return inner === undefined ? null : normalizeToken(inner, prefix, valid);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/^#/, '');
  if (valid.has(s)) return s;
  const m = s.match(/^[tc]?(\d+)$/); // "3" / "t3" / "c3"
  if (m) {
    const tok = `${prefix}${m[1]}`;
    return valid.has(tok) ? tok : null;
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
    const list = Array.isArray(arr) ? arr : arr === undefined || arr === null ? [] : [arr];
    const out: string[] = [];
    for (const x of list) {
      const token = normalizeToken(x, 't', tabTokenToId);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push(tabTokenToId.get(token)!); // token → 真实 id
    }
    return out;
  };

  const d = data as Record<string, unknown>;

  // Process assign first so existing tasks win in dedup
  const assign: AIPlan['assign'] = [];
  const rawAssign = pick(d, 'assign', 'assignments', 'assigns', 'assignTo');
  if (Array.isArray(rawAssign)) {
    for (const a of rawAssign) {
      if (!a || typeof a !== 'object') continue;
      const ao = a as Record<string, unknown>;
      const token = normalizeToken(
        pick(ao, 'taskId', 'task_id', 'task', 'contextId', 'id'),
        'c',
        taskTokenToId,
      );
      if (!token) continue;
      const tabIds = takeTabs(pick(ao, 'tabIds', 'tab_ids', 'tabs', 'ids', 'members'));
      if (tabIds.length) assign.push({ taskId: taskTokenToId.get(token)!, tabIds });
    }
  }

  // Then process newGroups
  const newGroups: AIPlan['newGroups'] = [];
  const rawGroups = pick(d, 'newGroups', 'new_groups', 'groups');
  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!g || typeof g !== 'object') continue;
      const go = g as Record<string, unknown>;
      const rawName = pick(go, 'name', 'title', 'groupName', 'group');
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const tabIds = takeTabs(pick(go, 'tabIds', 'tab_ids', 'tabs', 'ids', 'members'));
      if (name && tabIds.length) newGroups.push({ name: name.slice(0, 40), tabIds });
    }
  }

  // unclear:AI 拿不准、刻意留原位的标签(+ 可选理由)。放最后解析,seen 已含所有已归类标签 → 去重。
  // 容忍两种写法:[{tabId,reason}] 与裸 id 数组 ["t1", 2]。
  const unclear: NonNullable<AIPlan['unclear']> = [];
  const rawUnclear = pick(d, 'unclear', 'unsure', 'unknown');
  if (Array.isArray(rawUnclear)) {
    for (const u of rawUnclear) {
      const isObj = !!u && typeof u === 'object';
      const uo = isObj ? (u as Record<string, unknown>) : null;
      const token = normalizeToken(
        uo ? pick(uo, 'tabId', 'tab_id', 'id', 'tab') : u,
        't',
        tabTokenToId,
      );
      if (!token || seen.has(token)) continue;
      seen.add(token);
      const rawReason = uo ? pick(uo, 'reason', 'why', 'note') : '';
      const reason = (typeof rawReason === 'string' ? rawReason : '').trim().slice(0, 40);
      unclear.push({ tabId: tabTokenToId.get(token)!, reason });
    }
  }

  if (newGroups.length === 0 && assign.length === 0 && unclear.length === 0) return null;
  return unclear.length ? { newGroups, assign, unclear } : { newGroups, assign };
}
