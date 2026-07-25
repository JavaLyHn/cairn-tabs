// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { AiProfilesSection } from '@/entrypoints/sidepanel/components/AiProfilesSection';
import type { AIStatus } from '@/shared/ai';

const noop = () => Promise.resolve();
const testConn = () => Promise.resolve({ ok: true, detail: 'ok' });

function statusWith(profiles: AIStatus['profiles'], activeId: string | null): AIStatus {
  return { profiles, activeId, ready: !!activeId };
}

/** 组件依赖 useT();统一在 zh-CN 下渲染。 */
function renderZh(ui: ReactElement) {
  return render(<I18nProvider initialLocale="zh-CN">{ui}</I18nProvider>);
}

afterEach(cleanup);

describe('AiProfilesSection', () => {
  it('空列表显示引导语', () => {
    renderZh(
      <AiProfilesSection
        ai={statusWith([], null)}
        onSave={noop}
        onDelete={noop}
        onActivate={noop}
        onTest={testConn}
      />,
    );
    expect(screen.getByText(/还没有 AI 配置/)).toBeTruthy();
  });

  it('列表显示当前配置的模型名(治「不显示模型」)', () => {
    const ai = statusWith(
      [
        {
          id: 'p1',
          label: '主力',
          provider: 'custom',
          model: 'gpt-4o',
          baseUrl: 'https://a.com/v1',
          hasKey: true,
        },
      ],
      'p1',
    );
    renderZh(
      <AiProfilesSection
        ai={ai}
        onSave={noop}
        onDelete={noop}
        onActivate={noop}
        onTest={testConn}
      />,
    );
    expect(screen.getByText(/当前:主力 · gpt-4o/)).toBeTruthy();
  });

  it('点非当前行「设为当前」→ onActivate(id)', () => {
    const onActivate = vi.fn(() => Promise.resolve());
    const ai = statusWith(
      [
        { id: 'p1', label: 'A', provider: 'anthropic', model: 'm1', hasKey: true },
        { id: 'p2', label: 'B', provider: 'anthropic', model: 'm2', hasKey: true },
      ],
      'p1',
    );
    renderZh(
      <AiProfilesSection
        ai={ai}
        onSave={noop}
        onDelete={noop}
        onActivate={onActivate}
        onTest={testConn}
      />,
    );
    fireEvent.click(screen.getByTitle('设为当前'));
    expect(onActivate).toHaveBeenCalledWith('p2');
  });

  it('编辑现有配置 → 表单回填模型(bug 回归)', () => {
    const ai = statusWith(
      [
        {
          id: 'p1',
          label: 'A',
          provider: 'custom',
          model: 'gpt-4o',
          baseUrl: 'https://a.com/v1',
          hasKey: true,
        },
      ],
      'p1',
    );
    renderZh(
      <AiProfilesSection
        ai={ai}
        onSave={noop}
        onDelete={noop}
        onActivate={noop}
        onTest={testConn}
      />,
    );
    fireEvent.click(screen.getByText('编辑'));
    expect(screen.getByDisplayValue('gpt-4o')).toBeTruthy();
    expect(screen.getByDisplayValue('https://a.com/v1')).toBeTruthy();
  });

  it('新增 → 填 key + 模型 → 保存调 onSave(无 id)', async () => {
    const onSave = vi.fn((_input: { id?: string; provider: string; model: string; key?: string }) =>
      Promise.resolve(),
    );
    renderZh(
      <AiProfilesSection
        ai={statusWith([], null)}
        onSave={onSave}
        onDelete={noop}
        onActivate={noop}
        onTest={testConn}
      />,
    );
    fireEvent.click(screen.getByText('+ 新增配置'));
    fireEvent.change(screen.getByLabelText(/API key/i), { target: { value: 'sk-x' } });
    fireEvent.change(screen.getByPlaceholderText(/模型/), { target: { value: 'claude-x' } });
    fireEvent.click(screen.getByText('保存并启用'));
    await Promise.resolve();
    expect(onSave).toHaveBeenCalled();
    const arg = onSave.mock.calls[0]![0];
    expect(arg).toMatchObject({ provider: 'anthropic', model: 'claude-x', key: 'sk-x' });
    expect(arg.id).toBeUndefined();
  });

  it('删除 → confirm 通过后 onDelete(id)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(() => Promise.resolve());
    const ai = statusWith(
      [{ id: 'p1', label: 'A', provider: 'anthropic', model: 'm1', hasKey: true }],
      'p1',
    );
    renderZh(
      <AiProfilesSection
        ai={ai}
        onSave={noop}
        onDelete={onDelete}
        onActivate={noop}
        onTest={testConn}
      />,
    );
    fireEvent.click(screen.getByText('删除'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });
});
