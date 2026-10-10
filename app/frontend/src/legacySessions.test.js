import { Application } from '@hotwired/stimulus'
import { afterEach, expect, test, vi } from 'vitest'
import SessionsController from '../../javascript/controllers/sessions_controller'
import { wallet } from '../../javascript/wallet'

vi.mock('../../javascript/wallet', () => ({wallet: {disconnect: vi.fn().mockResolvedValue()}}))

let application
afterEach(() => {
  application?.stop()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

test('loading a login form does not clear another tabs wallet state', async () => {
  document.body.innerHTML = '<form data-controller="sessions"><input name="account_name"></form>'
  application = Application.start()
  application.register('sessions', SessionsController)

  await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('input')))
  expect(wallet.disconnect).not.toHaveBeenCalled()
})
