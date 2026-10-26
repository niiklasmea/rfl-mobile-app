(() => {
  "use strict";
  const intro = document.getElementById("appIntro");
  if (!intro) return;
  let started = false;
  let finishing = false;
  let visibleTime = 0;
  let visibleSince = 0;
  let timer;
  let unsubscribe;
  let desktopVisible = false;
  const hasDesktopBridge = Boolean(window.appSettings?.onAppVisible && window.appSettings?.isWindowVisible);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reducedMotion ? 1800 : 3600;
  intro.classList.add("pending");

  function finish() {
    if (finishing) return;
    finishing = true;
    clearTimeout(timer);
    intro.classList.add("exit");
    intro.setAttribute("aria-hidden", "true");
    document.removeEventListener("visibilitychange", visibilityChanged);
    unsubscribe?.();
    setTimeout(() => intro.remove(), reducedMotion ? 80 : 760);
  }

  function visibilityChanged() {
    if (finishing) return;
    if (!started) {
      if (!document.hidden && (!hasDesktopBridge || desktopVisible)) start();
      return;
    }
    if (document.hidden) {
      visibleTime += Math.max(0, performance.now() - visibleSince);
      clearTimeout(timer);
    } else {
      visibleSince = performance.now();
      timer = setTimeout(finish, Math.max(0, duration - visibleTime));
    }
  }

  function start() {
    if (started || finishing || document.hidden) return;
    started = true;
    intro.classList.remove("pending");
    intro.classList.toggle("reduced-motion", reducedMotion);
    intro.classList.add("show");
    intro.setAttribute("aria-hidden", "false");
    visibleSince = performance.now();
    timer = setTimeout(finish, duration);
  }

  document.getElementById("skipIntro")?.addEventListener("click", finish);
  document.addEventListener("visibilitychange", visibilityChanged);
  if (hasDesktopBridge) {
    unsubscribe = window.appSettings.onAppVisible(() => { desktopVisible = true; start(); });
    window.appSettings.isWindowVisible().then(visible => { if (visible) { desktopVisible = true; start(); } }).catch(start);
  } else {
    // Browser/PWA startup starts when the document is actually visible, independently of account scripts.
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", start);
    window.addEventListener("pageshow", start, { once: true });
    window.addEventListener("focus", start, { once: true });
  }
})();
