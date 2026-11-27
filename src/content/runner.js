// Loop + burst state machine. Runs in the page's content script so it is tied to the visible tab.
(() => {
  const RS = globalThis.RS;
  if (RS.runnerInstalled) return;
  RS.runnerInstalled = true;

  const ADVANCE_TIMEOUT_MS = 1500;
  const MAX_CONSECUTIVE_FAILURES = 3;

  let controller = null;
  let preferredStrategy = null; // last strategy that worked on this page
  let status = { state: "idle", site: RS.detectSite()?.name || null, session: null, reels: 0, frames: 0, message: null };

  const emit = (patch) => {
    status = { ...status, ...patch };
    chrome.runtime.sendMessage({ type: "rs:status", status }).catch(() => {});
  };

  // ---- next-reel strategies ----
  const scrollableAncestor = (el) => {
    for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 10) return n;
    }
    return document.scrollingElement || document.documentElement;
  };

  const strategies = {
    scroll: () => {
      const target = scrollableAncestor(RS.activeVideo());
      const isRoot = target === document.scrollingElement || target === document.documentElement;
      const h = isRoot ? innerHeight : target.clientHeight;
      target.scrollBy({ top: h, behavior: "smooth" });
    },
    key: () => {
      const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
      const init = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent("keydown", init));
      target.dispatchEvent(new KeyboardEvent("keyup", init));
    },
    button: (site) => {
      const btn = RS.findNextButton(site);
      if (!btn) return false;
      btn.click();
    },
  };

  const waitForChange = async (sig, signal) => {
    const start = performance.now();
    while (performance.now() - start < ADVANCE_TIMEOUT_MS) {
      await RS.sleep(100, signal);
      if (RS.videoChanged(sig)) return true;
    }
    return false;
  };

  const nextReel = async (site, signal) => {
    const order = preferredStrategy ? [preferredStrategy, ...site.order.filter((s) => s !== preferredStrategy)] : site.order;
    for (const name of order) {
      const sig = RS.videoSignature();
      if (strategies[name](site) === false) continue;
      if (await waitForChange(sig, signal)) {
        if (preferredStrategy !== name) RS.log(`Advance strategy for ${site.id}: ${name}`);
        preferredStrategy = name;
        return true;
      }
    }
    return false;
  };

  /** A visible modal dialog covering the middle of the screen (e.g. Instagram's logged-out login wall). */
  const blockingDialog = () =>
    [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 200 && r.height > 150 && r.left < innerWidth / 2 && r.right > innerWidth / 2 &&
        r.top < innerHeight / 2 && r.bottom > innerHeight / 2 && getComputedStyle(d).visibility !== "hidden";
    });

  // ---- capture block ----
  let consecutiveFailures = 0;

  const captureBlock = async (site, settings, session, reelNo, signal) => {
    const ext = settings.format === "jpeg" ? "jpg" : "png";
    for (let i = 1; i <= settings.frames; i++) {
      try {
        let video = await RS.awaitPlaying(signal);
        // Skip black frames shown while the next reel is still loading (up to ~1.5 s).
        for (let k = 0; k < 5 && RS.isBlankFrame(video); k++) {
          await RS.sleep(300, signal);
          video = await RS.awaitPlaying(signal);
        }
        const { blob, method } = await RS.captureFrame(video, settings.format, signal);
        const filename = `ReelSnap/${session}/${site.short}_r${RS.pad(reelNo, 4)}_s${RS.pad(i, 2)}.${ext}`;
        await RS.saveBlob(blob, filename);
        consecutiveFailures = 0;
        emit({ frames: status.frames + 1, message: method === "tab" ? "Using tab-capture fallback" : null });
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        RS.log("Capture failed", e);
        emit({ message: e.message });
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw new Error(`Stopped after repeated errors: ${e.message}`);
      }
      if (i < settings.frames) await RS.sleep(RS.jitter(settings.gapMs, settings.jitter), signal);
    }
  };

  // ---- modes ----
  const runBurst = async (site, signal) => {
    const settings = await RS.loadSettings();
    const session = RS.sessionName();
    emit({ state: "burst", session, reels: 0, frames: 0, message: null });
    await captureBlock(site, settings, session, 1, signal);
    return "Burst done";
  };

  const runLoop = async (site, signal) => {
    const session = RS.sessionName();
    const startedAt = Date.now();
    emit({ state: "running", session, reels: 0, frames: 0, message: null });
    for (let reel = 1; ; reel++) {
      const settings = await RS.loadSettings(); // picks up popup changes live
      await RS.awaitPlaying(signal);
      await RS.sleep(RS.jitter(settings.waitMs, settings.jitter), signal);
      await captureBlock(site, settings, session, reel, signal);
      if (!(await nextReel(site, signal))) {
        throw new Error(
          blockingDialog()
            ? "A dialog (e.g. a login prompt) is blocking the page. Close it or log in, then start again"
            : "Couldn't advance to the next reel on this page",
        );
      }
      emit({ reels: reel });
      if (settings.maxReels > 0 && reel >= settings.maxReels) return `Reel limit reached (${reel})`;
      if (settings.maxMinutes > 0 && Date.now() - startedAt >= settings.maxMinutes * 60000) return "Time limit reached";
    }
  };

  const runDownload = async (site, signal) => {
    emit({ state: "download", session: null, reels: 0, frames: 0, message: "Recording…" });
    return RS.downloadReel(site, signal, (t, total) =>
      emit({ message: total ? `Recording… ${t}s / ${total}s` : `Recording… ${t}s` }),
    );
  };

  const start = (mode) => {
    const site = RS.detectSite();
    if (!site) return { ok: false, error: "Unsupported site" };
    if (controller) return { ok: false, error: "Already running" };
    controller = new AbortController();
    const { signal } = controller;
    consecutiveFailures = 0;
    ({ burst: runBurst, download: runDownload }[mode] || runLoop)(site, signal)
      .then((msg) => emit({ state: "idle", message: msg }))
      .catch((e) => emit({ state: "idle", message: e?.name === "AbortError" ? "Stopped" : e.message }))
      .finally(() => {
        controller = null;
      });
    return { ok: true };
  };

  const stop = () => {
    controller?.abort();
    return { ok: true };
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "rs:start":
        sendResponse(start(msg.mode));
        break;
      case "rs:stop":
        sendResponse(stop());
        break;
      case "rs:getStatus":
        sendResponse(status);
        break;
    }
  });

  addEventListener("pagehide", stop);
})();
