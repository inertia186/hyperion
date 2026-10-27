import React, {useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {usePostPreview} from '../app/frontend/src/usePostPreview'

function PreviewFixture() {
  const [id, setId] = useState(null)
  const desktopPreviewScrollRef = useRef(null)
  const preview = usePostPreview(id, {desktopPreviewScrollRef})
  return <>
    <h1>Preview cancellation transport fixture</h1>
    {Array.from({length: 10}, (_, index) => <button key={index} onClick={() => setId(index + 1)}>Post {index + 1}</button>)}
    <button onClick={() => setId(null)}>Clear</button>
    <button onClick={() => root.unmount()}>Unmount</button>
    <output data-status={preview.status} data-id={preview.postId || ''}>{preview.status}</output>
    <article ref={desktopPreviewScrollRef} dangerouslySetInnerHTML={{__html: preview.html}} />
  </>
}

const root = createRoot(document.getElementById('root'))
root.render(<PreviewFixture />)
