/* Loads Leaflet's stylesheet, trying each source in turn.
 *
 * Lives in its own file rather than an inline <script> so the content-security
 * policy can keep `script-src` free of 'unsafe-inline' — an inline block here
 * would have forced the one directive most worth holding on to.
 *
 * No SRI `integrity` attribute, deliberately: a stale hash makes the browser
 * refuse the file silently, which leaves the map dead with no useful console
 * error. Resilience comes from the fallback chain instead.
 */
(function () {
  var SOURCES = [
    "/vendor/leaflet.css",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  ];

  function attempt(i) {
    if (i >= SOURCES.length) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SOURCES[i];
    link.addEventListener("error", function () {
      link.remove();
      attempt(i + 1);
    });
    document.head.appendChild(link);
  }

  attempt(0);
})();
