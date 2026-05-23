const Rails = require("@rails/ujs")
Rails.start()

require("turbolinks").start()
require("@rails/activestorage").start()
require("./channels")

const $ = require("jquery")
window.$ = $
window.jQuery = $

require("select2")(window, $)
require("jquery-ui")
require("jquery-ui/ui/effect")
require("bootstrap")

const loadLazyImages = () => {
  const images = document.querySelectorAll("img.lazyload[data-src]")

  if (!("IntersectionObserver" in window)) {
    images.forEach(loadLazyImage)
    return
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return

      observer.unobserve(entry.target)
      loadLazyImage(entry.target)
    })
  })

  images.forEach((image) => observer.observe(image))
}

const loadLazyImage = (image) => {
  image.src = image.dataset.src
  image.removeAttribute("data-src")
}

document.addEventListener("turbolinks:load", () => {
  loadLazyImages()
})

require("./controllers")
