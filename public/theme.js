/*
 * Theme bootstrap.
 *
 * Runs before first paint, which is the whole point: a deferred module script
 * would apply the theme after the browser has already painted the default,
 * and the reader would see a flash of the wrong one. Deliberately not a
 * module, deliberately not deferred.
 */
;(function () {
  try {
    var stored = localStorage.getItem('tourniquet-theme')
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored)
      return
    }
  } catch (e) {
    /* storage disabled; fall through to the system preference */
  }
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
  document.documentElement.setAttribute('data-theme', prefersLight ? 'light' : 'dark')
})()
