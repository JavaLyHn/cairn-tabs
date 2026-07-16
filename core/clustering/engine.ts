// 增量聚簇引擎(纯函数,见 PRD §6)。不做全量重聚类,单个新标签定归属。

import { INBOX_ID, type Context, type TabRecord } from '@/shared/types';
import { hostnameOf, pathOf, pathOverlap, registrableDomain } from './signals';
import { WEIGHTS, ASSIGN_THRESHOLD, TAU_MS, penaltyKey, type Penalties } from './rules';

export interface AssignInput {
  url: string;
  openerRecordId?: string;
  now: number;
  contexts: Context[];
  tabs: TabRecord[];
  penalties: Penalties;
}

/** 为新标签选归属:返回某活跃命名簇 id,或 INBOX_ID(低置信度兜底)。 */
export function assignContext(input: AssignInput): string {
  const { url, openerRecordId, now, contexts, tabs, penalties } = input;
  const candidates = contexts.filter((c) => c.status === 'active' && c.id !== INBOX_ID);
  if (candidates.length === 0) return INBOX_ID;

  const host = hostnameOf(url);
  const reg = registrableDomain(host);
  const path = pathOf(url);

  const tabsByCtx = new Map<string, TabRecord[]>();
  for (const t of tabs) {
    const arr = tabsByCtx.get(t.contextId);
    if (arr) arr.push(t);
    else tabsByCtx.set(t.contextId, [t]);
  }

  // 通用域名降权(IDF):域名出现在越多簇里,价值越低
  const domainCtxCount = new Map<string, number>();
  for (const c of candidates) {
    const regs = new Set(
      (tabsByCtx.get(c.id) ?? []).map((t) => registrableDomain(hostnameOf(t.url))),
    );
    for (const d of regs) domainCtxCount.set(d, (domainCtxCount.get(d) ?? 0) + 1);
  }
  const idf = (d: string) => 1 / (1 + Math.log(1 + (domainCtxCount.get(d) ?? 0)));

  const openerCtx = openerRecordId
    ? tabs.find((t) => t.id === openerRecordId)?.contextId
    : undefined;

  let best = INBOX_ID;
  let bestScore = 0;
  for (const c of candidates) {
    const cTabs = tabsByCtx.get(c.id) ?? [];
    const opener = openerCtx === c.id ? 1 : 0;

    const temporal = Math.exp(-Math.max(0, now - c.lastActiveAt) / TAU_MS);

    let domainBase = 0;
    const hosts = new Set(cTabs.map((t) => hostnameOf(t.url)));
    const regs = new Set(cTabs.map((t) => registrableDomain(hostnameOf(t.url))));
    if (host && hosts.has(host)) domainBase = 1;
    else if (reg && regs.has(reg)) domainBase = 0.5;
    const domain = domainBase * idf(reg);

    let path_ = 0;
    for (const t of cTabs) {
      if (hostnameOf(t.url) === host) path_ = Math.max(path_, pathOverlap(path, pathOf(t.url)));
    }

    const penalty = penalties[penaltyKey(reg, c.id)] ?? 0;

    const score =
      WEIGHTS.opener * opener +
      WEIGHTS.temporal * temporal +
      WEIGHTS.domain * domain +
      WEIGHTS.path * path_ -
      penalty;

    if (score > bestScore) {
      bestScore = score;
      best = c.id;
    }
  }

  return bestScore >= ASSIGN_THRESHOLD ? best : INBOX_ID;
}

export interface DomainSuggestion {
  domain: string;
  tabIds: string[];
}

/**
 * 未分类里同一注册域(eTLD+1)的「活、未锁定」标签达到 threshold 的成簇建议(F-07 同域升格)。
 * - existingNames:已有活跃命名簇的 name 集合;域名已是某簇名则跳过(避免重复建簇)。
 * - 不做通用域黑名单(设计决策):任何域够数都给建议。
 * - threshold 至少视作 2;按候选数降序返回。
 */
export function sameDomainSuggestions(
  inboxTabs: TabRecord[],
  existingNames: Set<string>,
  threshold: number,
): DomainSuggestion[] {
  const min = Math.max(2, threshold);
  const byDomain = new Map<string, string[]>();
  for (const t of inboxTabs) {
    if (t.pinned || t.chromeTabId == null) continue; // 只看未锁定的活标签
    const host = hostnameOf(t.url);
    // localhost 各端口是不同项目(交给 F-08 端口映射),不按同域并簇
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))
      continue;
    const d = registrableDomain(host);
    if (!d) continue;
    const arr = byDomain.get(d);
    if (arr) arr.push(t.id);
    else byDomain.set(d, [t.id]);
  }
  const out: DomainSuggestion[] = [];
  for (const [domain, tabIds] of byDomain) {
    if (tabIds.length < min) continue;
    if (existingNames.has(domain)) continue; // 已有同名簇 → 不重复建议
    out.push({ domain, tabIds });
  }
  out.sort((a, b) => b.tabIds.length - a.tabIds.length);
  return out;
}
