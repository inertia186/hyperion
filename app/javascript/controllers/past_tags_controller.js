import { Controller } from 'stimulus'

export default class extends Controller {
  static targets = ['pastTag']
  
  removeTag(e) {
    this.pastTagTarget.style.display = 'none';
  }
}
