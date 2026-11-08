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
  const merchantFilter = document.querySelector("#resultMerchantFilter");
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
  const MAX_ANALYZE_URLS = 2000;
  const ANALYZE_BATCH_SIZE = 100;

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);

  function isPetitGiftDetail(url) {
    if (url.pathname !== "/coupons/detail" || url.href.length > 2048) return false;
    const required = {
      app_id: /^\d{1,12}$/,
      coupon_id: /^\d{1,12}$/,
      user_id: /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,
      enc: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
    };
    const params = url.searchParams;
    return Object.entries(required).every(([key, pattern]) =>
      params.getAll(key).length === 1 && pattern.test(params.get(key))) &&
      params.getAll("t").length <= 1 && (!params.has("t") || /^\d{14}$/.test(params.get("t"))) &&
      [...params.keys()].every(key => Object.hasOwn(required, key) || key === "t");
  }

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
      if (url.hostname === "coupon.petit.gift") return isPetitGiftDetail(url);
      if (url.hostname === "sbg.jp") return /^\/cp\/exchange\/\d{1,12}\/[a-f0-9]{32}\/?$/i.test(url.pathname) && !url.search;
      return false;
    } catch {
      return false;
    }
  }

  // Normalize Lawson's public coupon route only for the link. The shared API also
  // converts this route before fetching; keep the pasted URL unchanged for traceability.
  function lawsonOpenUrl(value) {
    if (!isSupportedAnalysisUrl(value)) return null;
    const parsed = new URL(value);
    if (parsed.hostname !== "apli.lawson.jp") return null;
    return String(value).replace(/^(https:\/\/[^/?#]+)\/ldcp\/coupon(?=\/?(?:[?#]|$))/, "$1/ldcp/login");
  }

  function supportedItems() {
    const found = new Map();
    let pendingLabel = "";
    const add = (label, raw) => {
      const value = String(raw || "").replaceAll("\\_", "_").replace(/[.,;、。\])}]+$/, "");
      // Keep one extra item so over-limit input is rejected, never silently cut off.
      if (!isSupportedAnalysisUrl(value) || found.has(value) || found.size > MAX_ANALYZE_URLS) return;
      found.set(value, {
        label: /^\d{1,5}$/.test(String(label || "")) ? String(label) : String(found.size + 1),
        url: value
      });
    };
    for (const line of input.value.replaceAll("\\_", "_").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^\d{1,5}$/.test(trimmed)) pendingLabel = trimmed;
      for (const raw of trimmed.match(/https:\/\/[^\s<>"']+/gi) || []) {
        const inlineLabel = trimmed.match(/^(\d{1,5})\s+https:\/\//i)?.[1];
        add(inlineLabel || pendingLabel, raw);
        pendingLabel = "";
        if (found.size > MAX_ANALYZE_URLS) break;
      }
      if (found.size > MAX_ANALYZE_URLS) break;
    }
    return [...found.values()];
  }

  function supportedUrls() {
    return supportedItems().map(item => item.url);
  }

  function updateDetection() {
    const count = supportedUrls().length;
    const captureCount = (input.value.match(/https:\/\/(?:coupon\.sej\.co\.jp\/order\/cpnsp_03\.do|ncpfa\.famima\.com\/prd\/ebcweb)\?[^\s<>"']+/gi) || []).length;
    const overLimit = count > MAX_ANALYZE_URLS;
    document.querySelector("#counter").textContent = overLimit ? "2,000件超（分けてください）" : `${count}件検出`;
    analyzeStable.disabled = running || count === 0 || overLimit;
    analyzeFast.disabled = running || count === 0 || overLimit;
    input.disabled = running;
    pasteButton.disabled = running;
    clearButton.disabled = running;
    fastCapture.disabled = running || captureCount === 0;
    stableCapture.disabled = running || captureCount === 0;
  }

  function displayValue(item) {
    if (item.kind === "box") return { name:item.groupName || item.boxName || item.product, capacity:`残高 ${item.balance ?? 0}${item.balanceUnit || "ポイント"}`, expiry:item.expiresOn || "—" };
    if (item.kind === "gift") return { name:`${item.brand || "ブランド不明"} ${item.product}`, capacity:item.capacity || "ギフト", expiry:item.expiresAt || item.expiresOn || "不明" };
    const capacity = item.size === "used" ? "利用済み" : item.capacity || (item.size === "unknown" ? "判定不能" : item.size === "other" ? "その他" : "容量表記なし");
    return { name:item.product, capacity, expiry:(item.site === "petit_gift" ? item.expiresAt : item.expiresOn) || "—" };
  }


  // The platform host is not a merchant. Prefer the actual API destination.
  function merchantValue(item) {
    const direct = String(item.redeemPlace || item.merchant || "").trim();
    if (item.kind === "box" && (!direct || /^(?:giftee\s*box|引換先不明)$/i.test(direct))) return "交換先未選択";
    if (direct && !/^(?:引換先不明|未判定|不明)$/i.test(direct)) return direct;
    const known = {
      seven: "セブンイレブン", familymart: "ファミリーマート",
      misterdonut: "ミスタードーナツ", starbucks: "スターバックス",
      lawson_ldcp: "ローソン"
    };
    if (known[item.site]) return known[item.site];
    if (item.kind === "gift" && item.brand) return String(item.brand);
    return "未判定";
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
    if (item.site === "petit_gift") return "プチギフト";
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
      const merchant = merchantValue(item);
       const key = item.groupKey || `${display.name}\u0000${display.capacity}\u0000${merchant}`;
      const current = groups.get(key) || { ...display, merchant, count:0 };
      current.count += 1;
      groups.set(key, current);
    }
    breakdownTable.innerHTML = `<div class="breakdown-head"><span>商品名・BOX名</span><span>利用先</span><span>容量・残高</span><span>件数</span></div>${[...groups.values()].map(item => `<div class="breakdown-row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.merchant)}</span><span>${escapeHtml(item.capacity)}</span><span>${item.count}件</span></div>`).join("")}`;
    updateFilterOptions(productFilter, results.map(item => displayValue(item).name));
    updateFilterOptions(capacityFilter, results.map(item => displayValue(item).capacity));
    updateFilterOptions(merchantFilter, results.map(merchantValue));
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
       if (merchantFilter.value && merchantValue(item) !== merchantFilter.value) return false;
      const text = [item.label,item.url,display.name,merchantValue(item),display.capacity,display.expiry,resultDetail(item)].join(" ").normalize("NFKC").toLocaleLowerCase("ja");
      return !query || text.includes(query);
    });
    filterCount.textContent = `表示 ${visible.length}件 / 全 ${lastResults.length}件`;
    clearFilters.disabled = ![statusFilter.value,productFilter.value,capacityFilter.value,merchantFilter.value,searchFilter.value].some(Boolean);
    resultList.innerHTML = `<div class="result-list-head"><span>番号</span><span>商品名・BOX名</span><span>容量・操作</span><span>有効期限</span></div>${visible.map(({item,index}) => {
      const display = displayValue(item);
      const merchant = merchantValue(item);
       const badge = item.manualCorrection ? '<small class="manual-badge">手動修正中</small>' : '';
      const action = item.correctionKey && item.status !== "used" ? `<button class="correction-action" type="button" data-correction-index="${index}">${item.manualCorrection ? "修正・解除" : "修正"}</button>` : '';
      const openUrl = lawsonOpenUrl(item.url);
      const openAction = openUrl ? `<a class="result-open-link" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer" aria-label="ローソンのクーポンを開く">クーポンを開く ↗</a>` : "";
      return `<div class="result-row ${item.status === "error" ? "status-error" : item.status === "used" ? "status-used" : ""}"><span class="number">${escapeHtml(item.label)}</span><span><strong>${escapeHtml(display.name)}</strong><small class="result-merchant">利用先：${escapeHtml(merchant)}</small>${badge}</span><span class="detail"><strong>${escapeHtml(display.capacity)}</strong><small>${escapeHtml(resultDetail(item))}</small>${action}${openAction}</span><span>${escapeHtml(display.expiry)}</span></div>`;
    }).join("")}${visible.length ? "" : '<div class="result-filter-empty">条件に一致するURLはありません。</div>'}<div class="processing-time">処理時間 ${(lastProcessingMs / 1000).toFixed(1)}秒</div>`;
    resultList.querySelectorAll("[data-correction-index]").forEach(button => button.addEventListener("click", () => editCorrection(Number(button.dataset.correctionIndex))));
  }

  function resetResultFilters() {
    [statusFilter,productFilter,capacityFilter,merchantFilter,searchFilter].forEach(element => { element.value = ""; });
    renderResultList();
  }
  [statusFilter,productFilter,capacityFilter,merchantFilter].forEach(element => element.addEventListener("change",renderResultList));
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
    if (running || !items.length || items.length > MAX_ANALYZE_URLS) return;
    running = true;
    updateDetection();
    errorBox.classList.add("hidden");
    resultsSection.classList.add("hidden");
    showResults.disabled = true;
    showResults.classList.remove("ready");
    progress.value = 0;
    percent.textContent = "0%";
    status.textContent = mode === "fast" ? "高速解析中…" : "安定解析中…";
    status.classList.remove("ready");
    try {
      const results = [];
      let processingMs = 0;
      for (let offset = 0; offset < items.length; offset += ANALYZE_BATCH_SIZE) {
        const chunk = items.slice(offset, offset + ANALYZE_BATCH_SIZE);
        try {
          const payload = await requestJson("/api/analyze", {
            method:"POST",
            headers:{ "content-type":"application/json" },
            body:JSON.stringify({ items:chunk, mode })
          });
          const byUrl = new Map((Array.isArray(payload.results) ? payload.results : []).filter(item => item && typeof item.url === "string").map(item => [item.url, item]));
          results.push(...chunk.map(item => byUrl.has(item.url)
            ? { ...byUrl.get(item.url), ...item }
            : { ...item, product:"商品名不明", size:"unknown", status:"error", message:"解析結果を受信できませんでした。再解析してください。" }));
          processingMs += Number(payload.processingMs || 0);
        } catch (error) {
          // Preserve completed batches and continue with the remaining URLs.
          results.push(...chunk.map(item => ({ ...item, product:"商品名不明", size:"unknown", status:"error", message:error instanceof Error ? error.message : "通信に失敗しました。再解析してください。" })));
        }
        const completed = Math.min(items.length, offset + chunk.length);
        const value = Math.round(100 * completed / items.length);
        progress.value = value;
        percent.textContent = `${value}%`;
        status.textContent = `${mode === "fast" ? "高速" : "安定"}解析中… ${completed}/${items.length}件`;
      }
      lastProcessingMs = processingMs;
      [statusFilter,productFilter,capacityFilter,merchantFilter,searchFilter].forEach(element => { element.value = ""; });
      render(results);
      progress.value = 100;
      percent.textContent = "100%";
      const failed = results.filter(item => item.status === "error").length;
      status.textContent = `解析完了 ${results.length}/${items.length}件${failed ? `（判定不能 ${failed}件）` : ""}`;
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
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js?v=20261108-analysis-2000-v1", { scope:"/", updateViaCache:"none" }).then(registration => registration.update()).catch(() => {}));
  }
})();

