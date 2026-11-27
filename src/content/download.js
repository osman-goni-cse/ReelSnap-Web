// Download the reel that is on screen.
// - Plain file URL (e.g. Snapchat's CDN mp4): download the original file via chrome.downloads.
// - MSE stream (blob:/MediaSource, used by TikTok, Instagram, Facebook, YouTube): there is no file to fetch,
//   so record one play-through with MediaRecorder from video.captureStream().
(() => {
  const RS = globalThis.RS;

  const MAX_RECORD_MS = 3 * 60 * 1000;
  const MAX_MESSAGE_BYTES = 40 * 1024 * 1024; // larger recordings are saved with a page download instead

  const pickMime = () =>
    [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));

  const stamp = () => RS.sessionName();

  /** Direct file download. Returns true if the video had a plain http(s) source. */
  const downloadDirect = async (video, site) => {
    const url = video.currentSrc;
    if (!/^https?:/.test(url)) return false;
    const ext = (new URL(url).pathname.match(/\.(mp4|webm|mov|m4v)$/i)?.[1] || "mp4").toLowerCase();
    const res = await chrome.runtime.sendMessage({
      type: "rs:save",
      dataUrl: url,
      filename: `ReelSnap/downloads/${site.short}_${stamp()}.${ext}`,
    });
    if (!res?.ok) throw new Error(`Download failed: ${res?.error || "no response"}`);
    return true;
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const saveRecording = async (blob, filename) => {
    if (blob.size <= MAX_MESSAGE_BYTES) {
      const res = await chrome.runtime.sendMessage({ type: "rs:save", dataUrl: await blobToDataUrl(blob), filename });
      if (!res?.ok) throw new Error(`Download failed: ${res?.error || "no response"}`);
      return;
    }
    // Too big for extension messaging: let the page download it (lands in the default Downloads folder).
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.split("/").pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };

  /**
   * Record from the start of the video until it ends or loops, the user stops, or MAX_RECORD_MS passes.
   * onProgress(seconds, totalSeconds) is called about once a second.
   */
  const record = async (video, site, signal, onProgress) => {
    let stream;
    try {
      stream = video.captureStream();
    } catch (e) {
      if (e?.name === "SecurityError") throw new Error("This video is cross-origin and can't be recorded");
      throw e;
    }
    const mime = pickMime();
    if (!mime) throw new Error("This browser can't record video");
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (recorder.onstop = r));

    video.currentTime = 0;
    await video.play().catch(() => {});
    recorder.start(1000);

    const total = Number.isFinite(video.duration) ? video.duration : null;
    const startedAt = performance.now();
    let last = video.currentTime;
    let aborted = false;
    try {
      for (;;) {
        await RS.sleep(250, signal);
        const t = video.currentTime;
        const looped = t + 0.5 < last; // reels usually loop instead of firing "ended"
        last = t;
        if (video.ended || looped) break;
        if (RS.activeVideo() !== video) break; // user scrolled away
        if (performance.now() - startedAt > MAX_RECORD_MS) break;
        onProgress?.(Math.round(t), total && Math.round(total));
      }
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
      aborted = true; // Stop pressed: keep what was recorded
    } finally {
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
    }
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    if (!blob.size) throw new Error("Recording is empty");
    await saveRecording(blob, `ReelSnap/downloads/${site.short}_${stamp()}.${ext}`);
    return { aborted, seconds: Math.round((performance.now() - startedAt) / 1000), bytes: blob.size, ext };
  };

  /** Returns a short status message describing what was saved. */
  RS.downloadReel = async (site, signal, onProgress) => {
    const video = await RS.awaitPlaying(signal);
    if (await downloadDirect(video, site)) return "Downloaded the original video file";
    const r = await record(video, site, signal, onProgress);
    const mb = (r.bytes / 1048576).toFixed(1);
    return `${r.aborted ? "Stopped early, saved" : "Saved"} ${r.seconds}s recording (${r.ext.toUpperCase()}, ${mb} MB)`;
  };
})();
