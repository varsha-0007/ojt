(function () {
  var scriptTag = document.currentScript;
  var backendOrigin = new URL(scriptTag.src).origin;
  var trackUrl = backendOrigin + "/track";

  function send(endpoint, event) {
    var payload = JSON.stringify({
      endpoint: endpoint || window.location.pathname,
      event: event || "page_view",
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(trackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  window.RateLimiterTracker = { track: send };

  send(window.location.pathname, "page_view");
})();