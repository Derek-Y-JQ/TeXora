export const PROJECT_HOME = 'https://github.com/Derek-Y-JQ/TeXora';

// All renderer entry points use the same preload API and surface launch failures.
export async function openExternalLink(api, url, notify) {
  try {
    const result = await api.openExternal(url);
    if (!result?.ok) throw new Error(result?.error || '系统未能打开浏览器');
    return true;
  } catch (error) {
    notify({ type: 'warn', title: '无法打开链接', body: `${error.message || error}。请在浏览器中打开：${url}`, timeout: 10000 });
    return false;
  }
}

export function openUpdateDownload(api, update, notify) {
  return openExternalLink(api, update.asset?.url || update.url || `${PROJECT_HOME}/releases/latest`, notify);
}
