import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import QRCode from 'qrcode'
import { showWalletRequest } from '../../javascript/wallet_request'

vi.mock('qrcode', () => ({default: {toCanvas: vi.fn().mockResolvedValue()}}))
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn() })
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

test('HiveAuth displays a local QR and deep link, and both cancel controls reject the pending request', () => {
  const cancel = vi.fn()
  const uri = 'has://auth_req/local-request'
  const close = showWalletRequest({uri, cancel})
  const dialog = document.querySelector('dialog')
  expect(dialog.showModal).toHaveBeenCalled()
  expect(QRCode.toCanvas).toHaveBeenCalledWith(dialog.querySelector('canvas'), uri, {width: 260})
  expect(dialog.querySelector('a').getAttribute('href')).toBe(uri)
  dialog.querySelector('button').click()
  const escape = new Event('cancel', {cancelable: true})
  dialog.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(true)
  expect(cancel).toHaveBeenCalledTimes(2)
  close()
  expect(document.querySelector('dialog')).toBeNull()
})

test('a QR rendering failure leaves the wallet deep link usable', async () => {
  QRCode.toCanvas.mockRejectedValueOnce(new Error('canvas unavailable'))
  showWalletRequest({uri: 'has://auth_req/local-request', cancel: vi.fn()})
  await vi.waitFor(() => expect(document.body.textContent).toContain('Use the Open wallet link'))
  expect(document.querySelector('dialog a')).toHaveAttribute('href', 'has://auth_req/local-request')
})
