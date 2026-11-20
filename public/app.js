(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js?v=20261120-filter-copy-v1", {
      scope: "/", updateViaCache: "none"
    }).catch(() => {});
  });
})();
