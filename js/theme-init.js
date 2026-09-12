/* Applies the saved light/dark theme before first paint.
 * Kept as an external file so it satisfies the page's script-src-elem CSP
 * (which does not allow 'unsafe-inline'). Default: dark. */
(function () {
  try {
    var t = localStorage.getItem('gridradio-theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
