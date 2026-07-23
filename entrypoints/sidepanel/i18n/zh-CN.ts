import type { Messages } from './en';

// 简体中文 —— 键与 en 完全一致(TS 强制)。值为原文中文。
export const zhCN: Messages = {
  'settings.data.import': '导入 JSON',
  'settings.data.importDesc': '从 JSON 备份恢复任务(导入到「已归档」)',
  'import.done': '已导入 {contexts} 个任务 · {tabs} 个标签(在「已归档」)',
  'import.nothing': '没有可新增导入的内容',
  'import.error.json': '文件不是合法的 JSON',
  'import.error.schema': '不是 Cairn Tabs 的备份文件',
  'import.error.version': '备份版本不支持',
  'import.error.empty': '文件里没有可导入的内容',
  'update.updated': '已更新到 v{version}',
  'app.exportedAll': '已导出全部数据 (JSON)',
  'settings.group.language': '界面语言',
  'context.inboxName': '未分类',
  // ── app ──────────────────────────────────────────────────────────────────
  'app.searchPlaceholder': '搜索标签…',
  'app.searchTitle': '搜索 (⌘⇧K)',
  'app.newContext': '+ 新建',
  'app.newContextTitle': '新建任务',
  'app.aiOrganizeAll': '✦ 整理全部',
  'app.aiOrganizeAllBusy': '✦ 整理中…',
  'app.aiOrganizeAllTitle': '用 AI 把所有标签重新精准分组(★重点和手动分好的不动)',
  'app.collapseAll': '全部折叠',
  'app.expandAll': '全部展开',
  'app.settings': '设置',

  // ── app.footer ────────────────────────────────────────────────────────────
  'app.footer.archived': '归档',
  'app.footer.tasks': '任务',
  'app.footer.tabs': '标签',
  'app.footer.reclaimed': '回收',
  'app.footer.reclaimedEstimate': '估算',

  // ── app.archived section ─────────────────────────────────────────────────
  'app.archivedSection': '已归档',

  // ── app.ai ───────────────────────────────────────────────────────────────
  'app.ai.analyzing': '✦ AI 分析中…',
  'app.ai.cancel': '取消',
  'app.ai.cancelAriaLabel': '取消 AI 整理',

  // ── app.unclassified fallback ─────────────────────────────────────────────
  'app.unclassified': '未分类',

  // ── ai.error ──────────────────────────────────────────────────────────────
  'ai.error.no_key': '请先在设置里填 AI API key',
  'ai.error.permission': '未授权访问 API 域名',
  'ai.error.network': 'AI 调用失败,请稍后重试',
  'ai.error.parse': 'AI 没能给出可用的分组建议,已保持原样',
  'ai.error.empty.inbox': '未分类里没有可整理的标签',
  'ai.error.empty.all': '没有可整理的标签(★重点和手动分好的不动)',
  'ai.error.empty.task': '这个任务里没有可动标签(★重点和手动分好的不动)',
  'ai.error.cancelled': '已取消 AI 整理',
  'ai.error.default': 'AI 调用失败',
  'ai.error.name.empty': '这个任务里没有标签可参考',
  'ai.error.name.parse': 'AI 没给出可用的名字',
  'ai.error.name.cancelled': '已取消',

  // ── ai.flash ──────────────────────────────────────────────────────────────
  'ai.flash.organizedAll': '已整理全部',
  'ai.flash.pruned': '已整理「{name}」',
  'ai.flash.applied': '已应用 AI 整理',

  // ── settings ──────────────────────────────────────────────────────────────
  'settings.title': '设置',
  'settings.done': '完成',
  'settings.ariaLabel': '设置',
  'settings.doneTitle': '完成 (Esc)',

  'settings.group.appearance': '外观',
  'settings.appearance.theme.title': '主题模式',
  'settings.appearance.theme.desc': '跟随系统,或强制浅色 / 深色',
  'settings.appearance.theme.auto': '跟随系统',
  'settings.appearance.theme.light': '浅色',
  'settings.appearance.theme.dark': '深色',
  'settings.appearance.accent.title': '强调色',
  'settings.appearance.accent.desc': '按钮 · 链接 · 开关 · 激活态 · 焦点框的主色',
  'settings.appearance.accent.custom': '自定义',
  'settings.appearance.accent.customAria': '自定义强调色(十六进制)',
  'settings.appearance.accent.name.teal': '青绿',
  'settings.appearance.accent.name.blue': '蓝',
  'settings.appearance.accent.name.indigo': '靛',
  'settings.appearance.accent.name.violet': '紫',
  'settings.appearance.accent.name.rose': '玫红',
  'settings.appearance.accent.name.amber': '琥珀',
  'settings.appearance.accent.name.slate': '石墨',

  'settings.group.autoCluster': '自动归类',
  'settings.group.stale': '陈旧标签',
  'settings.group.memory': '内存',
  'settings.group.ai': 'AI 整理',
  'settings.group.data': '数据',

  'settings.autoCluster.title': '自动归类',
  'settings.autoCluster.desc':
    '把相关新标签自动归入任务,并在标签栏建立对应分组。关闭后新标签只进「未分类」,由你手动整理。',
  'settings.autoCluster.domainSize.title': '同站归类建议',
  'settings.autoCluster.domainSize.desc':
    '未分类里同一网站的标签达到这个数,就建议归成一个任务(你确认才生效)。',

  'settings.stale.hints.title': '陈旧提示',
  'settings.stale.hints.desc':
    '很久没访问的标签下沉到底部,给一个「全部归档」入口;只提示,不动你的标签。',
  'settings.stale.days.title': '陈旧阈值 · 天',
  'settings.stale.days.desc': '超过这么多天没访问就算陈旧(重点标签除外)。',

  'settings.memory.autoDiscard.title': '自动休眠',
  'settings.memory.autoDiscard.desc':
    '很久没用的标签自动释放内存,标签保留、点击自动重载;默认关闭,想省内存再开。',
  'settings.memory.discardMinutes.title': '休眠阈值 · 分钟',
  'settings.memory.discardMinutes.desc': '超过这么多分钟没用就释放内存(重点标签、localhost 除外)。',
  'settings.memory.discardSkipsLocalhost.title': 'localhost 不休眠',
  'settings.memory.discardSkipsLocalhost.desc':
    '本地开发地址永不自动休眠,保护 dev server 的页面状态。',

  'settings.data.exportAll.title': '导出全部数据 (JSON)',
  'settings.data.exportAll.desc': '导出所有任务与标签,用于备份或迁移。',

  // ── settings.ai ───────────────────────────────────────────────────────────
  'settings.ai.desc':
    '自带 API key,用你的 key 直连你选的服务商。默认关闭。只把标签标题、域名、任务名发出去,绝不发完整网址或页面内容。',
  'settings.ai.configured': '当前:{provider} 已配置。',
  'settings.ai.provider.custom': '自定义中转站',
  'settings.ai.baseUrl.placeholder': '接口地址,如 https://newapi.elevatesphere.com/v1',
  'settings.ai.baseUrl.warning': 'OpenAI 兼容的中转站。它是第三方,数据会经过它,请填你信任的地址。',
  'settings.ai.key.placeholder.saved': '•••••••••••• · 已保存(留空则不改)',
  'settings.ai.key.placeholder.new': '{provider} API key',
  'settings.ai.model.placeholder.custom': '模型,如 gpt-4o / claude-3-5-sonnet',
  'settings.ai.model.placeholder.default': '模型(留空用默认)',
  'settings.ai.save': '保存并启用',
  'settings.ai.test': '测试连接',
  'settings.ai.testing': '测试中…',
  'settings.ai.saved': '已保存',
  'settings.ai.saveFailed': '保存失败',
  'settings.ai.testFailed': '测试失败',
  'settings.ai.permissionRequired': '需要授权访问 API 域名',

  // ── context ────────────────────────────────────────────────────────────────
  'context.aiNaming.title': 'AI 命名(据任务里的标签建议)',
  'context.aiNaming.cancelTitle': '点击取消',
  'context.aiNaming.ariaLabel': 'AI 命名',
  'context.aiNaming.cancelAriaLabel': '取消 AI 命名',
  'context.aiNaming.button': '✦ AI',
  'context.aiRename': 'AI 改名',
  'context.aiRenameTitle': 'AI 建议一个任务名(预填,确认后生效)',
  'context.aiNaming.cancelButton': '✦ 取消',
  'context.ai.organize': '✦ AI 整理',
  'context.ai.organizeBusy': '✦ 分析中…',
  'context.ai.organizeTitle': '用 AI 把零散标签分组',
  'context.ai.pruneTitle': 'AI 整理本组 —— 把不属于这个任务的标签移到未分类',
  'context.archiveAll': '全部归档',
  'context.archiveAllTitle': '把全部零散标签归档(存为一个任务)',
  'context.rename': '改名',
  'context.renameTitle': '改名',
  'context.export': '导出',
  'context.exportTitle': '导出为 Markdown(复制到剪贴板)',
  'context.archive': '归档',
  'context.archiveTitle': '归档(关闭标签,之后可一键恢复)',
  'context.delete': '删',
  'context.deleteTitle': '删除任务(标签退回未分类)',
  'context.restore': '恢复',
  'context.restoreTitle': '恢复任务',
  'context.archivedExportTitle': '导出为 Markdown(复制到剪贴板)',
  'context.archivedDeleteTitle': '删除任务(彻底移除)',
  'context.dropHint': '拖标签到这里',

  // ── tabRow ─────────────────────────────────────────────────────────────────
  'tabRow.asleep': '休眠',
  'tabRow.asleepTitle': '已休眠 · 点击重新加载',
  'tabRow.asleepFullTitle': '已休眠 · 点击重新加载\n{url}',
  'tabRow.duplicate': '重复',
  'tabRow.unclear': 'AI 拿不准怎么归类,已留原位:{reason}',
  'tabRow.unclearGeneric': 'AI 拿不准怎么归类,已留原位',
  'tabRow.duplicateTitle': '重复标签(合并时会被关闭)',
  'tabRow.duplicateKeep': '重复·留',
  'tabRow.duplicateKeepTitle': '重复组中最新打开的,合并时保留这个',
  'tabRow.star': '标为重点',
  'tabRow.unstar': '取消重点',
  'tabRow.close': '关闭标签',

  // ── search ──────────────────────────────────────────────────────────────────
  'search.ariaLabel': '搜索',
  'search.placeholder': '搜索打开或已归档的标签…',
  'search.recentHeader': '最近 · ★ 重点',
  'search.noResults': '无匹配',
  'search.archivedSuffix': ' · 归档',
  'search.unclassified': '未分类',
  'search.hint': '↑↓ 选择 · ↵ 跳转 · ⌘↵ 恢复任务 · esc 关闭',

  // ── aiPlan ──────────────────────────────────────────────────────────────────
  'aiPlan.ariaLabel': 'AI 整理建议',
  'aiPlan.header': '✦ AI 整理未分类 · 确认后生效',
  'aiPlan.newGroups': '新建任务',
  'aiPlan.assign': '并入已有任务',
  'aiPlan.unclear': '拿不准 · 保持原位',
  'aiPlan.summary.moved': '移动 {n}',
  'aiPlan.summary.newGroups': '新建 {n} 组',
  'aiPlan.summary.unchanged': '无变更 {n}',
  'aiPlan.summary.unclear': '拿不准 {n}',
  'aiPlan.unchangedFold': '{n} 个已在此组(无变更)',
  'aiPlan.applyN': '应用({n} 处变更)',
  'aiPlan.noChanges': '本次无需变更',
  'aiPlan.cancelGroup': '取消这组',
  'aiPlan.cancelAssign': '取消',
  'aiPlan.removeTab': '移除',
  'aiPlan.removeTabTitle': '不归类这个标签',
  'aiPlan.taskFallback': '任务',
  'aiPlan.tabSource': '原 {source}',
  'aiPlan.cancel': '取消',
  'aiPlan.apply': '应用',

  // ── export ──────────────────────────────────────────────────────────────────
  'export.ariaLabel': '导出任务',
  'export.title': '导出 · {name}',
  'export.jsonNote': '任务与标签的原始数据备份(可迁移 / 日后再导入)。',
  'export.close': '关闭',
  'export.download': '下载文件',
  'export.copy': '复制',
  'export.copied': '已复制到剪贴板',
  'export.copyFailed': '复制失败,请重试',
  'export.downloaded': '已下载文件',

  // ── stale ───────────────────────────────────────────────────────────────────
  'stale.header': '陈旧 · {days} 天没访问',
  'stale.archiveAll': '全部归档',
  'stale.archiveAllTitle': '把全部陈旧标签整批归档(可撤销)',

  // ── stats ───────────────────────────────────────────────────────────────────
  'stats.tabs': '{n} 标签',
  'stats.tasks': '{n} 任务',
  'stats.stale': '{n} 陈旧',
  'stats.staleTitle': '超过阈值天数未访问的标签(下沉到底部)',
  'stats.duplicates': '{n} 重复 · 合并',
  'stats.duplicatesTitle': '关闭重复标签,每组保留最近活跃的',

  // ── starred ─────────────────────────────────────────────────────────────────
  'starred.title': '重点',
  'starred.remove': '移出重点(不关闭标签)',

  // ── empty ───────────────────────────────────────────────────────────────────
  'empty.heading': '还没有标签',
  'empty.body':
    '打开一些网页,它们会出现在这里。相关的标签会自动聚成任务,你也可以手动新建任务来整理。',
  'empty.newTask': '+ 新建任务',
  'empty.searchHint': '⌘⇧K 搜索',

  // ── undo ────────────────────────────────────────────────────────────────────
  'undo.label': '已归档',
  'undo.archivedInto': '已归档到「{name}」',
  'undo.action': '撤销',

  // ── domain ──────────────────────────────────────────────────────────────────
  'domain.sameSite': '同站',
  'domain.tabs': '· {n} 个',
  'domain.cluster': '归类',
  'domain.ignore': '忽略',

  // ── port ────────────────────────────────────────────────────────────────────
  'port.bind': '绑定',
  'port.bindAction': '绑定',
  'port.ignore': '忽略',

  // ── draft ────────────────────────────────────────────────────────────────────
  'draft.defaultName': '新任务',

  // ── time ─────────────────────────────────────────────────────────────────────
  'time.daysAgo': '{d} 天前',
};
