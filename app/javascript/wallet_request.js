import QRCode from 'qrcode'

export function showWalletRequest({uri, cancel}) {
  const dialog = document.createElement('dialog')
  if (typeof dialog.showModal !== 'function') throw new Error('HiveAuth requires a browser that supports wallet dialogs. Please update your browser.')
  dialog.setAttribute('aria-label', 'Approve in your wallet')
  dialog.style.cssText = 'color-scheme: light; max-width: min(400px, 94vw); border: 1px solid #94a3b8; border-radius: 12px; padding: 24px; text-align: center; color: #0f172a; background: whitesmoke;'
  dialog.innerHTML = '<h2>Approve in your wallet</h2><p>Scan the code or open your mobile wallet. Return here after approving.</p><canvas aria-label="HiveAuth request QR code"></canvas><p><a>Open wallet</a></p><button type="button">Cancel</button>'
  dialog.querySelector('a').href = uri
  dialog.querySelector('a').style.color = '#2455a4'
  dialog.querySelector('canvas').style.maxWidth = '100%'
  const cancelButton = dialog.querySelector('button')
  cancelButton.style.cssText = 'color: whitesmoke; background: #292c30; border: 1px solid #292c30; border-radius: 4px; padding: 8px 20px; min-height: 44px; font: inherit; cursor: pointer;'
  cancelButton.addEventListener('click', cancel)
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); cancel() })
  document.body.append(dialog)
  dialog.showModal()
  QRCode.toCanvas(dialog.querySelector('canvas'), uri, {width: 260}).catch(() => {
    dialog.querySelector('canvas').replaceWith('Use the Open wallet link to continue.')
  })
  return () => dialog.remove()
}
