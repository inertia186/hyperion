import { Controller } from 'stimulus'

import $ from 'jquery';
import 'select2/dist/css/select2.css'
import 'select2'

var bindingHelpShowKey;
var bindingHelpDismissKey;

export default class extends Controller {
  disableBody() {
    $('.global-spinner').show();
    $('body').switchClass('disabled-overlay', 'enabled-overlay', 5000, 'easeInOutQuad');
  }
  
  toggleMuted(e) {
    var toggleMutes = $(e.target);
    
    toggleMutes.prop('disabled', true);
    toggleMutes.closest("form").submit();
    
    this.disableBody();
  }
  
  toggleOnlyFavoriteTags(e) {
    var toggleOnlyFavoriteTags = $(e.target);
    
    toggleOnlyFavoriteTags.prop('disabled', true);
    toggleOnlyFavoriteTags.closest("form").submit();
    
    this.disableBody();
  }
}
