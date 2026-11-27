// ReelSnap Web popup: settings + controls for the content script running in the active tab.
const DEFAULTS = { waitMs: 2000, frames: 1, gapMs: 2000, jitter: true, maxReels: 0, maxMinutes: 0, format: "png" };
const SITES = [
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)youtube\.com$/, "YouTube Shorts"],
];

const $ = (id) => document.getElementById(id);
const form = $("settings");
let tabId = null;
let reachable = false;

function renderStatus(s) {
  const running = s && ["running", "burst", "download"].includes(s.state);
  $("loop").hidden = $("burst").hidden = $("download").hidden = running;
  $("stop").hidden = !running;
  $("loop").disabled = $("burst").disabled = $("download").disabled = !reachable;
  if (!reachable) return;
  const title = { running: "Looping…", burst: "Burst…", download: "Downloading…" }[s.state] || "Idle";
  const counts = s.session ? `Session ${s.session}: ${s.reels} reels, ${s.frames} frames` : "Press Start loop or Burst";
  $("status").innerHTML = "";
  const b = document.createElement("b");
  b.textContent = title;
  const c = document.createElement("small");
  c.textContent = counts;
  $("status").append(b, c);
  if (s.message) {
    const m = document.createElement("small");
    m.textContent = ` · ${s.message}`;
    $("status").append(m);
  }
}

async function loadForm() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = s[el.name];
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = el.dataset.scale ? v / Number(el.dataset.scale) : v;
  }
}

form.addEventListener("change", (e) => {
  const el = e.target;
  let v;
  if (el.type === "checkbox") v = el.checked;
  else if (el.type === "number") v = Math.max(0, Number(el.value) || 0) * (Number(el.dataset.scale) || 1);
  else v = el.value;
  if (el.name === "frames") v = Math.min(20, Math.max(1, Math.round(v)));
  chrome.storage.sync.set({ [el.name]: v });
});

async function send(msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    return null;
  }
}

$("loop").onclick = async () => showResult(await send({ type: "rs:start", mode: "loop" }));
$("burst").onclick = async () => showResult(await send({ type: "rs:start", mode: "burst" }));
$("download").onclick = async () => showResult(await send({ type: "rs:start", mode: "download" }));
$("stop").onclick = () => send({ type: "rs:stop" });

function showResult(res) {
  if (res && !res.ok) $("status").textContent = res.error;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "rs:status" && sender.tab?.id === tabId) renderStatus(msg.status);
});

(async () => {
  await loadForm();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  let host = "";
  try {
    host = new URL(tab.url).hostname;
  } catch {}
  const site = SITES.find(([re]) => re.test(host));
  $("site").textContent = site ? site[1] : "Unsupported";
  $("site").classList.toggle("ok", !!site);

  if (!site) {
    $("status").textContent = "Open TikTok, Instagram, Facebook, Snapchat Spotlight or YouTube Shorts.";
    renderStatus(null);
    return;
  }
  const s = await send({ type: "rs:getStatus" });
  reachable = !!s;
  if (!reachable) $("status").textContent = "Reload this page once so ReelSnap can attach to it.";
  renderStatus(s || { state: "idle" });
})();
