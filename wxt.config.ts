import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// WXT manifest 声明 —— 权限最小化(见设计文档 §8)
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Cairn Tabs',
    description: '面向程序员的标签页上下文管理器 (MVP 核心闭环)',
    permissions: ['tabs', 'tabGroups', 'storage', 'sidePanel'],
    // action 是空的,仅用于允许点击工具栏图标打开侧边栏
    action: {},
    commands: {
      'open-search': {
        suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
        description: '打开 Cairn Tabs 搜索',
      },
    },
  },
});
