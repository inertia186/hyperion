import { Controller } from 'stimulus'

import $ from 'jquery';

var firstLink;
var bindingPreviewDismissKey;
var bindingPreviewDismissOutsideModal;
var bindingPreviewPreviousKey;
var bindingPreviewNextKey;
var bindingFocusPreviousKey;
var bindingFocusNextKey;

export default class extends Controller {
  static values = {
    id: String,
    author: String,
    permlink: String
  }
  static targets = ['row', 'pendingPayout', 'preview', 'previewVoteCount', 'previewReplyCount', 'previewPendingPayout']
  
  connect() {
    var pendingPayout = this.pendingPayoutTarget;
    
    updatePendingPayout(pendingPayout, this.authorValue, this.permlinkValue);
    
    var element = $(this.element);
    var link = document.getElementById(`#show-${this.idValue}`);
    
    if ( !!link && !firstLink ) {
      firstLink = link
      firstLink.focus();
    }
  }
  
  disconnect() {
    if ( !!firstLink ) {
      firstLink.blur();
      firstLink = null;
    }
  }
  
  focusRowIn(e) {
    var row = $(`#${this.idValue}`);
    
    row.addClass('table-secondary');
    
    bindingFocusPreviousKey = this.focusPreviousKey.bind(this);
    document.addEventListener('keydown', bindingFocusPreviousKey);

    bindingFocusNextKey = this.focusNextKey.bind(this);
    document.addEventListener('keydown', bindingFocusNextKey);
    
    if ( e.target.title == 'Mark as Read' ) {
      this.focusCurrent(e);
    }
  }
  
  focusRowOut(e) {
    var row = $(`#${this.idValue}`);
    
    row.removeClass('table-secondary');
    
    document.removeEventListener('keydown', bindingFocusPreviousKey);
    document.removeEventListener('keydown', bindingFocusNextKey);
  }
  
  previewShow(e) {
    e.preventDefault();
    
    this.previewShowModal();
  }
  
  previewShowModal() {
    var preview = this.previewTarget;
    var iframe = $(`#preview-${this.idValue} iframe`);
    
    iframe.attr('src', iframe.data('src'));
    
    $(preview).modal('show');
    
    var voteCount = this.previewVoteCountTarget;
    hive.api.getActiveVotes(this.authorValue, this.permlinkValue, function(err, response) {
      if ( !!err ) console.log(preview, err);
  
      if ( !!response ) {
        var upvotes = 0;
        
        for ( var i = 0 ; i < response.length; i++ ) {
          if ( response[i].percent > 0 ) upvotes++;
        }
  
        voteCount.textContent = 'Votes: ' + upvotes;
      }
    });
    
    var replyCount = this.previewReplyCountTarget;
    hive.api.getContentReplies(this.authorValue, this.permlinkValue, function(err, response) {
      if ( !!err ) console.log(preview, err);
  
      if ( !!response ) {
        replyCount.textContent = 'Replies: ' + response.length;
      }
    });
    
    var pendingPayout = this.previewPendingPayoutTarget;
    updatePendingPayout(pendingPayout, this.authorValue, this.permlinkValue);
    
    bindingPreviewDismissKey = this.previewDismissKey.bind(this);
    document.addEventListener('keydown', bindingPreviewDismissKey);
    
    bindingPreviewPreviousKey = this.previewPreviousKey.bind(this);
    document.addEventListener('keydown', bindingPreviewPreviousKey);
    
    bindingPreviewNextKey = this.previewNextKey.bind(this);
    document.addEventListener('keydown', bindingPreviewNextKey);
    
    bindingPreviewDismissOutsideModal = this.previewDismissOutsideModal.bind(this);
    document.addEventListener('click', bindingPreviewDismissOutsideModal);
  }
  
  previewPrevious(e) {
    var element = $(this.element);
    var previous_element = element.prev();
    var previous_post_id = previous_element.data('post-id-value');
    var previous_link = document.getElementById(`#show-${previous_post_id}`);
    
    if ( !!previous_link ) {
      previous_link.focus();
      previous_link.click();
    }
  }
  
