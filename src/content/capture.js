// Frame capture: draw the <video> onto a canvas at native resolution (clean frame, no UI).
// Fallback when the canvas is tainted (cross-origin video without CORS): screenshot the tab
// and crop to the video's on-screen rectangle.
(() => {
  const RS = globalThis.RS;

  // chrome.tabs.captureVisibleTab is limited to ~2 calls per second.
  const MIN_TAB_CAPTURE_INTERVAL_MS = 600;
  let lastTabCaptureAt = 0;

  const dataUrlToBlob = (dataUrl) => {
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:(.*?);/)[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const fromVideo = async (video, mime) => {
    const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.convertToBlob({ type: mime, quality: 0.92 }); // throws SecurityError if tainted
  };

  const fromTab = async (video, mime, signal) => {
    const wait = lastTabCaptureAt + MIN_TAB_CAPTURE_INTERVAL_MS - Date.now();
    if (wait > 0) await RS.sleep(wait, signal);
    lastTabCaptureAt = Date.now();
    const res = await chrome.runtime.sendMessage({ type: "rs:captureTab" });
    if (!res?.ok) {
      throw new Error(
        `Tab capture failed (${res?.error || "no response"}). Open the ReelSnap popup on this tab once, then retry.`,
      );
    }
    const img = await createImageBitmap(dataUrlToBlob(res.dataUrl));
    const scale = img.width / innerWidth;
    const r = video.getBoundingClientRect();
    const sx = Math.max(0, Math.round(r.left * scale));
    const sy = Math.max(0, Math.round(r.top * scale));
    const sw = Math.min(img.width - sx, Math.round(r.width * scale));
    const sh = Math.min(img.height - sy, Math.round(r.height * scale));
    const canvas = new OffscreenCanvas(sw, sh);
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    img.close();
    return canvas.convertToBlob({ type: mime, quality: 0.92 });
  };

  /** Returns { blob, method: "video" | "tab" }. */
  RS.captureFrame = async (video, format, signal) => {
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    try {
      return { blob: await fromVideo(video, mime), method: "video" };
    } catch (e) {
      if (e?.name !== "SecurityError") throw e;
      RS.log("Canvas tainted, falling back to tab capture");
    }
    return { blob: await fromTab(video, mime, signal), method: "tab" };
  };

  /** Save through the background's chrome.downloads (Downloads/<filename>). */
  RS.saveBlob = async (blob, filename) => {
    const res = await chrome.runtime.sendMessage({
      type: "rs:save",
      dataUrl: await blobToDataUrl(blob),
      filename,
    });
    if (!res?.ok) throw new Error(`Download failed: ${res?.error || "no response"}`);
  };
})();
