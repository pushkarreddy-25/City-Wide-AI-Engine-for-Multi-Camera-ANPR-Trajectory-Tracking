/* Loads Chart.js from a CDN. If the primary source is blocked, retry from a
 * mirror before giving up.
 *
 * Lives in its own file rather than an inline <script> so the content-security
 * policy can keep `script-src` free of 'unsafe-inline'.
 */
(function () {
  var SOURCES = [
    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  ];

  function attempt(i) {
    if (i >= SOURCES.length) return;
    var script = document.createElement("script");
    script.src = SOURCES[i];
    script.addEventListener("error", function () {
      script.remove();
      attempt(i + 1);
    });
    document.head.appendChild(script);
  }

  attempt(0);
}());
})();
