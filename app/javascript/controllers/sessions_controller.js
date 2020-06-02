import { Controller } from 'stimulus'

export default class extends Controller {
  static targets = ['url', 'authorization']
  
  connect() {
    $(':input:first').focus(); 
  }
}
