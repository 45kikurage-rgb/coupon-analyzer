(() => {
  "use strict";

  const MAX_URLS = 100;
  const STABLE_CONCURRENCY = 4;
  const FAST_CONCURRENCY = 10;
  const FAST_FALLBACK_CONCURRENCY = 6;
  const FAMILY_CONCURRENCY = 4;
  const RETRY_DELAYS = [1500, 4000];

  const input = document.querySelector("#input");
  const stableStart = document.querySelector("#stableStart");
  const fastStart = document.querySelector("#fastStart");
  const statusEl = document.querySelector("#status");
  const counter = document.querySelector("#counter");
  const familyNotice = document.querySelector("#familyNotice");
  const progress = document.querySelector("#progress");
  const resultSection = document.querySelector("#result");
  const summary = document.querySelector("#summary");
  const grid = document.querySelector("#grid");
  const zipAll = document.querySelector("#zipAll");
  const zipUnique = document.querySelector("#zipUnique");
  const retryFailed = document.querySelector("#retryFailed");
  const clearButton = document.querySelector("#clear");
  const zipStatus = document.querySelector("#zipStatus");

  let state = { urls: [], results: [], cards: [], mode: null };
  let running = false;

  function extract(text) {
    const found = text.match(/https:\/\/[^\s<>"']+/gi) || [];
    const supported = [];
    for (const raw of found) {
      const value = raw.replace(/[.,、。\])}]+$/, "");
      try {
        const url = new URL(value);
        const seven = url.hostname === "coupon.sej.co.jp" && url.pathname === "/order/cpnsp_03.do" && Boolean(url.searchParams.get("hansoku_id"));
        const family = url.hostname === "ncpfa.famima.com" && url.pathname === "/prd/ebcweb" &&
          Boolean(url.searchParams.get("eKey")) && Boolean(url.searchParams.get("cpNo")) && Boolean(url.searchParams.get("gyNo"));
        if (seven || family) supported.push(url.toString());
      } catch {
        // 入力途中は無視し、Workerでも再検証します。
      }
      if (supported.length >= MAX_URLS) break;
    }
    return supported;
  }

  function isFamily(url) {
    try { return new URL(url).hostname === "ncpfa.famima.com"; }
    catch { return false; }
  }

  function setButtonsDisabled(disabled) {
    stableStart.disabled = disabled;
    fastStart.disabled = disabled;
    retryFailed.disabled = disabled;
  }

  function updateCounter() {
    const urls = extract(input.value);
    counter.textContent = `検出：${urls.length} / ${MAX_URLS}件（同じURLも数えます）`;
    familyNotice.classList.toggle("hidden", !urls.some(isFamily));
    stableStart.classList.toggle("ready", urls.length > 0);
    fastStart.classList.toggle("ready", urls.length > 0);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function releaseResult(item) {
    if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
  }

  function resetResults() {
    state.results.forEach(releaseResult);
    state = { urls: [], results: [], cards: [], mode: null };
    grid.innerHTML = "";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function ensurePng(item) {
    if (item.pngBlob) return item.pngBlob;
    if (item.mimeType === "image/png") {
      item.pngBlob = item.sourceBlob;
      return item.pngBlob;
    }
    const sourceUrl = URL.createObjectURL(item.sourceBlob);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("画像変換に失敗しました。"));
        image.src = sourceUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 860;
      canvas.height = 1864;
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      item.pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG変換に失敗しました。")), "image/png");
      });
      return item.pngBlob;
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function createSuccess(payload, index, processingMode, retries) {
    const sourceBytes = base64ToBytes(payload.base64);
    const sourceBlob = new Blob([sourceBytes], { type:payload.mimeType || "image/svg+xml" });
    const site = payload.site === "familymart" ? "familymart" : "seven";
    return {
      ...payload,
      base64: undefined,
      index,
      ok: true,
      retries,
      sourceBlob,
      processingMode,
      duplicate: false,
      name: `${site}-coupon-${String(index + 1).padStart(3, "0")}${payload.barcode ? `-${payload.barcode}` : ""}.png`,
    };
  }

  async function ensureObjectUrl(item) {
    if (item.objectUrl) return item.objectUrl;
    const previewBlob = item.processingMode === "stable" ? await ensurePng(item) : item.sourceBlob;
    item.objectUrl = URL.createObjectURL(previewBlob);
    return item.objectUrl;
  }

  async function saveImage(item) {
    const blob = await ensurePng(item);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function renderItem(index) {
    const item = state.results[index];
    const card = state.cards[index];
    const number = String(index + 1).padStart(3, "0");
    if (!item) {
      card.className = "item";
      card.innerHTML = `<div class="meta"><strong>${number} 処理待ち</strong></div>`;
      return;
    }
    if (!item.ok) {
      card.className = "item";
      card.innerHTML = `<div class="meta error"><strong>${number} 失敗</strong>${escapeHtml(item.error || "撮影に失敗しました。")}<div>自動再試行：${item.retries || 0}回</div></div>`;
      return;
    }
    const objectUrl = await ensureObjectUrl(item);
    const duplicate = Number.isInteger(item.duplicateOf);
    card.className = `item${duplicate ? " duplicate" : ""}`;
    let badge = "";
    if (duplicate) badge = `<span class="badge badgeDuplicate">⚠ ${String(item.duplicateOf + 1).padStart(3, "0")}番と重複</span>`;
    else if (!item.barcode) badge = '<span class="badge badgeUnknown">番号未取得・重複判定なし</span>';
    card.innerHTML = `
      <img src="${objectUrl}" loading="lazy" decoding="async" alt="クーポン ${index + 1}">
      <div class="meta">
        ${badge}
        <strong>${number} ${escapeHtml(item.siteLabel || "クーポン")}・完了</strong>
        <div class="barcode">バーコード番号：${item.barcode ? escapeHtml(item.barcode) : "未取得"}</div>
        <button type="button" class="saveButton secondary">この画像を保存</button>
      </div>`;
    card.querySelector(".saveButton").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await saveImage(item); }
      finally { button.disabled = false; }
    });
  }

  async function recalculateDuplicates() {
    const seen = new Map();
    for (const item of state.results) {
      if (!item?.ok) continue;
      item.duplicate = false;
      delete item.duplicateOf;
      if (!item.barcode) continue;
      const key = `${item.site}:${item.barcode}`;
      if (seen.has(key)) {
        item.duplicate = true;
        item.duplicateOf = seen.get(key);
      } else {
        seen.set(key, item.index);
      }
    }
    await Promise.all(state.results.map((item, index) => item?.ok ? renderItem(index) : undefined));
  }

  function updateSummary(mode, seconds) {
    const successes = state.results.filter((item) => item?.ok);
    const failures = state.results.filter((item) => item && !item.ok);
    const duplicateCount = successes.filter((item) => item.duplicate).length;
    const retryCount = state.results.reduce((sum, item) => sum + (item?.retries || 0), 0);
    summary.classList.remove("hidden");
    const modeLabel = mode === "fast" ? "高速処理" : "安定処理";
    summary.innerHTML = `<strong>${modeLabel}</strong>　成功 ${successes.length}件　失敗 ${failures.length}件　重複 ${duplicateCount}件　自動再試行 ${retryCount}回　約${seconds}秒`;
    retryFailed.classList.toggle("hidden", failures.length === 0);
    zipAll.disabled = successes.length === 0;
    zipUnique.disabled = successes.filter((item) => !item.duplicate).length === 0;
  }

  function createSemaphore(limit) {
    let active = 0;
    const waiting = [];
    const acquire = () => new Promise((resolve) => {
      const enter = () => {
        active += 1;
        resolve(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < limit) enter(); else waiting.push(enter);
    });
    return { acquire };
  }

  async function requestWithRetry(url, mode, familyGate, onTransient) {
    let retries = 0;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      let release = null;
      try {
        if (mode === "fast" && isFamily(url)) release = await familyGate.acquire();
        const response = await fetch("/api/capture-one", {
          method: "POST",
          headers: { "content-type":"application/json" },
          body: JSON.stringify({ url, mode }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.error || `HTTP ${response.status}`);
          error.retryable = payload.retryable === true || response.status >= 500 || response.status === 429;
          throw error;
        }
        return { payload, retries };
      } catch (error) {
        release?.();
        release = null;
        const retryable = error?.retryable === true || error instanceof TypeError;
        if (!retryable || attempt >= RETRY_DELAYS.length) {
          error.retries = retries;
          throw error;
        }
        retries += 1;
        onTransient();
        await sleep(RETRY_DELAYS[attempt]);
      } finally {
        release?.();
      }
    }
    throw new Error("撮影に失敗しました。");
  }

  async function process(mode, onlyFailed = false) {
    if (running) return;
    const urls = onlyFailed ? state.urls : extract(input.value);
    if (!urls.length) {
      statusEl.textContent = "対応するセブン・ファミリーマートのURLが見つかりません。";
      statusEl.className = "status error";
      return;
    }

    running = true;
    setButtonsDisabled(true);
    zipAll.disabled = true;
    zipUnique.disabled = true;
    zipStatus.textContent = "";
    summary.classList.add("hidden");
    retryFailed.classList.add("hidden");
    resultSection.classList.remove("hidden");
    statusEl.className = "status";
    progress.style.width = "0%";

    if (!onlyFailed) {
      resetResults();
      state.urls = urls;
      state.results = Array(urls.length).fill(null);
      state.cards = urls.map((_, index) => {
        const card = document.createElement("article");
        card.className = "item";
        grid.append(card);
        return card;
      });
      await Promise.all(state.cards.map((_, index) => renderItem(index)));
    }
    state.mode = mode;
    const taskIndexes = onlyFailed
      ? state.results.flatMap((item, index) => item && !item.ok ? [index] : [])
      : state.urls.map((_, index) => index);
    if (!taskIndexes.length) {
      running = false;
      setButtonsDisabled(false);
      return;
    }

    const startedAt = Date.now();
    let completed = 0;
    let nextTask = 0;
    let transientErrors = 0;
    let activeLimit = mode === "fast" ? FAST_CONCURRENCY : STABLE_CONCURRENCY;
    const familyGate = createSemaphore(FAMILY_CONCURRENCY);
    const requestCache = new Map();
    const onTransient = () => {
      transientErrors += 1;
      if (mode === "fast" && transientErrors >= 2) activeLimit = FAST_FALLBACK_CONCURRENCY;
    };

    const getRequest = (url) => {
      if (!requestCache.has(url)) requestCache.set(url, requestWithRetry(url, mode, familyGate, onTransient));
      return requestCache.get(url);
    };

    const modeLabel = mode === "fast" ? "高速処理" : "安定処理";
    statusEl.textContent = `${modeLabel}処理中… 0 / ${taskIndexes.length}`;
    const worker = async (slot) => {
      while (true) {
        if (slot >= activeLimit) return;
        const taskPosition = nextTask;
        nextTask += 1;
        if (taskPosition >= taskIndexes.length) return;
        const index = taskIndexes[taskPosition];
        const previous = state.results[index];
        try {
          const { payload, retries } = await getRequest(state.urls[index]);
          const item = createSuccess(payload, index, mode, retries);
          if (mode === "stable") await ensurePng(item);
          releaseResult(previous);
          state.results[index] = item;
        } catch (error) {
          releaseResult(previous);
          state.results[index] = {
            index,
            ok: false,
            retries: error?.retries || 0,
            error: error instanceof Error ? error.message : "撮影に失敗しました。",
          };
        }
        await renderItem(index);
        completed += 1;
        progress.style.width = `${Math.round((completed / taskIndexes.length) * 100)}%`;
        statusEl.textContent = `${modeLabel}処理中… ${completed} / ${taskIndexes.length}${activeLimit === FAST_FALLBACK_CONCURRENCY ? "（混雑を検知し6並列へ調整）" : ""}`;
      }
    };

    try {
      const configuredConcurrency = mode === "fast" ? FAST_CONCURRENCY : STABLE_CONCURRENCY;
      const workerCount = Math.min(configuredConcurrency, taskIndexes.length);
      await Promise.all(Array.from({ length:workerCount }, (_, slot) => worker(slot)));
      await recalculateDuplicates();
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      progress.style.width = "100%";
      const failures = state.results.filter((item) => item && !item.ok).length;
      statusEl.className = failures ? "status error" : "status";
      statusEl.textContent = `完了：${state.results.length - failures} / ${state.results.length}件（約${seconds}秒）${failures ? `・失敗 ${failures}件` : ""}`;
      updateSummary(mode, seconds);
    } finally {
      running = false;
      setButtonsDisabled(false);
    }
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let number = 0; number < 256; number += 1) {
      let value = number;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[number] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  const u16 = (value) => [value & 255, (value >>> 8) & 255];
  const u32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

  async function makeZip(items) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const item of items) {
      const blob = await ensurePng(item);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const nameBytes = encoder.encode(item.name);
      const crc = crc32(bytes);
      const local = new Uint8Array([
        0x50,0x4b,0x03,0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(blob.size), ...u32(blob.size), ...u16(nameBytes.length), ...u16(0), ...nameBytes,
      ]);
      localParts.push(local, blob);
      centralParts.push(new Uint8Array([
        0x50,0x4b,0x01,0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(blob.size), ...u32(blob.size), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
      ]));
      offset += local.length + blob.size;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      0x50,0x4b,0x05,0x06, ...u16(0), ...u16(0), ...u16(items.length), ...u16(items.length),
      ...u32(centralSize), ...u32(offset), ...u16(0),
    ]);
    return new Blob([...localParts, ...centralParts, end], { type:"application/zip" });
  }

  async function downloadZip(includeDuplicates) {
    const selected = state.results.filter((item) => item?.ok && (includeDuplicates || !item.duplicate));
    if (!selected.length) {
      zipStatus.textContent = "保存できる画像がありません。";
      return;
    }
    zipAll.disabled = true;
    zipUnique.disabled = true;
    try {
      zipStatus.textContent = `ZIPを作成中… ${selected.length}枚`;
      const zip = await makeZip(selected);
      const url = URL.createObjectURL(zip);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      anchor.href = url;
      anchor.download = includeDuplicates ? `coupon-capture-all-${stamp}.zip` : `coupon-capture-unique-${stamp}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      zipStatus.textContent = `${includeDuplicates ? "全画像" : "重複を除いた画像"}の保存を開始しました（${selected.length}枚）`;
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      zipStatus.textContent = "ZIP保存に失敗しました。";
    } finally {
      const successes = state.results.filter((item) => item?.ok);
      zipAll.disabled = successes.length === 0;
      zipUnique.disabled = successes.filter((item) => !item.duplicate).length === 0;
    }
  }

  function clearAll() {
    resetResults();
    resultSection.classList.add("hidden");
    summary.classList.add("hidden");
    retryFailed.classList.add("hidden");
    progress.style.width = "0%";
    statusEl.className = "status";
    statusEl.textContent = "待機中";
    zipStatus.textContent = "";
    zipAll.disabled = true;
    zipUnique.disabled = true;
    updateCounter();
  }

  input.addEventListener("input", updateCounter);
  stableStart.addEventListener("click", () => process("stable"));
  fastStart.addEventListener("click", () => process("fast"));
  retryFailed.addEventListener("click", () => process("stable", true));
  zipAll.addEventListener("click", () => downloadZip(true));
  zipUnique.addEventListener("click", () => downloadZip(false));
  clearButton.addEventListener("click", clearAll);

  zipAll.disabled = true;
  zipUnique.disabled = true;
  updateCounter();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js?v=20260917-speed-labels", { updateViaCache:"none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
})();

