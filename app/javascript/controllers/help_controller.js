import { Controller } from '@hotwired/stimulus'

import $ from 'jquery';

export default class extends Controller {
  static targets = ['help']
  
  connect() {
    this.bindHelpKeys();
  }
  
  disconnect() {
    document.removeEventListener('keydown', this.bindingHelpShowKey);
    
    document.removeEventListener('keydown', this.bindingHelpDismissKey);
  }
  
  bindHelpKeys() {
    this.bindingHelpShowKey = this.showKey.bind(this);
    document.addEventListener('keydown', this.bindingHelpShowKey);
    
    this.bindingHelpDismissKey = this.hideKey.bind(this);
    document.addEventListener('keydown', this.bindingHelpDismissKey);
  }
  
  show(e) {
    e.preventDefault();
    
    $('#help:hidden').modal('show');
  }
  
  hide(e) {
    // Do not e.preventDefault() because we bind to all keys.
    
    $('#help:visible').modal('hide');
  }
  
  showKey(e) {
    if ( e.shiftKey && e.keyCode == 191 ) { // ? (shift + /)
      if ( $('#help:hidden').length ) {
        this.show(e); // toggle on
      } else {
        this.hide(e); // toggle off
      }
    }
  }
  
  hideKey(e) {
    if ( e.keyCode != 191 ) { // any key but ?
      this.hide(e);
    }
  }
}
