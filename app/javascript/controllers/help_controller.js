import { Controller } from 'stimulus'

import $ from 'jquery';

var bindingHelpShowKey;
var bindingHelpDismissKey;

export default class extends Controller {
  static targets = ['help']
  
  connect() {
    bindingHelpShowKey = this.showKey.bind(this);
    document.addEventListener('keydown', bindingHelpShowKey);
    
    bindingHelpDismissKey = this.hideKey.bind(this);
    document.addEventListener('keydown', bindingHelpDismissKey);
  }
  
  disconnect() {
    bindingHelpShowKey = this.showKey.bind(this);
    document.removeEventListener('keydown', bindingHelpShowKey);
    
    bindingHelpDismissKey = this.hideKey.bind(this);
    document.removeEventListener('keydown', bindingHelpDismissKey);
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
