// Sets the theme before the first paint (external file: the site's CSP blocks inline scripts).
;(function () {
  try {
    var t = localStorage.getItem('quantlab.theme')
    if (t !== 'light' && t !== 'dark') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
    document.documentElement.style.colorScheme = t
  } catch {
    // storage blocked: keep the default dark theme
  }
})()
