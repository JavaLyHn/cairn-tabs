import { describe, it, expect } from 'vitest';
import {
  buildOrganizePrompt,
  parseOrganizeResponse,
  buildPruneTaskPrompt,
  parsePruneResponse,
  summarizeTaskTabs,
} from '@/core/ai/organize';

const TABS = new Set(['t1', 't2', 't3']);
const TASKS = new Set(['c1']);

describe('buildOrganizePrompt', () => {
  it('系统提示含 JSON 约束,user 含标签与任务', () => {
    const { system, user } = buildOrganizePrompt(
      [{ id: 't1', title: 'React hooks', domain: 'react.dev' }],
      [{ id: 'c1', name: 'auth-service', domains: [], samples: [] }],
    );
    expect(system).toContain('JSON');
    expect(user).toContain('t1');
    expect(user).toContain('react.dev');
    expect(user).toContain('auth-service');
  });
  it('已有任务带上 domains 与 samples 供 AI 判断归属', () => {
    const { user } = buildOrganizePrompt(
      [{ id: 't1', title: 'x', domain: 'a.com' }],
      [{ id: 'c1', name: '任务', domains: ['react.dev'], samples: ['React 文档'] }],
    );
    expect(user).toContain('react.dev');
    expect(user).toContain('React 文档');
  });
  it('激进档:可跨组移动;默认档保守;两档都要求拿不准列 unclear', () => {
    const args: [
      Parameters<typeof buildOrganizePrompt>[0],
      Parameters<typeof buildOrganizePrompt>[1],
    ] = [
      [{ id: 't1', title: 'x', domain: 'a.com' }],
      [{ id: 'c1', name: '任务', domains: [], samples: [] }],
    ];
    const conservative = buildOrganizePrompt(...args);
    const aggressive = buildOrganizePrompt(...args, { aggressive: true });
    expect(conservative.system).toContain('保守');
    expect(aggressive.system).not.toContain('保守');
    expect(aggressive.system).toContain('跨组');
    // 两档都不再「尽量归类」,都要求把拿不准的列入 unclear
    expect(aggressive.system).not.toContain('尽量');
    expect(conservative.system).toContain('unclear');
    expect(aggressive.system).toContain('unclear');
    expect(conservative.system).toContain('拿不准');
    expect(aggressive.system).toContain('拿不准');
  });
  it('提示词强调:先并入已有任务、禁止重复建组、抬高「同一任务」门槛', () => {
    const { system } = buildOrganizePrompt(
      [{ id: 't1', title: 'x', domain: 'a.com' }],
      [{ id: 'c1', name: '任务', domains: [], samples: [] }],
    );
    expect(system).toContain('已有任务'); // 三步优先级里最优先并入
    expect(system).toContain('禁止新建与某个已有任务主题重叠'); // 治重复建组
    expect(system).toContain('同一任务'); // 抬高门槛
    expect(system).toContain('示例'); // few-shot 示例
  });
});

describe('buildPruneTaskPrompt', () => {
  it('系统含任务名 + 「不属于/踢出」净化语义 + JSON;user 含任务与标签', () => {
    const { system, user } = buildPruneTaskPrompt('支付重构', [
      { id: 't1', title: 'checkout #47', domain: 'github.com' },
    ]);
    expect(system).toContain('支付重构');
    expect(system).toContain('不属于');
    expect(system).toContain('evict');
    expect(system).toContain('JSON');
    expect(user).toContain('t1');
    expect(user).toContain('github.com');
  });
});

describe('parsePruneResponse', () => {
  const VALID = new Set(['t1', 't2', 't3']);
  it('解析 evict / unclear,校验 tabId、理由截断', () => {
    const raw = JSON.stringify({
      evict: [{ tabId: 't1', reason: '与主题无关' }],
      unclear: [
        { tabId: 't2', reason: 'x'.repeat(60) },
        { tabId: 'BAD', reason: '非法' },
      ],
    });
    expect(parsePruneResponse(raw, VALID)).toEqual({
      evict: [{ tabId: 't1', reason: '与主题无关' }],
      unclear: [{ tabId: 't2', reason: 'x'.repeat(40) }],
    });
  });
  it('一个标签至多一处(evict 优先于 unclear)', () => {
    const raw = JSON.stringify({
      evict: [{ tabId: 't1', reason: 'a' }],
      unclear: [{ tabId: 't1', reason: 'b' }],
    });
    expect(parsePruneResponse(raw, VALID)).toEqual({
      evict: [{ tabId: 't1', reason: 'a' }],
      unclear: [],
    });
  });
  it('去围栏 + 合法但空 → 空结构', () => {
    expect(parsePruneResponse('```json\n{"evict":[],"unclear":[]}\n```', VALID)).toEqual({
      evict: [],
      unclear: [],
    });
  });
  it('不可解析 → null', () => {
    expect(parsePruneResponse('not json', VALID)).toBeNull();
  });
});

