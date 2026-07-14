import { describe, it, expect } from 'vitest';
import { buildOrganizePrompt, parseOrganizeResponse } from '@/core/ai/organize';

const TABS = new Set(['t1', 't2', 't3']);
const TASKS = new Set(['c1']);

describe('buildOrganizePrompt', () => {
  it('系统提示含 JSON 约束,user 含标签与任务', () => {
    const { system, user } = buildOrganizePrompt(
      [{ id: 't1', title: 'React hooks', domain: 'react.dev' }],
      [{ id: 'c1', name: 'auth-service' }],
    );
    expect(system).toContain('JSON');
    expect(user).toContain('t1');
    expect(user).toContain('react.dev');
    expect(user).toContain('auth-service');
  });
});

describe('parseOrganizeResponse', () => {
  it('解析正常 JSON', () => {
    const raw = '{"newGroups":[{"name":"前端","tabIds":["t1","t2"]}],"assign":[{"taskId":"c1","tabIds":["t3"]}]}';
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
    const raw = '{"newGroups":[{"name":"g","tabIds":["t1","BAD"]}],"assign":[{"taskId":"NOPE","tabIds":["t2"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'g', tabIds: ['t1'] }],
      assign: [],
    });
  });
  it('同一标签只归一处(去重,以先出现为准)', () => {
    const raw = '{"newGroups":[{"name":"a","tabIds":["t1"]},{"name":"b","tabIds":["t1","t2"]}],"assign":[]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'a', tabIds: ['t1'] }, { name: 'b', tabIds: ['t2'] }],
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
  it('空结果 → null', () => {
    expect(parseOrganizeResponse('{"newGroups":[],"assign":[]}', TABS, TASKS)).toBeNull();
  });
  it('同一标签同时出现在新组与已有任务 → 归入已有任务', () => {
    const raw = '{"newGroups":[{"name":"g","tabIds":["t1","t2"]}],"assign":[{"taskId":"c1","tabIds":["t1"]}]}';
    expect(parseOrganizeResponse(raw, TABS, TASKS)).toEqual({
      newGroups: [{ name: 'g', tabIds: ['t2'] }],
      assign: [{ taskId: 'c1', tabIds: ['t1'] }],
    });
  });
});
