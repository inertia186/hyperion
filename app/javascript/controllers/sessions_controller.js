import { Controller } from '@hotwired/stimulus'

import { wallet } from '../wallet'

export default class extends Controller {
  connect() {
    this.element.querySelector('input[name="account_name"]')?.focus()
    wallet.disconnect().catch(() => {})
  }

  async beginLogin(event) {
    event.preventDefault()
    const buttons = this.element.querySelectorAll('button')
    const accountName = this.element.querySelector('input[name="account_name"]').value
    const error = document.getElementById('error-alert')
    const status = document.getElementById('success-alert')
    buttons.forEach((button) => { button.disabled = true })
    error.hidden = true
    status.hidden = false
    status.textContent = 'Waiting for your wallet…'
    try {
      const result = await wallet.connect({accountName, provider: event.submitter?.value})
      window.location.assign(result.redirect_url)
    } catch (failure) {
      error.textContent = failure.message || 'Login failed. Please try again.'
      error.hidden = false
      status.hidden = true
    } finally {
      buttons.forEach((button) => { button.disabled = false })
    }
  }
}