describe('summarizeTaskTabs', () => {
  it('域名按频次取 top5、去重;标题取前 5', () => {
    const s = summarizeTaskTabs([
      { title: 'A', domain: 'x.com' },
      { title: 'B', domain: 'x.com' },
      { title: 'C', domain: 'y.com' },
      { title: 'D', domain: 'z1.com' },
      { title: 'E', domain: 'z2.com' },
      { title: 'F', domain: 'z3.com' },
      { title: 'G', domain: 'z4.com' },
    ]);
    expect(s.domains[0]).toBe('x.com'); // 频次最高在前
    expect(s.domains).toHaveLength(5); // 至多 5
    expect(s.samples).toEqual(['A', 'B', 'C', 'D', 'E']); // 前 5 标题
  });
  it('空输入 → 空', () => {
    expect(summarizeTaskTabs([])).toEqual({ domains: [], samples: [] });
  });
});

describe('parseOrganizeResponse', () => {
  it('解析正常 JSON', () => {
    const raw =
      '{"newGroups":[{"name":"前端","tabIds":["t1","t2"]}],"assign":[{"taskId":"c1","tabIds":["t3"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: '前端', tabIds: ['t1', 't2'] }],
      assign: [{ taskId: 'c1', tabIds: ['t3'] }],
    });
  });
  it('去掉 ```json 代码围栏', () => {
    const raw = '```json\n{"newGroups":[{"name":"g","tabIds":["t1"]}],"assign":[]}\n```';
    expect(parseOrganizeResponse(raw, TABS, TASKS)?.newGroups[0]?.name).toBe('g');
  });
  it('丢弃非法 tabId 与未知 taskId', () => {
    const raw =
      '{"newGroups":[{"name":"g","tabIds":["t1","BAD"]}],"assign":[{"taskId":"NOPE","tabIds":["t2"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'g', tabIds: ['t1'] }],
      assign: [],
    });
  });
  it('同一标签只归一处(去重,以先出现为准)', () => {
    const raw =
      '{"newGroups":[{"name":"a","tabIds":["t1"]},{"name":"b","tabIds":["t1","t2"]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [
        { name: 'a', tabIds: ['t1'] },
        { name: 'b', tabIds: ['t2'] },
      ],
      assign: [],
    });
  });
  it('空组名或空 tabIds 的组被丢弃', () => {
    const raw = '{"newGroups":[{"name":"","tabIds":["t1"]},{"name":"x","tabIds":[]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toBeNull();
  });
  it('JSON 解析失败 → null', () => {
    expect(parseOrganizeResponse('not json', TABS, TASKS)).toBeNull();
  });
  it('容忍模型夹带说明文字(提取首个 {...} 再解析)', () => {
    const raw =
      '好的,这是结果:\n{"newGroups":[{"name":"g","tabIds":["t1"]}],"assign":[]}\n希望有用';
    expect(parseOrganizeResponse(raw, TABS, TASKS)?.newGroups[0]?.name).toBe('g');
  });
  it('空结果 → null', () => {
    expect(parseOrganizeResponse('{"newGroups":[],"assign":[]}', TABS, TASKS)).toBeNull();
  });
  it('同一标签同时出现在新组与已有任务 → 归入已有任务', () => {
    const raw =
      '{"newGroups":[{"name":"g","tabIds":["t1","t2"]}],"assign":[{"taskId":"c1","tabIds":["t1"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'g', tabIds: ['t2'] }],
      assign: [{ taskId: 'c1', tabIds: ['t1'] }],
    });
  });
  it('解析 unclear:有效保留、无效丢弃、与已归类去重、理由截断', () => {
    const raw = JSON.stringify({
      newGroups: [],
      assign: [{ taskId: 'c1', tabIds: ['t1'] }],
      unclear: [
        { tabId: 't2', reason: '主题不明确' },
        { tabId: 'BAD', reason: '无效 tabId' }, // 丢弃
        { tabId: 't1', reason: '已归类应丢弃' }, // 与 assign 去重
        { tabId: 't3', reason: 'x'.repeat(60) }, // 理由截断到 40
      ],
    });
    const plan = parseOrganizeResponse(raw, TABS, TASKS);
    expect(plan?.unclear).toEqual([
      { tabId: 't2', reason: '主题不明确' },
      { tabId: 't3', reason: 'x'.repeat(40) },
    ]);
  });
  it('无 unclear 时结果不含该键(兼容旧断言)', () => {
    const raw = '{"newGroups":[{"name":"g","tabIds":["t1"]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).not.toHaveProperty('unclear');
  });
  it('仅 unclear(无归类)也返回方案', () => {
    const raw = '{"newGroups":[],"assign":[],"unclear":[{"tabId":"t1","reason":"看不出主题"}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [],
      assign: [],
      unclear: [{ tabId: 't1', reason: '看不出主题' }],
    });
  });
});
