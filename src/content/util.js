// Shared namespace for ReelSnap Web content scripts (classic scripts, loaded in manifest order).
(() => {
  const RS = (globalThis.RS = globalThis.RS || {});

  RS.DEFAULTS = Object.freeze({
    waitMs: 2000,
    frames: 1,
    gapMs: 2000,
    jitter: true,
    maxReels: 0, // 0 = unlimited
    maxMinutes: 0, // 0 = unlimited
    format: "png", // "png" | "jpeg"
  });

  RS.log = (...args) => console.debug("[ReelSnap]", ...args);

  /** Abortable sleep. Rejects with AbortError when the signal fires. */
  RS.sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Stopped", "AbortError"));
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Stopped", "AbortError"));
        },
        { once: true },
      );
    });

  /** ±20% random variation when enabled. */
  RS.jitter = (ms, on) => (on && ms > 0 ? Math.round(ms * (0.8 + Math.random() * 0.4)) : ms);

  RS.pad = (n, width) => String(n).padStart(width, "0");

  RS.sessionName = () => {
    const d = new Date();
    const p = (n) => RS.pad(n, 2);
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  RS.loadSettings = async () => ({ ...RS.DEFAULTS, ...(await chrome.storage.sync.get(RS.DEFAULTS)) });
})();
