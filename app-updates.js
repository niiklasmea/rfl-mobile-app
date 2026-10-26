(() => {
  "use strict";
  const allowedActions = new Set(["home", "calendar", "about", "apply", "settings"]);
  let account = "guest";
  let entries = [];
  let polling = false;
  const seenByAccount = new Map();
  function seen() {
    if (!seenByAccount.has(account)) {
      let ids = [];
      try { const saved = JSON.parse(localStorage.getItem(`rfl-news-read-v1:${account}`) || "[]"); if (Array.isArray(saved)) ids = saved; } catch {}
      seenByAccount.set(account, new Set(ids.filter(id => typeof id === "string").slice(-100)));
    }
    return seenByAccount.get(account);
  }
  function notify() { window.dispatchEvent(new Event("rfl:news-changed")); }
  function accept(payload) {
    if (payload?.schemaVersion !== 1 || !Array.isArray(payload.items)) return;
    const next = payload.items.slice(0, 30).filter(item => item && typeof item.id === "string" && item.id.length <= 100
      && Number.isFinite(Date.parse(item.publishedAt)) && typeof item.title?.de === "string" && typeof item.body?.de === "string")
      .map(item => ({ id: item.id, publishedAt: item.publishedAt,
        title: { de: item.title.de.slice(0, 160), en: String(item.title.en || item.title.de).slice(0, 160) },
        body: { de: item.body.de.slice(0, 500), en: String(item.body.en || item.body.de).slice(0, 500) },
        action: allowedActions.has(item.action) ? item.action : "home" }));
    entries = [...new Map(next.map(item => [item.id, item])).values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    notify();
  }
  window.RflUpdates = {
    getItems: () => entries.map(item => ({ ...item, unread: !seen().has(item.id) })),
    getUnreadCount: () => entries.filter(item => !seen().has(item.id)).length,
    setAccount(id) { account = id || "guest"; notify(); },
    markAllRead() {
      const ids = seen(); entries.forEach(item => ids.add(item.id));
      try { localStorage.setItem(`rfl-news-read-v1:${account}`, JSON.stringify([...ids].slice(-100))); } catch {}
      notify();
    },
    refresh: refresh
  };
  accept(window.RFL_NEWS_SEED);

  async function refresh() {
    if (polling || document.hidden || navigator.onLine === false) return;
    polling = true;
    try {
      const url = new URL("release-notes.json", "https://niiklasmea.github.io/rfl-mobile-app/");
      // Local development uses its own fixtures; installed Windows clients read the shared public feed.
      const target = /^https?:$/.test(location.protocol) ? new URL("./release-notes.json", location.href) : url;
      const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(12000), credentials: "omit" });
      if (!response.ok) return;
      const content = await response.text();
      if (content.length <= 100000) accept(JSON.parse(content));
    } catch { /* The bundled news remain available offline. */ }
    finally { polling = false; }
  }
  void refresh();
  window.setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  window.addEventListener("online", refresh);
})();
