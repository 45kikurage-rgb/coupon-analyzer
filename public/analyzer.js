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
  const statusFilter = document.querySelector("#resultStatusFilter");
  const productFilter = document.querySelector("#resultProductFilter");
  const capacityFilter = document.querySelector("#resultCapacityFilter");
  const searchFilter = document.querySelector("#resultSearchFilter");
  const clearFilters = document.querySelector("#clearResultFilters");
  const filterCount = document.querySelector("#resultFilterCount");
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
  const MAX_ANALYZE_URLS = 500;
  const ANALYZE_BATCH_SIZE = 100;

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);

  function isSupportedAnalysisUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
      if (url.hostname === "apli.lawson.jp" && /^\/ldcp\/(?:coupon|login)\/?$/.test(url.pathname)) {
        const campaigns = url.searchParams.getAll("campaignId"), codes = url.searchParams.getAll("encDataCode");
        return campaigns.length === 1 && /^[A-Za-z0-9_-]{1,100}$/.test(campaigns[0]) &&
          codes.length === 1 && /^[A-Za-z0-9_+\/-]{8,512}={0,2}$/.test(codes[0]);
      }
      if (url.hostname === "coupon.sej.co.jp" && url.pathname === "/order/cpnsp_03.do") return true;
      if (url.hostname === "ncpfa.famima.com" && url.pathname === "/prd/ebcweb") return true;
      if (url.hostname === "g4b.giftee.biz") return /^\/giftee_boxes\/[0-9a-f-]{36}(?:\/(?:home|gifts))?\/?$/i.test(url.pathname) && !url.search;
      if (url.hostname === "misterdonut.e-gift.co") return /^\/c\/[A-Za-z0-9_-]+\/\d+\/?$/.test(url.pathname);
      if (url.hostname === "gift.starbucks.co.jp") return /^\/e\/[A-Za-z0-9_-]{8,200}\/?$/.test(url.pathname);
      if (url.hostname === "sbg.jp") return /^\/cp\/exchange\/\d{1,12}\/[a-f0-9]{32}\/?$/i.test(url.pathname) && !url.search;
      return false;
    } catch {
      return false;
    }
  }

  function supportedItems() {
    const found = new Map();
    let pendingLabel = "";
    const add = (label, raw) => {
      const value = String(raw || "").replaceAll("\\_", "_").replace(/[.,;、。\])}]+$/, "");
      if (!isSupportedAnalysisUrl(value) || found.has(value) || found.size >= MAX_ANALYZE_URLS) return;
      found.set(value, {
        label: /^\d{1,5}$/.test(String(label || "")) ? String(label) : String(found.size + 1),
        url: value
      });
    };
    for (const line of input.value.replaceAll("\\_", "_").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^\d{1,5}$/.test(trimmed)) pendingLabel = trimmed;
      for (const raw of trimmed.match(/https:\/\/[^\s<>"']+/gi) || []) {
        add(pendingLabel, raw);
        pendingLabel = "";
        if (found.size >= MAX_ANALYZE_URLS) break;
      }
      if (found.size >= MAX_ANALYZE_URLS) break;
    }
    return [...found.values()];
  }

  function supportedUrls() {
    return supportedItems().map(item => item.url);
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
    if (item.kind === "box") return { name:item.groupName || item.boxName || item.product, capacity:`残高 ${item.balance ?? 0}${item.balanceUnit || "ポイント"}`, expiry:item.expiresOn || "—" };
    if (item.kind === "gift") return { name:`${item.brand || "ブランド不明"} ${item.product}`, capacity:item.capacity || "ギフト", expiry:item.expiresAt || item.expiresOn || "不明" };
    const capacity = item.size === "used" ? "利用済み" : item.capacity || (item.size === "unknown" ? "判定不能" : item.size === "other" ? "その他" : "容量表記なし");
    return { name:item.product, capacity, expiry:item.expiresOn || "—" };
  }

  function groupDisplayValue(item) {
    if (item.kind === "box") {
      const name = item.groupName || item.boxName || item.product;
      const capacity = item.boxCategory === "eraberu_pay"
        ? "金額を問わず1グループ"
        : item.groupSpecification || `${item.balance ?? 0}${item.balanceUnit || "ポイント"}`;
      return { name, capacity, expiry:item.expiresOn || "—" };
    }
    return displayValue(item);
  }

  function resultDetail(item) {
    if (item.status === "error") return item.message || "解析失敗";
    if (item.kind === "gift") return item.brand || "ギフト";
    if (item.site === "giftee_box") return "Giftee Box";
    if (item.site === "familymart") return "ファミリーマート";
    if (item.site === "misterdonut") return "ミスタードーナツ";
    if (item.site === "sbg") return "SBギフト";
    if (item.site === "lawson_ldcp") return "ローソン";
    if (item.site === "starbucks") return "スターバックス";
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
      const display = groupDisplayValue(item);
      const key = item.groupKey || `${display.name}\u0000${display.capacity}`;
      const current = groups.get(key) || { ...display, count:0 };
      current.count += 1;
      groups.set(key, current);
    }
    breakdownTable.innerHTML = `<div class="breakdown-head"><span>商品名・BOX名</span><span>容量・残高</span><span>件数</span></div>${[...groups.values()].map(item => `<div class="breakdown-row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.capacity)}</span><span>${item.count}件</span></div>`).join("")}`;
    updateFilterOptions(productFilter, results.map(item => displayValue(item).name));
    updateFilterOptions(capacityFilter, results.map(item => displayValue(item).capacity));
    renderResultList();
    resultsSection.classList.remove("hidden");
  }

  function resultStatus(item) {
    if (item.status === "used" || item.size === "used") return "used";
    if (item.status === "error") return "error";
    if (item.status === "needs_review" || item.size === "unknown" || item.size === "mixed" || !item.product || item.product === "商品名不明") return "review";
    return "ok";
  }

  function updateFilterOptions(select, values) {
    const previous = select.value;
    const options = [...new Set(values.map(value => String(value || "")))].filter(Boolean).sort((a,b) => a.localeCompare(b,"ja"));
    select.innerHTML = '<option value="">すべて</option>' + options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    select.value = options.includes(previous) ? previous : "";
  }

  function renderResultList() {
    const query = searchFilter.value.normalize("NFKC").trim().toLocaleLowerCase("ja");
    const visible = lastResults.map((item,index) => ({item,index})).filter(({item}) => {
      const display = displayValue(item);
      if (statusFilter.value && resultStatus(item) !== statusFilter.value) return false;
      if (productFilter.value && String(display.name || "") !== productFilter.value) return false;
      if (capacityFilter.value && String(display.capacity || "") !== capacityFilter.value) return false;
      const text = [item.label,item.url,display.name,display.capacity,display.expiry,resultDetail(item)].join(" ").normalize("NFKC").toLocaleLowerCase("ja");
      return !query || text.includes(query);
    });
    filterCount.textContent = `表示 ${visible.length}件 / 全 ${lastResults.length}件`;
    clearFilters.disabled = ![statusFilter.value,productFilter.value,capacityFilter.value,searchFilter.value].some(Boolean);
    resultList.innerHTML = `<div class="result-list-head"><span>番号</span><span>商品名・BOX名</span><span>容量・操作</span><span>有効期限</span></div>${visible.map(({item,index}) => {
      const display = displayValue(item);
      const badge = item.manualCorrection ? '<small class="manual-badge">手動修正中</small>' : '';
      const action = item.correctionKey && item.status !== "used" ? `<button class="correction-action" type="button" data-correction-index="${index}">${item.manualCorrection ? "修正・解除" : "修正"}</button>` : '';
      return `<div class="result-row ${item.status === "error" ? "status-error" : item.status === "used" ? "status-used" : ""}"><span class="number">${escapeHtml(item.label)}</span><span><strong>${escapeHtml(display.name)}</strong>${badge}</span><span class="detail"><strong>${escapeHtml(display.capacity)}</strong><small>${escapeHtml(resultDetail(item))}</small>${action}</span><span>${escapeHtml(display.expiry)}</span></div>`;
    }).join("")}${visible.length ? "" : '<div class="result-filter-empty">条件に一致するURLはありません。</div>'}<div class="processing-time">処理時間 ${(lastProcessingMs / 1000).toFixed(1)}秒</div>`;
    resultList.querySelectorAll("[data-correction-index]").forEach(button => button.addEventListener("click", () => editCorrection(Number(button.dataset.correctionIndex))));
  }

  function resetResultFilters() {
    [statusFilter,productFilter,capacityFilter,searchFilter].forEach(element => { element.value = ""; });
    renderResultList();
  }
  [statusFilter,productFilter,capacityFilter].forEach(element => element.addEventListener("change",renderResultList));
  searchFilter.addEventListener("input",renderResultList);
  clearFilters.addEventListener("click",resetResultFilters);

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
      status.textContent = "手動修正を保存しました。次回から優先します。";
      render(lastResults);
    } catch (error) { alert(error.message); }
  }

  async function analyze(mode) {
    const items = supportedItems();
    if (running || !items.length) return;
    running = true;
    updateDetection();
    errorBox.classList.add("hidden");
    resultsSection.classList.add("hidden");
    progress.value = 15;
    percent.textContent = "15%";
    status.textContent = mode === "fast" ? "高速解析中…" : "安定解析中…";
    status.classList.remove("ready");
    try {
      const results = [];
      let processingMs = 0;
      for (let offset = 0; offset < items.length; offset += ANALYZE_BATCH_SIZE) {
        const chunk = items.slice(offset, offset + ANALYZE_BATCH_SIZE);
        const payload = await requestJson("/api/analyze", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify({ items:chunk, mode })
        });
        results.push(...(payload.results || []));
        processingMs += Number(payload.processingMs || 0);
        const completed = Math.min(items.length, offset + chunk.length);
        const value = Math.min(95, 15 + Math.round(80 * completed / items.length));
        progress.value = value;
        percent.textContent = `${value}%`;
        status.textContent = `${mode === "fast" ? "高速" : "安定"}解析中… ${completed}/${items.length}件`;
      }
      lastProcessingMs = processingMs;
      [statusFilter,productFilter,capacityFilter,searchFilter].forEach(element => { element.value = ""; });
      render(results);
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
    resetResultFilters();
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
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=20261008-filters-v1", { scope:"/", updateViaCache:"none" }).then(registration => registration.update()).catch(() => {}));
  }
})();

