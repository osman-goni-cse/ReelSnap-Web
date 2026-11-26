// Finding the reel that is currently on screen, and detecting when it changes.
(() => {
  const RS = globalThis.RS;

  const visibleArea = (el) => {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  };

  /** The most visible <video> on screen, preferring one that is playing. */
  RS.activeVideo = () => {
    let best = null;
    let bestScore = 0;
    for (const v of document.querySelectorAll("video")) {
      const area = visibleArea(v);
      if (area < 100 * 100) continue;
      const score = area * (v.paused ? 1 : 3) * (v.readyState >= 2 ? 2 : 1);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  };

  /**
   * Wait until the active video has a decodable frame and is playing.
   * After the timeout, a paused-but-loaded video is accepted (the user may have paused it).
   */
  RS.awaitPlaying = async (signal, timeoutMs = 8000) => {
    const start = performance.now();
    for (;;) {
      const v = document.hidden ? null : RS.activeVideo();
      const loaded = v && v.readyState >= 2 && v.videoWidth > 0;
      if (loaded && !v.paused) return v;
      if (loaded && performance.now() - start > timeoutMs) return v;
      if (!v && performance.now() - start > timeoutMs * 2) throw new Error("No video found on the page");
      await RS.sleep(200, signal);
    }
  };

  RS.videoSignature = () => {
    const v = RS.activeVideo();
    return { el: v, src: v?.currentSrc || "" };
  };

  RS.videoChanged = (sig) => {
    const v = RS.activeVideo();
    return !!v && (v !== sig.el || (v.currentSrc || "") !== sig.src);
  };
})();
