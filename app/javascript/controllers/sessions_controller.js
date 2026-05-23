import { Controller } from '@hotwired/stimulus'

import $ from 'jquery';

export default class extends Controller {
  connect() {
    $(':input:first').focus();
  }
  
  beginLogin() {
    $('input').prop('readonly', true);
  }
}
