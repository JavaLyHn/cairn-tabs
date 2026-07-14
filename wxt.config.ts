import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// WXT manifest 声明 —— 权限最小化(见设计文档 §8)
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  // 不自动拉起独立 Chrome;由你把 .output/chrome-mv3-dev 手动加载进自己的浏览器
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Cairn Tabs',
    description: '面向程序员的标签页上下文管理器 (MVP 核心闭环)',
    permissions: ['tabs', 'tabGroups', 'storage', 'sidePanel', 'alarms'],
    optional_host_permissions: ['https://api.anthropic.com/*', 'https://api.openai.com/*'],
    // 工具栏图标(点击打开侧边栏);图标沿用 public/icon 下的 logo
    action: {
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '128': 'icon/128.png',
      },
    },
    commands: {
      'open-search': {
        suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
        description: '打开 Cairn Tabs 搜索',
      },
    },
  },
});
