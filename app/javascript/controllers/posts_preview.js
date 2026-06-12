export function loadPreviewIframe($, postId) {
  const iframe = $(`#preview-${postId} iframe`)
  iframe.attr('src', iframe.data('src'))
  return iframe
}

export function clearPreviewIframe($, postId) {
  const iframe = $(`#preview-${postId} iframe`)
  iframe.attr('src', 'about:blank')
  return iframe
}

export function isPreviewBackdropClick(event, postId) {
  return event.target?.id === `preview-${postId}`
}

export function bindPreviewListeners(target, controller) {
  const bindings = {
    scrollKey: controller.scrollKey.bind(controller),
    dismissKey: controller.previewDismissKey.bind(controller),
    previousKey: controller.previewPreviousKey.bind(controller),
    nextKey: controller.previewNextKey.bind(controller),
    markReadPreviousKey: controller.markAsReadAndPreviewPreviousKey.bind(controller),
    markReadNextKey: controller.markAsReadAndPreviewNextKey.bind(controller),
    dismissOutsideModal: controller.previewDismissOutsideModal.bind(controller)
  }

  target.addEventListener('keydown', bindings.scrollKey)
  target.addEventListener('keydown', bindings.dismissKey)
  target.addEventListener('keydown', bindings.previousKey)
  target.addEventListener('keydown', bindings.nextKey)
  target.addEventListener('keydown', bindings.markReadPreviousKey)
  target.addEventListener('keydown', bindings.markReadNextKey)
  target.addEventListener('click', bindings.dismissOutsideModal)

  return bindings
}

export function unbindPreviewListeners(target, bindings) {
  if (!bindings) return

  target.removeEventListener('keydown', bindings.scrollKey)
  target.removeEventListener('keydown', bindings.dismissKey)
  target.removeEventListener('keydown', bindings.previousKey)
  target.removeEventListener('keydown', bindings.nextKey)
  target.removeEventListener('keydown', bindings.markReadPreviousKey)
  target.removeEventListener('keydown', bindings.markReadNextKey)
  target.removeEventListener('click', bindings.dismissOutsideModal)
}