  previewNext(e) {
    var element = $(this.element);
    var next_element = element.next();
    var next_post_id = next_element.data('post-id-value');
    var next_link = document.getElementById(`#show-${next_post_id}`);
    
    if ( !!next_link ) {
      next_link.focus();
      next_link.click();
    }
  }
  
  focusPrevious(e) {
    var element = $(this.element);
    var previous_element = element.prev();
    var previous_post_id = previous_element.data('post-id-value');
    var previous_link = document.getElementById(`#show-${previous_post_id}`);
    
    if ( !!previous_link ) {
      previous_link.focus();
    }
  }
  
  focusCurrent(e) {
    var element = $(this.element);
    var post_id = element.data('post-id-value');
    var link = document.getElementById(`#show-${post_id}`);
    
    if ( !!link ) {
      link.focus();
    }
  }
  
  focusNext(e) {
    var element = $(this.element);
    var next_element = element.next();
    var next_post_id = next_element.data('post-id-value');
    var next_link = document.getElementById(`#show-${next_post_id}`);
    
    if ( !!next_link ) {
      next_link.focus();
    }
  }
  
  previewPreviousKey(e) {
    if ( e.keyCode == 37 // left
      || e.keyCode == 72 // h
    ) {
      this.previewDismiss(e);
      this.previewPrevious(e);
    }
  }
  
  previewNextKey(e) {
    if ( e.keyCode == 76 // l
      || e.keyCode == 39 // right
    ) {
      this.previewDismiss(e);
      this.previewNext(e);
    }
  }
  
  focusPreviousKey(e) {
    if ( e.keyCode == 38 // up
      || e.keyCode == 75 // k
    ) {
      this.focusPrevious(e);
    }
  }
  
  focusNextKey(e) {
    if ( e.keyCode == 74 // j
      || e.keyCode == 40 // down
    ) {
      this.focusNext(e);
    }
  }
  
  // https://discourse.stimulusjs.org/t/add-and-remove-eventlisteners/710/2
  previewDismissKey(e) {
    if ( e.keyCode == 27 // esc
      || e.keyCode == 13 // enter
    ) {
      e.preventDefault();
      this.previewDismiss(e);
    }
  }
  
  // https://discourse.stimulusjs.org/t/hide-a-popup-on-clicking-outside-the-popup-area/67/5
  previewDismissOutsideModal(e) {
    // Clicked outside the modal (how you'd expect it to work, but bs gets in
    // the way.).
    // if (!this.element.contains(e.target)) {
    //   e.preventDefault();
    //   this.previewDismiss(e);
    // }
    
    // Clicked directly on the related div.modal (thanks, bs).
    if (e.target.id == `preview-${this.idValue}`) {
      e.preventDefault();
      this.previewDismiss(e);
    }
  }
    
  previewDismiss(e) {
    var preview = this.previewTarget;
    var iframe = $(`#preview-${this.idValue} iframe`);
    
    iframe.attr('src', 'about:blank');
    
    $(preview).modal('hide');
    
    document.removeEventListener('keydown', bindingPreviewDismissKey);
    document.removeEventListener('keydown', bindingPreviewPreviousKey);
    document.removeEventListener('keydown', bindingPreviewNextKey);
    document.removeEventListener('click', bindingPreviewDismissOutsideModal);
  }
}

function updatePendingPayout(pendingPayout, author, permlink) {
  pendingPayout.innerHTML = '<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">00.000 HBD</span>';

  hive.api.getContent(author, permlink, function(err, response) {
    if ( !!err ) console.log(pendingPayout, err);
    
    if ( !!response ) {
      if ( response.cashout_time == '1969-12-31T23:59:59' ) {
        // Just in case we're showing a post that has already paid.
        pendingPayout.textContent = response.total_payout_value;
      } else {
        pendingPayout.textContent = response.pending_payout_value;
      }
    }
  });
}
