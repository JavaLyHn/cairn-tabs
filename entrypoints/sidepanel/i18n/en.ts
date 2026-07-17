// 文案目录 —— en 为类型源。新增文案先加到这里,其余语种类型不匹配即报错提醒补全。

export const en = {
  'settings.data.import': 'Import JSON',
  'settings.data.importDesc': 'Restore tasks from a JSON backup (added to Archived)',
  'import.done': 'Imported {contexts} tasks · {tabs} tabs (in Archived)',
  'import.nothing': 'Nothing new to import',
  'import.error.json': 'Not a valid JSON file',
  'import.error.schema': 'Not a Cairn Tabs backup file',
  'import.error.version': 'Unsupported backup version',
  'import.error.empty': 'No importable content in the file',
  'update.updated': 'Updated to v{version}',
  'app.exportedAll': 'Exported all data (JSON)',
  'settings.group.language': 'Language',
  'context.inboxName': 'Unclassified',
  // ── app ──────────────────────────────────────────────────────────────────
  'app.searchPlaceholder': 'Search tabs…',
  'app.searchTitle': 'Search (⌘⇧K)',
  'app.newContext': '+ New',
  'app.newContextTitle': 'New task',
  'app.aiOrganizeAll': '✦ Organize all',
  'app.aiOrganizeAllBusy': '✦ Organizing…',
  'app.aiOrganizeAllTitle':
    'Use AI to re-group all tabs precisely (★ starred and manually sorted stay put)',
  'app.collapseAll': 'Collapse all',
  'app.expandAll': 'Expand all',
  'app.settings': 'Settings',

  // ── app.footer ────────────────────────────────────────────────────────────
  'app.footer.archived': 'Archived',
  'app.footer.tasks': 'tasks',
  'app.footer.tabs': 'tabs',
  'app.footer.reclaimed': 'Reclaimed',
  'app.footer.reclaimedEstimate': 'est.',

  // ── app.archived section ─────────────────────────────────────────────────
  'app.archivedSection': 'Archived',

  // ── app.ai ───────────────────────────────────────────────────────────────
  'app.ai.analyzing': '✦ Analyzing…',
  'app.ai.cancel': 'Cancel',
  'app.ai.cancelAriaLabel': 'Cancel AI organize',

  // ── app.unclassified fallback ─────────────────────────────────────────────
  'app.unclassified': 'Unclassified',

  // ── ai.error ──────────────────────────────────────────────────────────────
  'ai.error.no_key': 'Please add an AI API key in Settings first',
  'ai.error.permission': 'Not authorized to access API domain',
  'ai.error.network': 'AI call failed, please try again',
  'ai.error.parse': 'AI could not produce usable grouping suggestions — no changes made',
  'ai.error.empty.inbox': 'No tabs in Unclassified to organize',
  'ai.error.empty.all': 'No tabs to organize (★ starred and manually sorted stay put)',
  'ai.error.cancelled': 'AI organize cancelled',
  'ai.error.default': 'AI call failed',
  'ai.error.name.empty': 'This task has no tabs to reference',
  'ai.error.name.parse': 'AI did not return a usable name',
  'ai.error.name.cancelled': 'Cancelled',

  // ── ai.flash ──────────────────────────────────────────────────────────────
  'ai.flash.organizedAll': 'All tabs organized',
  'ai.flash.applied': 'AI organize applied',

  // ── settings ──────────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.done': 'Done',
  'settings.ariaLabel': 'Settings',
  'settings.doneTitle': 'Done (Esc)',

  'settings.group.appearance': 'Appearance',
  'settings.appearance.theme.title': 'Theme',
  'settings.appearance.theme.desc': 'Follow system, or force light / dark',
  'settings.appearance.theme.auto': 'Auto',
  'settings.appearance.theme.light': 'Light',
  'settings.appearance.theme.dark': 'Dark',
  'settings.appearance.accent.title': 'Accent color',
  'settings.appearance.accent.desc': 'Main color for buttons, links, toggles, focus',
  'settings.appearance.accent.custom': 'Custom',
  'settings.appearance.accent.customAria': 'Custom accent color (hex)',
  'settings.appearance.accent.name.teal': 'Teal',
  'settings.appearance.accent.name.blue': 'Blue',
  'settings.appearance.accent.name.indigo': 'Indigo',
  'settings.appearance.accent.name.violet': 'Violet',
  'settings.appearance.accent.name.rose': 'Rose',
  'settings.appearance.accent.name.amber': 'Amber',
  'settings.appearance.accent.name.slate': 'Slate',

  'settings.group.autoCluster': 'Auto-cluster',
  'settings.group.stale': 'Stale tabs',
  'settings.group.memory': 'Memory',
  'settings.group.ai': 'AI organize',
  'settings.group.data': 'Data',

  'settings.autoCluster.title': 'Auto-cluster',
  'settings.autoCluster.desc':
    'Automatically group related new tabs into tasks and create matching tab groups. When off, new tabs go to Unclassified for manual sorting.',
  'settings.autoCluster.domainSize.title': 'Same-site suggestion threshold',
  'settings.autoCluster.domainSize.desc':
    'Suggest grouping into a task when this many tabs from the same site accumulate in Unclassified (you confirm before it takes effect).',

  'settings.stale.hints.title': 'Stale hints',
  'settings.stale.hints.desc':
    'Tabs not visited for a long time sink to the bottom with an "Archive all" entry — hints only, your tabs are not moved.',
  'settings.stale.days.title': 'Stale threshold · days',
  'settings.stale.days.desc':
    'Tabs not visited for this many days are considered stale (starred tabs excluded).',

  'settings.memory.autoDiscard.title': 'Auto-sleep',
  'settings.memory.autoDiscard.desc':
    'Tabs unused for a long time are unloaded from memory. The tab stays; click to reload. Off by default — enable to save memory.',
  'settings.memory.discardMinutes.title': 'Sleep threshold · minutes',
  'settings.memory.discardMinutes.desc':
    'Unload after this many minutes of inactivity (starred tabs and localhost excluded).',
  'settings.memory.discardSkipsLocalhost.title': 'Keep localhost awake',
  'settings.memory.discardSkipsLocalhost.desc':
    'Local dev addresses are never auto-slept, preserving dev-server page state.',

  'settings.data.exportAll.title': 'Export all data (JSON)',
  'settings.data.exportAll.desc': 'Export all tasks and tabs for backup or migration.',

  // ── settings.ai ───────────────────────────────────────────────────────────
  'settings.ai.desc':
    'Bring your own API key — connects directly to the provider you choose. Off by default. Only tab titles, domains, and task names are sent; full URLs and page content are never transmitted.',
  'settings.ai.configured': 'Current: {provider} configured.',
  'settings.ai.provider.custom': 'Custom relay',
  'settings.ai.baseUrl.placeholder': 'Endpoint URL, e.g. https://newapi.elevatesphere.com/v1',
  'settings.ai.baseUrl.warning':
    'OpenAI-compatible relay. It is a third party — your data passes through it. Enter only a URL you trust.',
  'settings.ai.key.placeholder.saved': '•••••••••••• · saved (leave blank to keep)',
  'settings.ai.key.placeholder.new': '{provider} API key',
  'settings.ai.model.placeholder.custom': 'Model, e.g. gpt-4o / claude-3-5-sonnet',
  'settings.ai.model.placeholder.default': 'Model (leave blank for default)',
  'settings.ai.save': 'Save & enable',
  'settings.ai.test': 'Test connection',
  'settings.ai.testing': 'Testing…',
  'settings.ai.saved': 'Saved',
  'settings.ai.saveFailed': 'Save failed',
  'settings.ai.testFailed': 'Test failed',
  'settings.ai.permissionRequired': 'Permission required to access API domain',

  // ── context ────────────────────────────────────────────────────────────────
  'context.aiNaming.title': 'AI name (suggests based on tabs in this task)',
  'context.aiNaming.cancelTitle': 'Click to cancel',
  'context.aiNaming.ariaLabel': 'AI name',
  'context.aiNaming.cancelAriaLabel': 'Cancel AI naming',
  'context.aiNaming.button': '✦ AI',
  'context.aiNaming.cancelButton': '✦ Cancel',
  'context.ai.organize': '✦ AI organize',
  'context.ai.organizeBusy': '✦ Analyzing…',
  'context.ai.organizeTitle': 'Use AI to group scattered tabs',
  'context.archiveAll': 'Archive all',
  'context.archiveAllTitle': 'Archive all scattered tabs (saved as one task)',
  'context.rename': 'Rename',
  'context.renameTitle': 'Rename',
  'context.export': 'Export',
  'context.exportTitle': 'Export as Markdown (copy to clipboard)',
  'context.archive': 'Archive',
  'context.archiveTitle': 'Archive (close tabs — restore later with one click)',
  'context.delete': 'Delete',
  'context.deleteTitle': 'Delete task (tabs return to Unclassified)',
  'context.restore': 'Restore',
  'context.restoreTitle': 'Restore task',
  'context.archivedExportTitle': 'Export as Markdown (copy to clipboard)',
  'context.archivedDeleteTitle': 'Delete task (permanently removed)',
  'context.dropHint': 'Drop tabs here',

  // ── tabRow ─────────────────────────────────────────────────────────────────
  'tabRow.asleep': 'Sleeping',
  'tabRow.asleepTitle': 'Sleeping · click to reload',
  'tabRow.asleepFullTitle': 'Sleeping · click to reload\n{url}',
  'tabRow.duplicate': 'Dup',
  'tabRow.unclear': 'AI wasn’t sure how to classify this — kept in place: {reason}',
  'tabRow.unclearGeneric': 'AI wasn’t sure how to classify this — kept in place',
  'tabRow.duplicateTitle': 'Duplicate tab (will be closed on merge)',
  'tabRow.duplicateKeep': 'Dup·keep',
  'tabRow.duplicateKeepTitle': 'Most-recently opened in the duplicate group — kept on merge',
  'tabRow.star': 'Mark as starred',
  'tabRow.unstar': 'Remove star',
  'tabRow.close': 'Close tab',

  // ── search ──────────────────────────────────────────────────────────────────
  'search.ariaLabel': 'Search',
  'search.placeholder': 'Search open or archived tabs…',
  'search.recentHeader': 'Recent · ★ Starred',
  'search.noResults': 'No results',
  'search.archivedSuffix': ' · archived',
  'search.unclassified': 'Unclassified',
  'search.hint': '↑↓ navigate · ↵ jump · ⌘↵ restore task · esc close',

  // ── aiPlan ──────────────────────────────────────────────────────────────────
  'aiPlan.ariaLabel': 'AI organize suggestions',
  'aiPlan.header': '✦ AI organize unclassified · confirm to apply',
  'aiPlan.newGroups': 'New tasks',
  'aiPlan.assign': 'Merge into existing tasks',
  'aiPlan.unclear': 'Unsure — kept in place',
  'aiPlan.cancelGroup': 'Cancel group',
  'aiPlan.cancelAssign': 'Cancel',
  'aiPlan.removeTab': 'Remove',
  'aiPlan.removeTabTitle': 'Do not group this tab',
  'aiPlan.taskFallback': 'Task',
  'aiPlan.tabSource': 'From {source}',
  'aiPlan.cancel': 'Cancel',
  'aiPlan.apply': 'Apply',

  // ── export ──────────────────────────────────────────────────────────────────
  'export.ariaLabel': 'Export task',
  'export.title': 'Export · {name}',
  'export.jsonNote': 'Raw data backup of tasks and tabs (for migration / future import).',
  'export.close': 'Close',
  'export.download': 'Download',
  'export.copy': 'Copy',
  'export.copied': 'Copied to clipboard',
  'export.copyFailed': 'Copy failed, please try again',
  'export.downloaded': 'File downloaded',

  // ── stale ───────────────────────────────────────────────────────────────────
  'stale.header': 'Stale · {days}d without visit',
  'stale.archiveAll': 'Archive all',
  'stale.archiveAllTitle': 'Archive all stale tabs in bulk (undoable)',

  // ── stats ───────────────────────────────────────────────────────────────────
  'stats.tabs': '{n} tabs',
  'stats.tasks': '{n} tasks',
  'stats.stale': '{n} stale',
  'stats.staleTitle': 'Tabs not visited past the threshold (sunk to bottom)',
  'stats.duplicates': '{n} dup · merge',
  'stats.duplicatesTitle': 'Close duplicate tabs, keeping the most recently active in each group',

  // ── starred ─────────────────────────────────────────────────────────────────
  'starred.title': 'Starred',

  // ── empty ───────────────────────────────────────────────────────────────────
  'empty.heading': 'No tabs yet',
  'empty.body':
    'Open some web pages and they will appear here. Related tabs are automatically grouped into tasks — or create a task manually to organize.',
  'empty.newTask': '+ New task',
  'empty.searchHint': '⌘⇧K search',

  // ── undo ────────────────────────────────────────────────────────────────────
  'undo.label': 'Archived',
  'undo.action': 'Undo',

  // ── domain ──────────────────────────────────────────────────────────────────
  'domain.sameSite': 'Same site',
  'domain.tabs': '· {n} tabs',
  'domain.cluster': 'Group',
  'domain.ignore': 'Dismiss',

  // ── port ────────────────────────────────────────────────────────────────────
  'port.bind': 'Bind',
  'port.bindAction': 'Bind',
  'port.ignore': 'Dismiss',

  // ── draft ────────────────────────────────────────────────────────────────────
  'draft.defaultName': 'New task',

  // ── time ─────────────────────────────────────────────────────────────────────
  'time.daysAgo': '{d}d ago',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
