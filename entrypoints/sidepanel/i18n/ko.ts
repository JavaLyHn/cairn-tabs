import type { Messages } from './en';

// 한국어 —— 键与 en 完全一致(TS 强制)。
export const ko: Messages = {
  'settings.data.import': 'JSON 가져오기',
  'settings.data.importDesc': 'JSON 백업에서 작업 복원(「보관됨」에 추가)',
  'import.done': '{contexts}개 작업 · {tabs}개 탭을 가져왔습니다(「보관됨」에 있음)',
  'import.nothing': '새로 가져올 내용이 없습니다',
  'import.error.json': '유효한 JSON 파일이 아닙니다',
  'import.error.schema': 'Cairn Tabs 백업 파일이 아닙니다',
  'import.error.version': '지원하지 않는 백업 버전입니다',
  'import.error.empty': '파일에 가져올 내용이 없습니다',
  'app.exportedAll': '모든 데이터를 내보냈습니다 (JSON)',
  'settings.group.language': '표시 언어',
  'context.inboxName': '미분류',
  // ── app ──────────────────────────────────────────────────────────────────
  'app.searchPlaceholder': '탭 검색…',
  'app.searchTitle': '검색 (⌘⇧K)',
  'app.newContext': '+ 새로 만들기',
  'app.newContextTitle': '새 작업',
  'app.aiOrganizeAll': '✦ 전체 정리',
  'app.aiOrganizeAllBusy': '✦ 정리 중…',
  'app.aiOrganizeAllTitle':
    'AI로 모든 탭을 정밀하게 재그룹화합니다 (★ 즐겨찾기 및 수동 정렬 탭은 유지)',
  'app.collapseAll': '모두 접기',
  'app.expandAll': '모두 펼치기',
  'app.settings': '설정',

  // ── app.footer ────────────────────────────────────────────────────────────
  'app.footer.archived': '보관됨',
  'app.footer.tasks': '작업',
  'app.footer.tabs': '탭',
  'app.footer.reclaimed': '회수',
  'app.footer.reclaimedEstimate': '추정',

  // ── app.archived section ─────────────────────────────────────────────────
  'app.archivedSection': '보관된 항목',

  // ── app.ai ───────────────────────────────────────────────────────────────
  'app.ai.analyzing': '✦ 분석 중…',
  'app.ai.cancel': '취소',
  'app.ai.cancelAriaLabel': 'AI 정리 취소',

  // ── app.unclassified fallback ─────────────────────────────────────────────
  'app.unclassified': '미분류',

  // ── ai.error ──────────────────────────────────────────────────────────────
  'ai.error.no_key': '먼저 설정에서 AI API key를 추가하세요',
  'ai.error.permission': 'API 도메인 접근 권한이 없습니다',
  'ai.error.network': 'AI 호출에 실패했습니다. 다시 시도해 주세요',
  'ai.error.parse': 'AI가 유효한 그룹 제안을 생성하지 못했습니다 — 변경 사항 없음',
  'ai.error.empty.inbox': '미분류에 정리할 탭이 없습니다',
  'ai.error.empty.all': '정리할 탭이 없습니다 (★ 즐겨찾기 및 수동 정렬 탭은 유지)',
  'ai.error.cancelled': 'AI 정리가 취소되었습니다',
  'ai.error.default': 'AI 호출 실패',
  'ai.error.name.empty': '이 작업에 참조할 탭이 없습니다',
  'ai.error.name.parse': 'AI가 유효한 이름을 반환하지 않았습니다',
  'ai.error.name.cancelled': '취소됨',

  // ── ai.flash ──────────────────────────────────────────────────────────────
  'ai.flash.organizedAll': '모든 탭 정리 완료',
  'ai.flash.applied': 'AI 정리가 적용되었습니다',

  // ── settings ──────────────────────────────────────────────────────────────
  'settings.title': '설정',
  'settings.done': '완료',
  'settings.ariaLabel': '설정',
  'settings.doneTitle': '완료 (Esc)',

  'settings.group.appearance': '외관',
  'settings.appearance.theme.title': '테마',
  'settings.appearance.theme.desc': '시스템 따르기, 또는 라이트 / 다크 강제',
  'settings.appearance.theme.auto': '시스템',
  'settings.appearance.theme.light': '라이트',
  'settings.appearance.theme.dark': '다크',
  'settings.appearance.accent.title': '강조색',
  'settings.appearance.accent.desc': '버튼 · 링크 · 토글 · 활성 · 포커스의 주색',
  'settings.appearance.accent.custom': '사용자 지정',
  'settings.appearance.accent.customAria': '사용자 지정 강조색(16진수)',
  'settings.appearance.accent.name.teal': '틸',
  'settings.appearance.accent.name.blue': '블루',
  'settings.appearance.accent.name.indigo': '인디고',
  'settings.appearance.accent.name.violet': '바이올렛',
  'settings.appearance.accent.name.rose': '로즈',
  'settings.appearance.accent.name.amber': '앰버',
  'settings.appearance.accent.name.slate': '슬레이트',

  'settings.group.autoCluster': '자동 클러스터',
  'settings.group.stale': '오래된 탭',
  'settings.group.memory': '메모리',
  'settings.group.ai': 'AI 정리',
  'settings.group.data': '데이터',

  'settings.autoCluster.title': '자동 클러스터',
  'settings.autoCluster.desc':
    '관련 새 탭을 작업으로 자동 그룹화하고 탭 그룹을 생성합니다. 꺼져 있으면 새 탭은 미분류로 이동하여 수동으로 정렬해야 합니다.',
  'settings.autoCluster.domainSize.title': '동일 사이트 제안 임계값',
  'settings.autoCluster.domainSize.desc':
    '미분류에서 같은 사이트의 탭이 이 수만큼 쌓이면 작업으로 그룹화를 제안합니다 (확인 후 적용).',

  'settings.stale.hints.title': '오래된 탭 힌트',
  'settings.stale.hints.desc':
    '오랫동안 방문하지 않은 탭이 하단으로 내려가고 "모두 보관" 항목이 표시됩니다 — 힌트만 제공하며 탭은 이동되지 않습니다.',
  'settings.stale.days.title': '오래된 탭 임계값 · 일',
  'settings.stale.days.desc':
    '이 일수 동안 방문하지 않은 탭은 오래된 것으로 간주합니다 (즐겨찾기 탭 제외).',

  'settings.memory.autoDiscard.title': '자동 절전',
  'settings.memory.autoDiscard.desc':
    '오랫동안 사용하지 않은 탭은 메모리에서 언로드됩니다. 탭은 유지되며 클릭하면 다시 로드됩니다. 기본적으로 꺼져 있습니다 — 메모리 절약을 위해 활성화하세요.',
  'settings.memory.discardMinutes.title': '절전 임계값 · 분',
  'settings.memory.discardMinutes.desc':
    '이 시간(분) 동안 비활성 상태이면 언로드됩니다 (즐겨찾기 탭 및 localhost 제외).',
  'settings.memory.discardSkipsLocalhost.title': 'localhost 절전 제외',
  'settings.memory.discardSkipsLocalhost.desc':
    '로컬 개발 주소는 자동 절전되지 않아 개발 서버의 페이지 상태가 유지됩니다.',

  'settings.data.exportAll.title': '전체 데이터 내보내기 (JSON)',
  'settings.data.exportAll.desc': '백업 또는 마이그레이션을 위해 모든 작업과 탭을 내보냅니다.',

  // ── settings.ai ───────────────────────────────────────────────────────────
  'settings.ai.desc':
    '직접 API key를 사용하여 선택한 공급자에 직접 연결합니다. 기본적으로 꺼져 있습니다. 탭 제목, 도메인, 작업 이름만 전송되며 전체 URL과 페이지 콘텐츠는 전송되지 않습니다.',
  'settings.ai.configured': '현재: {provider} 구성됨.',
  'settings.ai.provider.custom': '커스텀 릴레이',
  'settings.ai.baseUrl.placeholder': '엔드포인트 URL, 예: https://newapi.elevatesphere.com/v1',
  'settings.ai.baseUrl.warning':
    'OpenAI 호환 릴레이입니다. 제3자이므로 데이터가 경유합니다. 신뢰할 수 있는 URL만 입력하세요.',
  'settings.ai.key.placeholder.saved': '•••••••••••• · 저장됨 (유지하려면 비워 두세요)',
  'settings.ai.key.placeholder.new': '{provider} API key',
  'settings.ai.model.placeholder.custom': '모델, 예: gpt-4o / claude-3-5-sonnet',
  'settings.ai.model.placeholder.default': '모델 (기본값 사용 시 비워 두세요)',
  'settings.ai.save': '저장 및 활성화',
  'settings.ai.test': '연결 테스트',
  'settings.ai.testing': '테스트 중…',
  'settings.ai.saved': '저장됨',
  'settings.ai.saveFailed': '저장 실패',
  'settings.ai.testFailed': '테스트 실패',
  'settings.ai.permissionRequired': 'API 도메인 접근 권한이 필요합니다',

  // ── context ────────────────────────────────────────────────────────────────
  'context.aiNaming.title': 'AI 이름 지정 (이 작업의 탭을 기반으로 제안)',
  'context.aiNaming.cancelTitle': '클릭하여 취소',
  'context.aiNaming.ariaLabel': 'AI 이름 지정',
  'context.aiNaming.cancelAriaLabel': 'AI 이름 지정 취소',
  'context.aiNaming.button': '✦ AI',
  'context.aiNaming.cancelButton': '✦ 취소',
  'context.ai.organize': '✦ AI 정리',
  'context.ai.organizeBusy': '✦ 분석 중…',
  'context.ai.organizeTitle': 'AI로 흩어진 탭 그룹화',
  'context.archiveAll': '모두 보관',
  'context.archiveAllTitle': '흩어진 탭 전체 보관 (하나의 작업으로 저장)',
  'context.rename': '이름 변경',
  'context.renameTitle': '이름 변경',
  'context.export': '내보내기',
  'context.exportTitle': 'Markdown으로 내보내기 (클립보드에 복사)',
  'context.archive': '보관',
  'context.archiveTitle': '보관 (탭 닫기 — 나중에 한 번에 복원 가능)',
  'context.delete': '삭제',
  'context.deleteTitle': '작업 삭제 (탭은 미분류로 반환)',
  'context.restore': '복원',
  'context.restoreTitle': '작업 복원',
  'context.archivedExportTitle': 'Markdown으로 내보내기 (클립보드에 복사)',
  'context.archivedDeleteTitle': '작업 삭제 (영구 삭제)',
  'context.dropHint': '탭을 여기에 놓으세요',

  // ── tabRow ─────────────────────────────────────────────────────────────────
  'tabRow.asleep': '절전',
  'tabRow.asleepTitle': '절전 중 · 클릭하여 다시 로드',
  'tabRow.asleepFullTitle': '절전 중 · 클릭하여 다시 로드\n{url}',
  'tabRow.duplicate': '중복',
  'tabRow.duplicateTitle': '중복 탭 (병합 시 닫힘)',
  'tabRow.duplicateKeep': '중복·유지',
  'tabRow.duplicateKeepTitle': '중복 그룹에서 가장 최근에 열린 탭 — 병합 시 유지됨',
  'tabRow.star': '즐겨찾기 표시',
  'tabRow.unstar': '즐겨찾기 해제',
  'tabRow.close': '탭 닫기',

  // ── search ──────────────────────────────────────────────────────────────────
  'search.ariaLabel': '검색',
  'search.placeholder': '열린 탭 또는 보관된 탭 검색…',
  'search.recentHeader': '최근 · ★ 즐겨찾기',
  'search.noResults': '결과 없음',
  'search.archivedSuffix': ' · 보관됨',
  'search.unclassified': '미분류',
  'search.hint': '↑↓ 탐색 · ↵ 이동 · ⌘↵ 작업 복원 · esc 닫기',

  // ── aiPlan ──────────────────────────────────────────────────────────────────
  'aiPlan.ariaLabel': 'AI 정리 제안',
  'aiPlan.header': '✦ AI 미분류 정리 · 확인 후 적용',
  'aiPlan.newGroups': '새 작업',
  'aiPlan.assign': '기존 작업에 병합',
  'aiPlan.cancelGroup': '그룹 취소',
  'aiPlan.cancelAssign': '취소',
  'aiPlan.removeTab': '제거',
  'aiPlan.removeTabTitle': '이 탭을 그룹화하지 않음',
  'aiPlan.taskFallback': '작업',
  'aiPlan.tabSource': '{source}에서',
  'aiPlan.cancel': '취소',
  'aiPlan.apply': '적용',

  // ── export ──────────────────────────────────────────────────────────────────
  'export.ariaLabel': '작업 내보내기',
  'export.title': '내보내기 · {name}',
  'export.jsonNote': '작업과 탭의 원시 데이터 백업 (마이그레이션 / 향후 가져오기용).',
  'export.close': '닫기',
  'export.download': '다운로드',
  'export.copy': '복사',
  'export.copied': '클립보드에 복사됨',
  'export.copyFailed': '복사 실패. 다시 시도해 주세요',
  'export.downloaded': '파일이 다운로드되었습니다',

  // ── stale ───────────────────────────────────────────────────────────────────
  'stale.header': '오래됨 · {days}일 동안 미방문',
  'stale.archiveAll': '모두 보관',
  'stale.archiveAllTitle': '오래된 탭 전체를 일괄 보관 (실행 취소 가능)',

  // ── stats ───────────────────────────────────────────────────────────────────
  'stats.tabs': '탭 {n}개',
  'stats.tasks': '작업 {n}개',
  'stats.stale': '오래됨 {n}개',
  'stats.staleTitle': '임계값을 초과하여 방문하지 않은 탭 (하단으로 내려감)',
  'stats.duplicates': '중복 {n}개 · 병합',
  'stats.duplicatesTitle': '중복 탭을 닫고 각 그룹에서 가장 최근에 활성화된 탭을 유지',

  // ── starred ─────────────────────────────────────────────────────────────────
  'starred.title': '즐겨찾기',

  // ── empty ───────────────────────────────────────────────────────────────────
  'empty.heading': '탭이 없습니다',
  'empty.body':
    '웹 페이지를 열면 여기에 표시됩니다. 관련 탭은 자동으로 작업으로 그룹화되며, 수동으로 작업을 만들어 정리할 수도 있습니다.',
  'empty.newTask': '+ 새 작업',
  'empty.searchHint': '⌘⇧K 검색',

  // ── undo ────────────────────────────────────────────────────────────────────
  'undo.label': '보관됨',
  'undo.action': '실행 취소',

  // ── domain ──────────────────────────────────────────────────────────────────
  'domain.sameSite': '동일 사이트',
  'domain.tabs': '· 탭 {n}개',
  'domain.cluster': '그룹화',
  'domain.ignore': '무시',

  // ── port ────────────────────────────────────────────────────────────────────
  'port.bind': '바인드',
  'port.bindAction': '바인드',
  'port.ignore': '무시',

  // ── draft ────────────────────────────────────────────────────────────────────
  'draft.defaultName': '새 작업',

  // ── time ─────────────────────────────────────────────────────────────────────
  'time.daysAgo': '{d}일 전',
};
