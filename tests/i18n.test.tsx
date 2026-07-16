// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { en } from '@/entrypoints/sidepanel/i18n/en';
import { zhCN } from '@/entrypoints/sidepanel/i18n/zh-CN';
import { ja } from '@/entrypoints/sidepanel/i18n/ja';
import { ko } from '@/entrypoints/sidepanel/i18n/ko';
import { I18nProvider, useT } from '@/entrypoints/sidepanel/i18n';
import { SUPPORTED } from '@/entrypoints/sidepanel/i18n/locales';

describe('catalog completeness', () => {
  const enKeys = Object.keys(en).sort();

  it('all four locales define exactly the same keys', () => {
    for (const [name, cat] of [
      ['zh-CN', zhCN],
      ['ja', ja],
      ['ko', ko],
    ] as const) {
      expect(Object.keys(cat).sort(), `${name} key set`).toEqual(enKeys);
    }
  });

  it('no locale has empty values', () => {
    for (const [name, cat] of [
      ['en', en],
      ['zh-CN', zhCN],
      ['ja', ja],
      ['ko', ko],
    ] as const) {
      for (const [k, v] of Object.entries(cat)) {
        expect(String(v).length, `${name}:${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolation placeholders match en across locales', () => {
    // 每个 key 的 {param} 集合应与 en 一致(漏译占位会导致运行时残留 {x})
    const ph = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
    for (const cat of [zhCN, ja, ko]) {
      for (const k of enKeys) {
        expect(ph((cat as Record<string, string>)[k]!), k).toBe(
          ph((en as Record<string, string>)[k]!),
        );
      }
    }
  });

  it('exposes 4 supported locales', () => {
    expect(SUPPORTED).toEqual(['en', 'zh-CN', 'ja', 'ko']);
  });
});

function Probe() {
  const { t, locale } = useT();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="draft">{t('draft.defaultName')}</span>
      <span data-testid="dup">{t('stats.duplicates', { n: 5 })}</span>
    </div>
  );
}

describe('I18nProvider + useT', () => {
  it('renders the initialLocale catalog', () => {
    render(
      <I18nProvider initialLocale="ja">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('ja');
    expect(screen.getByTestId('draft').textContent).toBe('新規タスク');
  });

  it('different locales render different text', () => {
    const { unmount } = render(
      <I18nProvider initialLocale="en">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('draft').textContent).toBe('New task');
    unmount();
    render(
      <I18nProvider initialLocale="zh-CN">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('draft').textContent).toBe('新任务');
  });

  it('interpolates {param} and leaves no placeholder', () => {
    render(
      <I18nProvider initialLocale="en">
        <Probe />
      </I18nProvider>,
    );
    const out = screen.getByTestId('dup').textContent ?? '';
    expect(out).toContain('5');
    expect(out).not.toContain('{');
  });

  it('falls back to English when used without a provider (no throw)', () => {
    render(<Probe />);
    expect(screen.getByTestId('draft').textContent).toBe('New task');
  });
});
