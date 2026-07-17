// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandMark } from '@/entrypoints/sidepanel/components/BrandMark';
import { EmptyState } from '@/entrypoints/sidepanel/components/EmptyState';
import { I18nProvider } from '@/entrypoints/sidepanel/i18n';

afterEach(cleanup);

describe('BrandMark', () => {
  it('渲染 Cairn Tabs 字标文字', () => {
    render(<BrandMark />);
    expect(screen.getByText('Cairn Tabs')).toBeTruthy();
  });

  it('用内联 svg 图标而非 img PNG(矢量清晰、随主题变色、不裂图)', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('存在 brand-breathe 呼吸光晕容器', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('.brand-breathe')).toBeTruthy();
  });
});

describe('EmptyState 用动效字标', () => {
  it('展示 Cairn Tabs 字标(替换掉静态 PNG)', () => {
    const { container } = render(
      <I18nProvider initialLocale="zh-CN">
        <EmptyState onNew={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText('Cairn Tabs')).toBeTruthy();
    expect(container.querySelector('.brand-breathe')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
