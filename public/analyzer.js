(() => {
  "use strict";
  const input = document.querySelector("#input");
  const analyzeStable = document.querySelector("#analyzeStart");
  const analyzeFast = document.querySelector("#analyzeFastStart");
  const pasteButton = document.querySelector("#pasteButton");
  const clearButton = document.querySelector("#analysisClear");
  const resultsSection = document.querySelector("#analysisResults");
  const resultList = document.querySelector("#resultList");
  const breakdownTable = document.querySelector("#breakdownTable");
  const progress = document.querySelector("#analysisProgress");
  const percent = document.querySelector("#analysisPercent");
  const status = document.querySelector("#analysisStatus");
  const errorBox = document.querySelector("#analysisError");
  const showResults = document.querySelector("#showResults");
  const fastCapture = document.querySelector("#fastStart");
  const stableCapture = document.querySelector("#stableStart");
  let running = false;
  let lastResults = [];
  let lastProcessingMs = 0;

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);

  function supportedUrls() {
    const found = new Set();
    for (const raw of input.value.replaceAll("\\_", "_").match(/https:\/\/[^\s<>"']+/gi) || []) {
      const value = raw.replace(/[.,;、。\])}]+$/, "");
      try {
        const url = new URL(value);
        if ((url.hostname === "coupon.sej.co.jp" && url.pathname === "/order/cpnsp_03.do") ||
          (url.hostname === "ncpfa.famima.com" && url.pathname === "/prd/ebcweb") ||
          (url.hostname === "g4b.giftee.biz" && /^\/giftee_boxes\/[0-9a-f-]{36}(?:\/(?:home|gifts))?\/?$/i.test(url.pathname)) ||
          (url.hostname === "misterdonut.e-gift.co" && /^\/c\/[A-Za-z0-9_-]+\/\d+\/?$/.test(url.pathname))) found.add(value);
      } catch {}
      if (found.size >= 100) break;
    }
    return [...found];
  }

  function updateDetection() {
    const count = supportedUrls().length;
    const captureCount = (input.value.match(/https:\/\/(?:coupon\.sej\.co\.jp\/order\/cpnsp_03\.do|ncpfa\.famima\.com\/prd\/ebcweb)\?[^\s<>"']+/gi) || []).length;
    document.querySelector("#counter").textContent = `${count}件検出`;
    analyzeStable.disabled = running || count === 0;
    analyzeFast.disabled = running || count === 0;
    fastCapture.disabled = running || captureCount === 0;
    stableCapture.disabled = running || captureCount === 0;
  }

  function displayValue(item) {
    if (item.kind === "box") return { name:item.boxName || item.product, capacity:`残高 ${item.balance ?? 0}${item.balanceUnit || "ポイント"}`, expiry:item.expiresOn || "—" };
    if (item.kind === "gift") return { name:`${item.brand || "ブランド不明"} ${item.product}`, capacity:item.capacity || "ギフト", expiry:item.expiresAt || item.expiresOn || "不明" };
    const capacity = item.size === "used" ? "利用済み" : item.capacity || (item.size === "unknown" ? "判定不能" : item.size === "other" ? "その他" : "容量表記なし");
    return { name:item.product, capacity, expiry:item.expiresOn || "—" };
  }

  function resultDetail(item) {
    if (item.status === "error") return item.message || "解析失敗";
    if (item.kind === "gift") return item.brand || "ギフト";
    if (item.site === "giftee_box") return "Giftee Box";
    if (item.site === "familymart") return "ファミリーマート";
    if (item.site === "misterdonut") return "ミスタードーナツ";
    return "セブンイレブン";
  }

  function render(results) {
    lastResults = results;
    const failed = results.filter(item => item.status === "error").length;
    const review = results.filter(item => item.status !== "error" && (item.status === "needs_review" || item.size === "unknown" || item.size === "mixed" || item.product === "商品名不明")).length;
    const success = results.length - review - failed;
    document.querySelector("#totalCount").textContent = results.length;
    document.querySelector("#successCount").textContent = success;
    document.querySelector("#reviewCount").textContent = review;
    document.querySelector("#failureCount").textContent = failed;
    document.querySelector("#resultTotal").textContent = results.length;
    const groups = new Map();
    for (const item of results) {
      const display = displayValue(item);
      const key = `${display.name}\u0000${display.capacity}`;
      const current = groups.get(key) || { ...display, count:0 };
      current.count += 1;
      groups.set(key, current);
    }
    breakdownTable.innerHTML = `<div class="breakdown-head"><span>商品名・BOX名</span><span>容量・残高</span><span>件数</span></div>${[...groups.values()].map(item => `<div class="breakdown-row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.capacity)}</span><span>${item.count}件</span></div>`).join("")}`;
    resultList.innerHTML = `<div class="result-list-head"><span>番号</span><span>商品名・BOX名</span><span>容量・操作</span><span>有効期限</span></div>${results.map((item, index) => {
      const display = displayValue(item);
      const badge = item.manualCorrection ? '<small class="manual-badge">手動修正中</small>' : '';
      const action = item.correctionKey && item.status !== "used" ? `<button class="correction-action" type="button" data-correction-index="${index}">${item.manualCorrection ? "修正・解除" : "修正"}</button>` : '';
      return `<div class="result-row ${item.status === "error" ? "status-error" : item.status === "used" ? "status-used" : ""}"><span class="number">${escapeHtml(item.label)}</span><span><strong>${escapeHtml(display.name)}</strong>${badge}</span><span class="detail"><strong>${escapeHtml(display.capacity)}</strong><small>${escapeHtml(resultDetail(item))}</small>${action}</span><span>${escapeHtml(display.expiry)}</span></div>`;
    }).join("")}<div class="processing-time">処理時間 ${(lastProcessingMs / 1000).toFixed(1)}秒</div>`;
    resultList.querySelectorAll("[data-correction-index]").forEach(button => button.addEventListener("click", () => editCorrection(Number(button.dataset.correctionIndex))));
    resultsSection.classList.remove("hidden");
  }

  async function requestJson(path, options) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  function sizeFromCapacity(capacity) {
    if (/350\s*ml/i.test(capacity)) return "350";
    if (/500\s*ml/i.test(capacity)) return "500";
    return capacity ? "other" : "none";
  }

  async function editCorrection(index) {
    const item = lastResults[index];
    if (!item?.correctionKey) return;
    if (item.manualCorrection && confirm("手動修正を解除して、自動判定へ戻しますか？")) {
      try {
        await requestJson(`/api/corrections/${item.correctionKey}`, { method:"DELETE" });
        item.manualCorrection = false;
        status.textContent = "手動修正を解除しました。もう一度解析すると自動判定へ戻ります。";
        render(lastResults);
      } catch (error) { alert(error.message); }
      return;
    }
    const product = prompt("正しい商品名を入力してください。", item.product || "");
    if (product === null) return;
    const capacity = prompt("正しい容量を入力してください。例：350ml、500ml", item.capacity || "");
    if (capacity === null) return;
    try {
      const saved = await requestJson("/api/corrections", {
        method:"POST", headers:{ "content-type":"application/json" },
        body:JSON.stringify({ correctionKey:item.correctionKey, product, capacity, size:sizeFromCapacity(capacity) })
      });
      Object.assign(item, saved, { status:"ok" });
      status.textContent = "手動修正を保存しました。3サイトで次回から優先します。";
      render(lastResults);
    } catch (error) { alert(error.message); }
  }

  async function analyze(mode) {
    if (running || !supportedUrls().length) return;
    running = true;
    updateDetection();
    errorBox.classList.add("hidden");
    resultsSection.classList.add("hidden");
    progress.value = 15;
    percent.textContent = "15%";
    status.textContent = mode === "fast" ? "高速解析中…" : "安定解析中…";
    status.classList.remove("ready");
    try {
      const payload = await requestJson("/api/analyze", {
        method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ text:input.value, mode })
      });
      lastProcessingMs = Number(payload.processingMs || 0);
      render(payload.results || []);
      progress.value = 100;
      percent.textContent = "100%";
      status.textContent = "解析完了";
      status.classList.add("ready");
      showResults.disabled = false;
      showResults.classList.add("ready");
    } catch (error) {
      progress.value = 0;
      percent.textContent = "0%";
      status.textContent = "解析を完了できませんでした";
      errorBox.textContent = error instanceof Error ? error.message : "解析に失敗しました。";
      errorBox.classList.remove("hidden");
    } finally {
      running = false;
      updateDetection();
    }
  }

  function reset() {
    input.value = "";
    lastResults = [];
    lastProcessingMs = 0;
    resultsSection.classList.add("hidden");
    resultList.innerHTML = "";
    breakdownTable.innerHTML = "";
    progress.value = 0;
    percent.textContent = "0%";
    status.textContent = "解析待ち";
    status.classList.remove("ready");
    errorBox.classList.add("hidden");
    showResults.disabled = true;
    showResults.classList.remove("ready");
    for (const id of ["totalCount", "successCount", "reviewCount", "failureCount"]) document.querySelector(`#${id}`).textContent = "—";
    document.querySelector("#clear").click();
    updateDetection();
  }

  input.addEventListener("input", updateDetection);
  analyzeStable.addEventListener("click", () => analyze("stable"));
  analyzeFast.addEventListener("click", () => analyze("fast"));
  pasteButton.addEventListener("click", async () => {
    try { input.value = await navigator.clipboard.readText(); input.dispatchEvent(new Event("input")); }
    catch { errorBox.textContent = "貼り付け欄を長押しして貼り付けてください。"; errorBox.classList.remove("hidden"); }
  });
  clearButton.addEventListener("click", reset);
  showResults.addEventListener("click", () => resultsSection.scrollIntoView({ behavior:"smooth", block:"start" }));
  updateDetection();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=20260921-v1", { scope:"/", updateViaCache:"none" }).then(registration => registration.update()).catch(() => {}));
  }
})();
