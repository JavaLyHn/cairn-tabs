// @vitest-environment jsdom
// Provider 的 context value 引用稳定性。
// 内联成对象字面量时,Provider 每次重渲染都产出新引用,令**所有**消费者
// 跟着重渲染 —— 而 I18nProvider / ThemeProvider 都包着整个面板。
// 这里断言:父组件重渲染但 locale / mode / accent 未变时,消费者拿到的是同一个引用。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { I18nProvider, useT } from '@/entrypoints/sidepanel/i18n';
import { ThemeProvider, useTheme } from '@/entrypoints/sidepanel/theme';

afterEach(cleanup);

beforeEach(() => {
  // Provider 挂载时会读 storage;给个不会 reject 的桩,避免 unhandled rejection
  vi.stubGlobal('chrome', {
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
  });
});

/** 渲染一个能被外部触发重渲染的壳,记录每次消费者拿到的 context 引用。 */
function mountWithRerender(Consumer: () => ReactNode, wrap: (c: ReactNode) => ReactNode) {
  let bump: () => void = () => {};
  function Shell() {
    const [, setN] = useState(0);
    bump = () => setN((n) => n + 1);
    return wrap(<Consumer />);
  }
  render(<Shell />);
  return { bump: () => act(() => bump()) };
}

describe('I18nProvider 的 context value', () => {
  it('locale 未变时,重渲染不产生新引用', () => {
    const seen: unknown[] = [];
    const Consumer = () => {
      seen.push(useT());
      return <span data-testid="n">{String(seen.length)}</span>;
    };
    const { bump } = mountWithRerender(Consumer, (c) => (
      <I18nProvider initialLocale="en">{c}</I18nProvider>
    ));

    bump();
    bump();

    expect(screen.getByTestId('n').textContent).toBe('3'); // 确实重渲染了 3 次
    expect(seen[1]).toBe(seen[0]); // 但拿到的是同一个 value
    expect(seen[2]).toBe(seen[0]);
  });

  it('切换语言时引用必须更新(记忆不能记过头)', () => {
    const seen: { locale: string }[] = [];
    let switchTo: (l: 'en' | 'zh-CN') => void = () => {};
    const Consumer = () => {
      const v = useT();
      seen.push({ locale: v.locale });
      switchTo = v.setLocale;
      return null;
    };
    render(
      <I18nProvider initialLocale="en">
        <Consumer />
      </I18nProvider>,
    );
    act(() => switchTo('zh-CN'));
    expect(seen.at(-1)?.locale).toBe('zh-CN');
  });
});

describe('ThemeProvider 的 context value', () => {
  it('mode/accent 未变时,重渲染不产生新引用', () => {
    const seen: unknown[] = [];
    const Consumer = () => {
      seen.push(useTheme());
      return <span data-testid="t">{String(seen.length)}</span>;
    };
    const { bump } = mountWithRerender(Consumer, (c) => (
      <ThemeProvider initialMode="dark" initialAccent="blue">
        {c}
      </ThemeProvider>
    ));

    bump();
    bump();

    expect(screen.getByTestId('t').textContent).toBe('3');
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });
});
