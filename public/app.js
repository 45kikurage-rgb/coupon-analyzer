(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js?v=20261115-audit-fixes-v1", {
      scope: "/", updateViaCache: "none"
    }).catch(() => {});
  });
})();
