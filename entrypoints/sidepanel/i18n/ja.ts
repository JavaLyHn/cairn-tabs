import type { Messages } from './en';

// 日本語 —— 键与 en 完全一致(TS 强制)。
export const ja: Messages = {
  'settings.data.import': 'JSON をインポート',
  'settings.data.importDesc': 'JSON バックアップからタスクを復元(「アーカイブ」に追加)',
  'import.done': '{contexts} 件のタスク · {tabs} 件のタブをインポートしました(「アーカイブ」内)',
  'import.nothing': '新しくインポートする内容はありません',
  'import.error.json': '有効な JSON ファイルではありません',
  'import.error.schema': 'Cairn Tabs のバックアップファイルではありません',
  'import.error.version': 'サポートされていないバックアップのバージョンです',
  'import.error.empty': 'ファイルにインポートできる内容がありません',
  'update.updated': 'v{version} に更新しました',
  'app.exportedAll': '全データをエクスポートしました (JSON)',
  'settings.group.language': '表示言語',
  'context.inboxName': '未分類',
  // ── app ──────────────────────────────────────────────────────────────────
  'app.searchPlaceholder': 'タブを検索…',
  'app.searchTitle': '検索 (⌘⇧K)',
  'app.newContext': '+ 新規',
  'app.newContextTitle': '新規タスク',
  'app.aiOrganizeAll': '✦ 全て整理',
  'app.aiOrganizeAllBusy': '✦ 整理中…',
  'app.aiOrganizeAllTitle': 'AI で全タブを正確に再グループ化(★スター付き・手動整理済みはそのまま)',
  'app.collapseAll': '全て折りたたむ',
  'app.expandAll': '全て展開',
  'app.settings': '設定',

  // ── app.footer ────────────────────────────────────────────────────────────
  'app.footer.archived': 'アーカイブ',
  'app.footer.tasks': 'タスク',
  'app.footer.tabs': 'タブ',
  'app.footer.reclaimed': '解放済み',
  'app.footer.reclaimedEstimate': '推定',

  // ── app.archived section ─────────────────────────────────────────────────
  'app.archivedSection': 'アーカイブ済み',

  // ── app.ai ───────────────────────────────────────────────────────────────
  'app.ai.analyzing': '✦ 分析中…',
  'app.ai.cancel': 'キャンセル',
  'app.ai.cancelAriaLabel': 'AI 整理をキャンセル',

  // ── app.unclassified fallback ─────────────────────────────────────────────
  'app.unclassified': '未分類',

  // ── ai.error ──────────────────────────────────────────────────────────────
  'ai.error.no_key': '先に設定で AI API キーを追加してください',
  'ai.error.permission': 'API ドメインへのアクセスが許可されていません',
  'ai.error.network': 'AI の呼び出しに失敗しました。再試行してください',
  'ai.error.parse': 'AI が有効なグループ提案を返せませんでした — 変更なし',
  'ai.error.empty.inbox': '未分類に整理できるタブがありません',
  'ai.error.empty.all': '整理できるタブがありません(★スター付き・手動整理済みはそのまま)',
  'ai.error.cancelled': 'AI 整理をキャンセルしました',
  'ai.error.default': 'AI の呼び出しに失敗しました',
  'ai.error.name.empty': 'このタスクには参照できるタブがありません',
  'ai.error.name.parse': 'AI が有効な名前を返しませんでした',
  'ai.error.name.cancelled': 'キャンセルしました',

  // ── ai.flash ──────────────────────────────────────────────────────────────
  'ai.flash.organizedAll': '全タブを整理しました',
  'ai.flash.applied': 'AI 整理を適用しました',

  // ── settings ──────────────────────────────────────────────────────────────
  'settings.title': '設定',
  'settings.done': '完了',
  'settings.ariaLabel': '設定',
  'settings.doneTitle': '完了 (Esc)',

  'settings.group.appearance': '外観',
  'settings.appearance.theme.title': 'テーマ',
  'settings.appearance.theme.desc': 'システムに従う、またはライト / ダークを固定',
  'settings.appearance.theme.auto': 'システム',
  'settings.appearance.theme.light': 'ライト',
  'settings.appearance.theme.dark': 'ダーク',
  'settings.appearance.accent.title': 'アクセントカラー',
  'settings.appearance.accent.desc': 'ボタン・リンク・トグル・フォーカスの主色',
  'settings.appearance.accent.custom': 'カスタム',
  'settings.appearance.accent.customAria': 'カスタムアクセントカラー(16 進数)',
  'settings.appearance.accent.name.teal': 'ティール',
  'settings.appearance.accent.name.blue': 'ブルー',
  'settings.appearance.accent.name.indigo': 'インディゴ',
  'settings.appearance.accent.name.violet': 'バイオレット',
  'settings.appearance.accent.name.rose': 'ローズ',
  'settings.appearance.accent.name.amber': 'アンバー',
  'settings.appearance.accent.name.slate': 'スレート',

  'settings.group.autoCluster': '自動グループ化',
  'settings.group.stale': '古いタブ',
  'settings.group.memory': 'メモリ',
  'settings.group.ai': 'AI 整理',
  'settings.group.data': 'データ',

  'settings.autoCluster.title': '自動グループ化',
  'settings.autoCluster.desc':
    '関連する新しいタブを自動でタスクにまとめ、対応するタブグループを作成します。オフにすると新しいタブは未分類に入り、手動で整理します。',
  'settings.autoCluster.domainSize.title': '同サイト提案しきい値',
  'settings.autoCluster.domainSize.desc':
    '未分類内の同じサイトのタブがこの数に達すると、タスクへのグループ化を提案します(確認後に反映)。',

  'settings.stale.hints.title': '古いタブのヒント',
  'settings.stale.hints.desc':
    '長期間未訪問のタブは下部に沈み「全てアーカイブ」エントリが表示されます — ヒントのみ、タブは移動しません。',
  'settings.stale.days.title': '古いタブのしきい値 · 日',
  'settings.stale.days.desc': 'この日数以上未訪問のタブを古いと判断します(スター付きタブは除外)。',

  'settings.memory.autoDiscard.title': '自動スリープ',
  'settings.memory.autoDiscard.desc':
    '長期間未使用のタブをメモリから解放します。タブは残り、クリックで再読み込みされます。デフォルトはオフ — メモリを節約したい場合に有効化。',
  'settings.memory.discardMinutes.title': 'スリープしきい値 · 分',
  'settings.memory.discardMinutes.desc':
    'この分数操作がないとメモリを解放します(スター付きタブと localhost は除外)。',
  'settings.memory.discardSkipsLocalhost.title': 'localhost をスリープしない',
  'settings.memory.discardSkipsLocalhost.desc':
    'ローカル開発アドレスは自動スリープされず、開発サーバーのページ状態を保護します。',

  'settings.data.exportAll.title': '全データをエクスポート (JSON)',
  'settings.data.exportAll.desc': 'バックアップや移行のために全タスクとタブをエクスポートします。',

  // ── settings.ai ───────────────────────────────────────────────────────────
  'settings.ai.desc':
    '独自の API キーを使用 — 選択したプロバイダーに直接接続します。デフォルトはオフ。送信されるのはタブのタイトル、ドメイン、タスク名のみで、完全な URL やページ内容は送信されません。',
  'settings.ai.configured': '現在: {provider} が設定済みです。',
  'settings.ai.provider.custom': 'カスタムリレー',
  'settings.ai.baseUrl.placeholder': 'エンドポイント URL(例: https://newapi.elevatesphere.com/v1)',
  'settings.ai.baseUrl.warning':
    'OpenAI 互換リレーです。第三者サービスのため、データが経由します。信頼できる URL のみ入力してください。',
  'settings.ai.key.placeholder.saved': '•••••••••••• · 保存済み(変更しない場合は空白のまま)',
  'settings.ai.key.placeholder.new': '{provider} API キー',
  'settings.ai.model.placeholder.custom': 'モデル(例: gpt-4o / claude-3-5-sonnet)',
  'settings.ai.model.placeholder.default': 'モデル(空白でデフォルトを使用)',
  'settings.ai.save': '保存して有効化',
  'settings.ai.test': '接続テスト',
  'settings.ai.testing': 'テスト中…',
  'settings.ai.saved': '保存しました',
  'settings.ai.saveFailed': '保存に失敗しました',
  'settings.ai.testFailed': 'テストに失敗しました',
  'settings.ai.permissionRequired': 'API ドメインへのアクセス許可が必要です',

  // ── context ────────────────────────────────────────────────────────────────
  'context.aiNaming.title': 'AI 命名(タスク内のタブに基づいて提案)',
  'context.aiNaming.cancelTitle': 'クリックしてキャンセル',
  'context.aiNaming.ariaLabel': 'AI 命名',
  'context.aiNaming.cancelAriaLabel': 'AI 命名をキャンセル',
  'context.aiNaming.button': '✦ AI',
  'context.aiNaming.cancelButton': '✦ キャンセル',
  'context.ai.organize': '✦ AI 整理',
  'context.ai.organizeBusy': '✦ 分析中…',
  'context.ai.organizeTitle': 'AI で散らばったタブをグループ化',
  'context.archiveAll': '全てアーカイブ',
  'context.archiveAllTitle': '散らばったタブを全てアーカイブ(1つのタスクとして保存)',
  'context.rename': '名前変更',
  'context.renameTitle': '名前変更',
  'context.export': 'エクスポート',
  'context.exportTitle': 'Markdown としてエクスポート(クリップボードにコピー)',
  'context.archive': 'アーカイブ',
  'context.archiveTitle': 'アーカイブ(タブを閉じる — 後でワンクリックで復元)',
  'context.delete': '削除',
  'context.deleteTitle': 'タスクを削除(タブは未分類に戻る)',
  'context.restore': '復元',
  'context.restoreTitle': 'タスクを復元',
  'context.archivedExportTitle': 'Markdown としてエクスポート(クリップボードにコピー)',
  'context.archivedDeleteTitle': 'タスクを削除(完全に削除)',
  'context.dropHint': 'ここにタブをドロップ',

  // ── tabRow ─────────────────────────────────────────────────────────────────
  'tabRow.asleep': 'スリープ中',
  'tabRow.asleepTitle': 'スリープ中 · クリックして再読み込み',
  'tabRow.asleepFullTitle': 'スリープ中 · クリックして再読み込み\n{url}',
  'tabRow.duplicate': '重複',
  'tabRow.duplicateTitle': '重複タブ(マージ時に閉じられます)',
  'tabRow.duplicateKeep': '重複·保持',
  'tabRow.duplicateKeepTitle': '重複グループ内で最後に開いたもの — マージ時に保持',
  'tabRow.star': 'スターを付ける',
  'tabRow.unstar': 'スターを外す',
  'tabRow.close': 'タブを閉じる',

  // ── search ──────────────────────────────────────────────────────────────────
  'search.ariaLabel': '検索',
  'search.placeholder': '開いているタブまたはアーカイブ済みタブを検索…',
  'search.recentHeader': '最近 · ★ スター付き',
  'search.noResults': '結果なし',
  'search.archivedSuffix': ' · アーカイブ済み',
  'search.unclassified': '未分類',
  'search.hint': '↑↓ 移動 · ↵ ジャンプ · ⌘↵ タスク復元 · esc 閉じる',

  // ── aiPlan ──────────────────────────────────────────────────────────────────
  'aiPlan.ariaLabel': 'AI 整理の提案',
  'aiPlan.header': '✦ AI が未分類を整理 · 確認して適用',
  'aiPlan.newGroups': '新規タスク',
  'aiPlan.assign': '既存タスクにマージ',
  'aiPlan.cancelGroup': 'グループをキャンセル',
  'aiPlan.cancelAssign': 'キャンセル',
  'aiPlan.removeTab': '除外',
  'aiPlan.removeTabTitle': 'このタブをグループ化しない',
  'aiPlan.taskFallback': 'タスク',
  'aiPlan.tabSource': '{source} から',
  'aiPlan.cancel': 'キャンセル',
  'aiPlan.apply': '適用',

  // ── export ──────────────────────────────────────────────────────────────────
  'export.ariaLabel': 'タスクをエクスポート',
  'export.title': 'エクスポート · {name}',
  'export.jsonNote': 'タスクとタブの生データバックアップ(移行・将来のインポート用)。',
  'export.close': '閉じる',
  'export.download': 'ダウンロード',
  'export.copy': 'コピー',
  'export.copied': 'クリップボードにコピーしました',
  'export.copyFailed': 'コピーに失敗しました。再試行してください',
  'export.downloaded': 'ファイルをダウンロードしました',

  // ── stale ───────────────────────────────────────────────────────────────────
  'stale.header': '古いタブ · {days}日間未訪問',
  'stale.archiveAll': '全てアーカイブ',
  'stale.archiveAllTitle': '古いタブを一括アーカイブ(元に戻せます)',

  // ── stats ───────────────────────────────────────────────────────────────────
  'stats.tabs': '{n} タブ',
  'stats.tasks': '{n} タスク',
  'stats.stale': '{n} 古いタブ',
  'stats.staleTitle': 'しきい値を超えて未訪問のタブ(下部に沈む)',
  'stats.duplicates': '{n} 重複 · マージ',
  'stats.duplicatesTitle': '重複タブを閉じ、各グループで最近アクティブなものを保持',

  // ── starred ─────────────────────────────────────────────────────────────────
  'starred.title': 'スター付き',

  // ── empty ───────────────────────────────────────────────────────────────────
  'empty.heading': 'タブがまだありません',
  'empty.body':
    'ウェブページを開くとここに表示されます。関連するタブは自動的にタスクにグループ化されます — または手動でタスクを作成して整理できます。',
  'empty.newTask': '+ 新規タスク',
  'empty.searchHint': '⌘⇧K 検索',

  // ── undo ────────────────────────────────────────────────────────────────────
  'undo.label': 'アーカイブ済み',
  'undo.action': '元に戻す',

  // ── domain ──────────────────────────────────────────────────────────────────
  'domain.sameSite': '同じサイト',
  'domain.tabs': '· {n} タブ',
  'domain.cluster': 'グループ化',
  'domain.ignore': '無視',

  // ── port ────────────────────────────────────────────────────────────────────
  'port.bind': 'バインド',
  'port.bindAction': 'バインド',
  'port.ignore': '無視',

  // ── draft ────────────────────────────────────────────────────────────────────
  'draft.defaultName': '新規タスク',

  // ── time ─────────────────────────────────────────────────────────────────────
  'time.daysAgo': '{d}日前',
};
