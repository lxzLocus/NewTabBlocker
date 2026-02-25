/**
 * New Tab Blocker - Popup Script
 *
 * chrome.storage.local の "blockedDomains" 配列を管理する。
 * JSON / TXT ファイルからのインポートにも対応。
 */

const domainInput = document.getElementById("domainInput");
const addBtn = document.getElementById("addBtn");
const domainList = document.getElementById("domainList");
const fileInput = document.getElementById("fileInput");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");

// ── 初期表示 ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", renderList);

// ── ドメイン追加 ─────────────────────────────────────
addBtn.addEventListener("click", async () => {
  const raw = domainInput.value.trim().toLowerCase();
  if (!raw) return;

  // URL が貼られても hostname だけ取り出す
  const domain = extractDomain(raw);
  if (!domain) {
    showStatus("無効なドメインです", true);
    return;
  }

  const domains = await getDomains();
  if (domains.includes(domain)) {
    showStatus("すでに登録済みです", true);
    return;
  }

  domains.push(domain);
  await saveDomains(domains);
  domainInput.value = "";
  showStatus(`${domain} を追加しました`);
  renderList();
});

domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

// ── ファイルインポート ───────────────────────────────
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  let imported = [];

  if (file.name.endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      // { "domains": [...] } 形式 or 配列直接
      imported = Array.isArray(data) ? data : data.domains || [];
    } catch {
      showStatus("JSON の解析に失敗しました", true);
      return;
    }
  } else {
    // TXT: 1行1ドメイン（空行・#コメント行をスキップ）
    imported = text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"));
  }

  // ドメイン形式に正規化
  imported = imported.map(extractDomain).filter(Boolean);

  if (imported.length === 0) {
    showStatus("インポート可能なドメインがありませんでした", true);
    return;
  }

  const domains = await getDomains();
  let addedCount = 0;
  for (const d of imported) {
    if (!domains.includes(d)) {
      domains.push(d);
      addedCount++;
    }
  }

  await saveDomains(domains);
  showStatus(`${addedCount} 件追加（${imported.length - addedCount} 件は重複）`);
  renderList();

  // 同じファイルを再選択可能にする
  fileInput.value = "";
});

// ── エクスポート ─────────────────────────────────────
exportBtn.addEventListener("click", async () => {
  const domains = await getDomains();
  const blob = new Blob([JSON.stringify({ domains }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "blocked_domains.json";
  a.click();
  URL.revokeObjectURL(url);
});

// ── 全削除 ───────────────────────────────────────────
clearBtn.addEventListener("click", async () => {
  if (!confirm("すべてのブロックドメインを削除しますか？")) return;
  await saveDomains([]);
  showStatus("すべて削除しました");
  renderList();
});

// ── 一覧描画 ─────────────────────────────────────────
async function renderList() {
  const domains = await getDomains();
  domainList.innerHTML = "";

  if (domains.length === 0) {
    const li = document.createElement("li");
    li.textContent = "ブロック対象なし";
    li.style.color = "#6c7086";
    li.style.justifyContent = "center";
    domainList.appendChild(li);
    return;
  }

  for (const domain of domains) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "domain-text";
    span.textContent = domain;

    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "削除";
    btn.addEventListener("click", async () => {
      const updated = (await getDomains()).filter((d) => d !== domain);
      await saveDomains(updated);
      renderList();
    });

    li.appendChild(span);
    li.appendChild(btn);
    domainList.appendChild(li);
  }
}

// ── ヘルパー ─────────────────────────────────────────

/** storage からドメイン配列を取得 */
async function getDomains() {
  const data = await chrome.storage.local.get("blockedDomains");
  return data.blockedDomains || [];
}

/** storage にドメイン配列を保存 */
async function saveDomains(domains) {
  await chrome.storage.local.set({ blockedDomains: domains });
}

/**
 * 入力文字列からドメイン名だけを抽出
 * - URL が来たら hostname を取り出す
 * - 生ドメインならそのまま返す
 */
function extractDomain(input) {
  let s = input.trim().toLowerCase();
  if (!s) return null;

  // http(s):// 付きなら URL として解析
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      return new URL(s).hostname;
    } catch {
      return null;
    }
  }

  // プロトコル無しでも / が含まれていれば URL 扱い
  if (s.includes("/")) {
    try {
      return new URL("https://" + s).hostname;
    } catch {
      return null;
    }
  }

  // ドメイン形式の簡易チェック（ドット含む英数字+ハイフン）
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) {
    return s;
  }

  return null;
}

/** ステータスメッセージを表示（3秒後に非表示） */
function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (isError ? " error" : "");
  statusEl.hidden = false;
  setTimeout(() => {
    statusEl.hidden = true;
  }, 3000);
}
