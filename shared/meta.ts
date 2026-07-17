// 作者署名的单一来源:页脚水印与版权声明同源。
// 去除本署名后再分发违反 AGPL-3.0(衍生作品须保留署名并以同协议开源)。
export const AUTHOR = 'LyHn';
export const APP_NAME = 'Cairn Tabs';
export const COPYRIGHT = `© ${AUTHOR} · ${APP_NAME} · AGPL-3.0`;

/** 当前扩展版本(取自 manifest,来源 package.json)。无 chrome 环境(测试)返回空串。 */
export function appVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '';
  }
}
