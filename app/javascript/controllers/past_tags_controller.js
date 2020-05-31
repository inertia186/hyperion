import { Controller } from 'stimulus'

import $ from 'jquery';
import Rails from "@rails/ujs";

export default class extends Controller {
  static values = {
    tag: String
  }
  static targets = ['pastTag']
  
  successFavorite(e) {
    $(e.target).parent().children('a:hidden').show();
    $(e.target).hide();
  }
  
  removeTag(e) {
    $(e.target).parent().parent().hide();
  }
}
