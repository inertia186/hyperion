import { Controller } from "@hotwired/stimulus"

const $ = window.jQuery

export default class extends Controller {
  static values = {
    tagsSearchPath: String
  }
  
  initialize() {
    $('.search-tags').select2({
      tags: true,
      tokenSeparators: [',', ' ']
    });
  }
  
  connect() {
    $('.search-tags').on('keypress', function (e) {
      if (e.keyCode === 13) {
        $(e.target).closest('form').submit();
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
