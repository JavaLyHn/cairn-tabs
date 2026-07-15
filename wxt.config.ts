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
    description: '面向程序员的标签页上下文管理器 —— 按任务归类、归档恢复、秒搜。本地优先、无账号。',
    permissions: ['tabs', 'tabGroups', 'storage', 'sidePanel', 'alarms'],
    // 官方两档 + 自定义中转站(任意 https host,运行时按所填地址派生 origin、带用户手势申请)
    optional_host_permissions: ['https://api.anthropic.com/*', 'https://api.openai.com/*', 'https://*/*'],
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
