(() => {
  "use strict";
  // Browser input rules mirror the API's analysis and capture contracts.
  // Capture intentionally has narrower FamilyMart credentials than analysis.
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

  function giftWalletSourceUrl(value) {
    try {
      const wallet = new URL(value);
      if (wallet.href.length > 2048 || wallet.protocol !== "https:" ||
          wallet.hostname !== "wallet.vaton.jp" || wallet.username || wallet.password ||
          (wallet.port && wallet.port !== "443") || wallet.hash ||
          !/^\/lp\/campaign_tiktok\/?$/.test(wallet.pathname)) return null;
      const params = wallet.searchParams;
      if (params.getAll("gift_origin").length !== 1 || params.get("gift_origin") !== "g4b" ||
          params.getAll("gift_url").length !== 1 || params.getAll("referer").length > 1 ||
          (params.has("referer") && params.get("referer") !== "giftee_box") ||
          [...params.keys()].some(key => !["gift_origin", "gift_url", "referer"].includes(key))) return null;
      const source = new URL(params.get("gift_url"));
      if (source.protocol !== "https:" || source.hostname !== "g4b.giftee.biz" ||
          source.username || source.password || (source.port && source.port !== "443") ||
          source.search || source.hash ||
          !/^\/giftee_boxes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/(?:home|gifts))?\/?$/i.test(source.pathname)) return null;
      return source.toString();
    } catch {
      return null;
    }
  }

  // Keep coupon credentials and query bytes intact; change only the known route.
  function lawsonOpenUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "apli.lawson.jp" ||
          url.username || url.password || (url.port && url.port !== "443") ||
          !/^\/ldcp\/(?:coupon|login)\/?$/.test(url.pathname)) return null;
      const campaigns = url.searchParams.getAll("campaignId");
      const codes = url.searchParams.getAll("encDataCode");
      if (campaigns.length !== 1 || !/^[A-Za-z0-9_-]{1,100}$/.test(campaigns[0]) ||
          codes.length !== 1 || !/^[A-Za-z0-9_+\/-]{8,512}={0,2}$/.test(codes[0])) return null;
      return String(value).replace(/(https:\/\/[^/?#]+)\/ldcp\/coupon(?=\/?(?:[?#]|$))/, "$1/ldcp/login");
    } catch { return null; }
  }
  function isAsahiCouponUrl(url) {
    return url.protocol === "https:" && url.hostname === "www.asahibeer-cp.jp" && !url.username && !url.password &&
      (!url.port || url.port === "443") && /^\/brand\/bitter-ist\/cp\/\d{6}-\d{6}-[a-z0-9]+\/coupon\/lw\/index\.html$/.test(url.pathname) && !url.hash &&
      [...url.searchParams.keys()].every(key => key === "code") &&
      url.searchParams.getAll("code").length === 1 && /^0\d{17}$/.test(url.searchParams.get("code"));
  }
  function analysisSite(value) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (giftWalletSourceUrl(value)) return "giftee_box";
    if (lawsonOpenUrl(value)) return "lawson_ldcp";
    if (isAsahiCouponUrl(url)) return "asahi_coupon";
    if (url.hostname === "ichibanya.e-gift.co") {
      return url.href.length <= 2048 && !url.search && !url.hash &&
        /^\/c\/[A-Za-z0-9_-]{6,200}\/[1-9]\d{0,7}\/?$/.test(url.pathname) ? "ichibanya" : null;
    }
    if (url.hostname === "coupon.petit.gift") return isPetitGiftDetail(url) ? "petit_gift" : null;
    if (url.hostname === "sbg.jp") return /^\/cp\/exchange\/\d{1,12}\/[a-f0-9]{32}\/?$/i.test(url.pathname) && !url.search ? "sbg" : null;
    if (url.hostname === "coupon.sej.co.jp" && url.pathname === "/order/cpnsp_03.do") {
      const ids = url.searchParams.getAll("hansoku_id");
      return ids.length === 1 && /^[A-Za-z0-9_-]{8,200}$/.test(ids[0]) ? "seven" : null;
    }
    if (url.hostname === "ncpfa.famima.com" && url.pathname === "/prd/ebcweb") {
      const allowed = new Set(["eKey", "cpNo", "gyNo"]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return null;
      const eKey = url.searchParams.getAll("eKey");
      const cpNo = url.searchParams.getAll("cpNo");
      const gyNo = url.searchParams.getAll("gyNo");
      return eKey.length === 1 && /^[A-Za-z0-9_-]{8,512}$/.test(eKey[0]) &&
        cpNo.length === 1 && /^\d{1,6}$/.test(cpNo[0]) && gyNo.length === 1 && /^\d{1,6}$/.test(gyNo[0])
        ? "familymart" : null;
    }
    if (url.hostname === "g4b.giftee.biz") {
      return /^\/giftee_boxes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/(?:home|gifts))?\/?$/i.test(url.pathname) && !url.search
        ? "giftee_box" : null;
    }
    if (url.hostname === "misterdonut.e-gift.co") {
      return /^\/c\/[A-Za-z0-9_-]{6,200}\/\d{1,8}\/?$/.test(url.pathname) ? "misterdonut" : null;
    }
    if (url.hostname === "gift.starbucks.co.jp") {
      return /^\/e\/[A-Za-z0-9_-]{8,200}\/?$/.test(url.pathname) ? "starbucks" : null;
    }
    return null;
  }


  function isSupportedAnalysisUrl(value) {
    return Boolean(analysisSite(value));
  }

  function isSupportedCaptureUrl(value) {
    if (typeof value !== "string" || !value || value.length > 2048) return false;
    const site = analysisSite(value);
    if (site === "familymart") {
      const params = new URL(value).searchParams;
      // The capture API requires the observed three/two digit store parameters.
      return /^[A-Za-z0-9_-]{20,200}$/.test(params.get("eKey")) &&
        /^\d{3}$/.test(params.get("cpNo")) && /^\d{2}$/.test(params.get("gyNo"));
    }
    return ["seven", "petit_gift", "sbg", "asahi_coupon"].includes(site);
  }

  globalThis.CouponUrlRules = Object.freeze({
    isPetitGiftDetail, giftWalletSourceUrl, isSupportedAnalysisUrl,
    lawsonOpenUrl, isSupportedCaptureUrl
  });
})();

