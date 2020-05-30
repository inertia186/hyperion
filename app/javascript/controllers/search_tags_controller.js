import { Controller } from "stimulus"

import $ from 'jquery';
import 'select2'
import 'select2/dist/css/select2.css'

import Select2 from 'select2'
import Rails from "@rails/ujs";

export default class extends Controller {
  static values = {
    tagsSearchPath: String
  }
  connect() {
    $('.search-tags').select2({
      tags: true,
      tokenSeparators: [',', ' ']
    });
    
    $('.search-tags').on('keypress', function (e) {
      if (e.keyCode === 13) {
        $(this).closest('form').submit();
      }
    });
    
    // Use this is we want to capture changes.
    // $('.search-tags').on('select2:select', function () {
    //   let event = new Event('change', { bubbles: true }) // fire a native event
    //   this.dispatchEvent(event);
    // });
  }
  
  updateToTagOptions() {
  }
  
  tagSearch() {
    console.log('tagSearch', this);
    // Rails.ajax({
    //   type: 'get',
    //   url: this.tagsSearchPath,
    //   data: new FormData(this.element)
    // });
  }
}
