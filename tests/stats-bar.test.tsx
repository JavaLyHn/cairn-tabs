// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';
import { StatsBar } from '@/entrypoints/sidepanel/components/StatsBar';
import type { Locale } from '@/entrypoints/sidepanel/i18n/locales';

afterEach(cleanup);

function renderAt(locale: Locale, ui: ReactElement) {
  return render(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>);
}

const bar = <StatsBar stale={17} redundant={3} onMerge={vi.fn()} />;

describe('StatsBar 数字与词序', () => {
  it('英文:{n} 在句首', () => {
    const { container } = renderAt('en', bar);
    const text = container.textContent ?? '';
    expect(text).toContain('17 stale');
    expect(text).toContain('3 dup');
    expect(text).not.toContain('1717'); // 不得重复数字
  });

  it('韩文:{n} 在句中(오래됨 17개)也不重复数字 —— 回归', () => {
    const { container } = renderAt('ko', bar);
    const text = container.textContent ?? '';
    expect(text).toContain('오래됨 17개');
    expect(text).toContain('중복 3개');
    expect(text).not.toContain('1717'); // 旧实现会渲染成 "17" + "17개"
    expect(text).not.toContain('3복'); // 旧实现会把 "중" 截掉
  });

  it('中/日:句首词序照常', () => {
    const zh = renderAt('zh-CN', bar);
    expect(zh.container.textContent).toContain('17 陈旧');
    cleanup();
    const ja = renderAt('ja', bar);
    expect(ja.container.textContent).toContain('17 古いタブ');
  });

  it('数字仍用等宽字体渲染(视觉不回退)', () => {
    renderAt('ko', bar);
    const monos = [...document.querySelectorAll('.font-mono')].map((e) => e.textContent);
    expect(monos).toContain('17');
    expect(monos).toContain('3');
  });

  it('无陈旧也无重复时整条不渲染 —— 界面不留空位', () => {
    const { container } = renderAt('en', <StatsBar stale={0} redundant={0} onMerge={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
