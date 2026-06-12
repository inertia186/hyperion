import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { usePreviewImageSources } from './usePreviewImageSources'

function previewContainer() {
  const container = document.createElement('div')
  container.innerHTML = `
    <article class="post-body">
      <span style="display:block; width: 300px">
        <img class="bbs-image-source" src="source.jpg" srcset="source-2x.jpg" data-bbs-pixel-src="pixel.jpg" />
      </span>
    </article>
  `
  const image = container.querySelector('img')
  Object.defineProperty(image, 'complete', {value: true, configurable: true})
  Object.defineProperty(image, 'naturalWidth', {value: 640, configurable: true})
  image.getBoundingClientRect = () => ({width: 123})

  return {container, image}
}

describe('usePreviewImageSources', () => {
  test('swaps BBS preview images to pixel sources and restores originals', async () => {
    const {container, image} = previewContainer()
    const previewScrollRef = {current: container}
    const {rerender} = renderHook(({theme}) => (
      usePreviewImageSources({previewReady: true, previewScrollRef, previewHtml: '<img />', theme})
    ), {initialProps: {theme: 'bbs'}})

    await waitFor(() => expect(image.dataset.bbsImage).toBe('pixel'))
    expect(image.getAttribute('src')).toBe('pixel.jpg')
    expect(image.hasAttribute('srcset')).toBe(false)
    expect(image.style.width).toBe('123px')
    expect(image.style.height).toBe('auto')
    expect(image.dataset.bbsOriginalSrc).toBe('source.jpg')
    expect(image.dataset.bbsOriginalSrcset).toBe('source-2x.jpg')

    rerender({theme: 'light'})

    await waitFor(() => expect(image.dataset.bbsImage).toBe('source'))
    expect(image.getAttribute('src')).toBe('source.jpg')
    expect(image.getAttribute('srcset')).toBe('source-2x.jpg')
    expect(image.style.width).toBe('')
    expect(image.style.height).toBe('')
  })
})
