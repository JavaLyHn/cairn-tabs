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
): { system: string; user: string } {
  const classifyRule = opts?.aggressive
    ? [
        '- 这些标签可能来自不同的已有分组;可以把明显更适合别处的标签跨组移动、也可以重新平衡已有分组。',
      ]
    : ['- 保守:只在明显合适时归类;不出现在输出里的标签自动留在未分类。'];
  const system = [
    '你是帮程序员整理浏览器标签的助手。目标:把标签按「同一个具体任务/项目」归类,能并入已有任务就并入,拿不准就留原位。',
    '对每个标签,依次这样判断:',
    '1) 能并入某个「已有任务」吗?逐个对照 existingTasks 的 name / domains / samples,只要明显属于其中某个任务,就 assign 到该任务(最优先)。',
    '2) 否则,能和其它零散标签凑成「同一个具体任务」的新组吗?能就放进 newGroups。',
    '3) 都不行 → 列入 unclear,附一句简短理由(不超过 20 字,说明为何难归类)。',
    '规则:',
    ...classifyRule,
    '- 「同一任务」= 明显服务于同一个具体项目/目标。仅仅同域名、同类型(都是搜索/文档/视频/社交)、或主题笼统相关,都【不算】同一任务,不要硬凑。',
    '- 禁止新建与某个已有任务主题重叠的分组 —— 那必须用 assign 并入,不要造重复的组;newGroups 只用于确实没有对应已有任务的新主题。',
    '- 拿不准归属的标签,不要硬塞进某组或塞进不合适的任务;列入 unclear 并附简短理由。宁可少归、多留 unclear,也不要把不相关的标签凑一起。',
    '- 新建分组名简短(不超过 16 字),概括该组共同任务,语言与标签标题一致。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    '示例(仅示意判断方式,勿照抄内容):',
    'existingTasks=[{"id":"t1","name":"支付重构","domains":["github.com","stripe.com"],"samples":["Refactor checkout #42","Stripe API"]}]',
    'looseTabs=[{"id":"a","title":"checkout webhook #47","domain":"github.com"},{"id":"b","title":"抖音-记录美好生活","domain":"douyin.com"},{"id":"c","title":"Stripe 退款文档","domain":"stripe.com"}]',
    '输出:{"newGroups":[],"assign":[{"taskId":"t1","tabIds":["a","c"]}],"unclear":[{"tabId":"b","reason":"与其它标签无共同任务"}]}',
    'JSON 结构:',
    '{"newGroups":[{"name":"组名","tabIds":["标签id"]}],"assign":[{"taskId":"任务id","tabIds":["标签id"]}],"unclear":[{"tabId":"标签id","reason":"简短理由"}]}',
  ].join('\n');
  const user = JSON.stringify({
    looseTabs: tabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain })),
    existingTasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      domains: t.domains,
      samples: t.samples,
    })),
  });
  return { system, user };
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
  let data: unknown;
  const text = stripFences(raw);
  try {
    data = JSON.parse(text);
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      data = JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
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
  validTabIds: Set<string>,
  validTaskIds: Set<string>,
): AIPlan | null {
  let data: unknown;
  const text = stripFences(raw);
  try {
    data = JSON.parse(text);
  } catch {
    // 容忍模型偶尔夹带说明文字:退而提取首个 {...} 再解析(温度已设 0,此为兜底)
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      data = JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;

  const seen = new Set<string>(); // 一个标签至多归一处
  const takeTabs = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x === 'string' && validTabIds.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
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
      const taskId = typeof rawTaskId === 'string' ? rawTaskId : '';
      if (!validTaskIds.has(taskId)) continue;
      const tabIds = takeTabs((a as { tabIds?: unknown }).tabIds);
      if (tabIds.length) assign.push({ taskId, tabIds });
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
      const tabId = typeof rawId === 'string' ? rawId : '';
      if (!validTabIds.has(tabId) || seen.has(tabId)) continue;
      seen.add(tabId);
      const rawReason = (u as { reason?: unknown }).reason;
      const reason = (typeof rawReason === 'string' ? rawReason : '').trim().slice(0, 40);
      unclear.push({ tabId, reason });
    }
  }

  if (newGroups.length === 0 && assign.length === 0 && unclear.length === 0) return null;
  return unclear.length ? { newGroups, assign, unclear } : { newGroups, assign };
}
