/**
 * New Tab Blocker - Background Service Worker
 *
 * blocked_domains.json をデフォルトとして読み込み、
 * chrome.storage.local に保存されたドメインリストでタブをブロックする。
 */

// ── 初期化 ──────────────────────────────────────────────
// 拡張機能インストール時に blocked_domains.json を読み込んで storage に保存
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("blockedDomains");
  if (!existing.blockedDomains || existing.blockedDomains.length === 0) {
    await loadDefaultDomains();
  }
  console.log("[NewTabBlocker] 初期化完了");
});

/**
 * blocked_domains.json からデフォルトドメインを読み込む
 */
async function loadDefaultDomains() {
  try {
    const url = chrome.runtime.getURL("blocked_domains.json");
    const res = await fetch(url);
    const data = await res.json();
    const domains = data.domains || [];
    await chrome.storage.local.set({ blockedDomains: domains });
    console.log("[NewTabBlocker] デフォルトドメイン読み込み:", domains);
  } catch (e) {
    console.error("[NewTabBlocker] デフォルトドメイン読み込み失敗:", e);
    await chrome.storage.local.set({ blockedDomains: [] });
  }
}

// ── ドメイン取得ヘルパー ────────────────────────────────
async function getBlockedDomains() {
  const data = await chrome.storage.local.get("blockedDomains");
  return data.blockedDomains || [];
}

/**
 * URL がブロック対象かチェック（部分一致: サブドメインも対象）
 */
function isBlocked(urlString, domains) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    return domains.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

// ── タブ監視 ────────────────────────────────────────────

// 1) tabs.onCreated — タブ生成直後（pendingUrl で最速検知）
chrome.tabs.onCreated.addListener(async (tab) => {
  const targetUrl = tab.pendingUrl || tab.url;
  if (!targetUrl) return;

  const domains = await getBlockedDomains();
  if (isBlocked(targetUrl, domains)) {
    chrome.tabs.remove(tab.id).catch(() => {});
    console.log("[NewTabBlocker] onCreated でブロック:", targetUrl);
  }
});

// 2) tabs.onUpdated — URL 変更時（リダイレクト対策）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (!changeInfo.url) return;

  const domains = await getBlockedDomains();
  if (isBlocked(changeInfo.url, domains)) {
    chrome.tabs.remove(tabId).catch(() => {});
    console.log("[NewTabBlocker] onUpdated でブロック:", changeInfo.url);
  }
});

// 3) webNavigation（オプション: より早くキャッチ）
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // メインフレームのみ対象
    if (details.frameId !== 0) return;

    const domains = await getBlockedDomains();
    if (isBlocked(details.url, domains)) {
      chrome.tabs.remove(details.tabId).catch(() => {});
      console.log("[NewTabBlocker] onBeforeNavigate でブロック:", details.url);
    }
  });
}
