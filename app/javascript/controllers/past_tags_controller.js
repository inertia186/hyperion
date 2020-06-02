import { Controller } from 'stimulus'

import $ from 'jquery';
import Rails from "@rails/ujs";

export default class extends Controller {
  static values = {
    tag: String,
    tagCount: String
  }
  
  successFavorite(e) {
    $(e.target).parent().children('a:hidden').show();
    $(e.target).hide();
  }
  
  removeTag(e) {
    $(e.target).parent().parent().hide();
  }
  
  refreshTags(e) {
    var counts = $('[data-tag-count-url]');
    
    counts.each(function() {
      var tagCount = $(this);
      
      Rails.ajax({
        type: 'get',
        url: tagCount.data('tag-count-url'),
        success: (result) => {
          tagCount.text(result.count);
        }
      });
    });
  }
}
