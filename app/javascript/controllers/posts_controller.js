import { Controller } from 'stimulus'

import $ from 'jquery';

var firstLink;
var bindingPreviewDismissKey;
var bindingPreviewDismissOutsideModal;
var bindingPreviewPreviousKey;
var bindingPreviewNextKey;
var bindingMarkAsReadAndPreviewPreviousKey;
var bindingMarkAsReadAndPreviewNextKey;
var bindingFocusPreviousKey;
var bindingFocusNextKey;
var bindingScrollKey;

export default class extends Controller {
  static values = {
    id: String,
    author: String,
    permlink: String
  }
  static targets = ['row', 'pendingPayout', 'preview', 'previewVoteCount', 'previewReplyCount', 'previewPendingPayout']
  
  connect() {
    this.refreshPendingPayout(this.pendingPayoutTarget);
    
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
    
    this.refrestVoteCount();
    this.refrestReplyCount();
    this.refreshPendingPayout(this.previewPendingPayoutTarget);
    
    bindingScrollKey = this.scrollKey.bind(this);
    document.addEventListener('keydown', bindingScrollKey);
    
    bindingPreviewDismissKey = this.previewDismissKey.bind(this);
    document.addEventListener('keydown', bindingPreviewDismissKey);
    
    bindingPreviewPreviousKey = this.previewPreviousKey.bind(this);
    document.addEventListener('keydown', bindingPreviewPreviousKey);
    
    bindingPreviewNextKey = this.previewNextKey.bind(this);
    document.addEventListener('keydown', bindingPreviewNextKey);
    
    bindingMarkAsReadAndPreviewPreviousKey = this.markAsReadAndPreviewPreviousKey.bind(this);
    document.addEventListener('keydown', bindingMarkAsReadAndPreviewPreviousKey);
    
    bindingMarkAsReadAndPreviewNextKey = this.markAsReadAndPreviewNextKey.bind(this);
    document.addEventListener('keydown', bindingMarkAsReadAndPreviewNextKey);
    
    bindingPreviewDismissOutsideModal = this.previewDismissOutsideModal.bind(this);
    document.addEventListener('click', bindingPreviewDismissOutsideModal);
  }
  
  previewPrevious(e) {
    var element = $(this.element);
    var previous_element = element.prev();
    var previous_post_id = previous_element.data('posts-id-value');
    var previous_link = document.getElementById(`#show-${previous_post_id}`);
    
    if ( !!previous_link ) {
      previous_link.focus();
      previous_link.click();
    }
  }
  
  previewNext(e) {
    var element = $(this.element);
    var next_element = element.next();
    var next_post_id = next_element.data('posts-id-value');
    var next_link = document.getElementById(`#show-${next_post_id}`);
    
    if ( !!next_link ) {
      next_link.focus();
      next_link.click();
    }
  }
  
  focusPrevious(e) {
    var element = $(this.element);
    var previous_element = element.prev();
    var previous_post_id = previous_element.data('posts-id-value');
    var previous_link = document.getElementById(`#show-${previous_post_id}`);
    
    if ( !!previous_link ) {
      previous_link.focus();
    }
  }
  
  focusCurrent(e) {
    var element = $(this.element);
    var post_id = element.data('posts-id-value');
    var link = document.getElementById(`#show-${post_id}`);
    
    if ( !!link ) {
      link.focus();
    }
  }
  
  focusNext(e) {
    var element = $(this.element);
    var next_element = element.next();
    var next_post_id = next_element.data('posts-id-value');
    var next_link = document.getElementById(`#show-${next_post_id}`);
    
    if ( !!next_link ) {
      next_link.focus();
    }
  }
  
  previewPreviousKey(e) {
    if ( e.keyCode == 37 // left
      || e.keyCode == 72 // h
      || e.keyCode == 74 // j
      || e.keyCode == 38 // up
    ) {
      this.previewDismiss(e);
      this.previewPrevious(e);
    }
  }
  
  previewNextKey(e) {
    if ( e.keyCode == 76 // l
      || e.keyCode == 39 // right
      || e.keyCode == 40 // down
      || e.keyCode == 74 // j
    ) {
      this.previewDismiss(e);
      this.previewNext(e);
    }
  }
  
  markAsReadAndPreviewPreviousKey(e) {
    if ( e.shiftKey && e.keyCode == 188 ) { // < (shift + ,)
      this.previewDismiss(e);
      this.markRowAsRead(e);
      this.previewPrevious(e);
    }
  }
  
  markAsReadAndPreviewNextKey(e) {
    if ( e.shiftKey && e.keyCode == 190 ) { // > (shift + .)
      this.previewDismiss(e);
      this.markRowAsRead(e);
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
  
  scrollKey(e) {
    if ( e.keyCode == 32 // space
      || e.keyCode == 33 // page-up
      || e.keyCode == 34 // page-down
    ) {
      var iframe = $(`#preview-${this.idValue} iframe`);
      
      // Paging down.
      if ( ( e.keyCode == 32 && !e.shiftKey ) || e.keyCode == 34 ) {
        var top = iframe.contents().scrollTop();
        iframe.contents().scrollTop(top + 150);
        
        if ( top == iframe.contents().scrollTop() ) {
          // at the bottom
          this.previewDismiss();
          this.previewNext();
        }
      }
      
      // Paging up.
      if ( ( e.keyCode == 32 && e.shiftKey ) || e.keyCode == 33 ) {
        var top = iframe.contents().scrollTop();
        iframe.contents().scrollTop(top - 150);
        
        if ( top == iframe.contents().scrollTop() ) {
          // at the top
          this.previewDismiss();
          this.previewPrevious();
        }
      }
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
    
    document.removeEventListener('keydown', bindingScrollKey);
    document.removeEventListener('keydown', bindingPreviewDismissKey);
    document.removeEventListener('keydown', bindingPreviewPreviousKey);
    document.removeEventListener('keydown', bindingPreviewNextKey);
    document.removeEventListener('keydown', bindingMarkAsReadAndPreviewPreviousKey);
    document.removeEventListener('keydown', bindingMarkAsReadAndPreviewNextKey);
    document.removeEventListener('click', bindingPreviewDismissOutsideModal);
  }
  
  markRowAsRead(e) {
    var element = $(this.element);
    var post_id = element.data('posts-id-value');
    var link = document.getElementById(`#mark-as-read-${post_id}`);
    
    if ( !!link ) {
      link.click();
    }
  }
  
  markRowAsUnread(e) {
    var element = $(this.element);
    var post_id = element.data('posts-id-value');
    var link = document.getElementById(`#mark-as-unread-${post_id}`);
    
    if ( !!link ) {
      link.click();
    }
  }
  
  // Also see posts#mark_as_read.js.erb
  successMarkAsRead(e) {
    var row = $(`#${this.idValue}`);
  }
  
  // Also see posts#mark_as_read.js.erb
  successMarkAsUnread(e) {
    var row = $(`#${this.idValue}`);
    
    row.fadeTo(100, 0.3, function() { $(this).fadeTo(500, 1.0); });
  }
  
  refrestVoteCount() {
    var voteCount = this.previewVoteCountTarget;
    
    hive.api.getActiveVotes(this.authorValue, this.permlinkValue, function(err, response) {
      if ( !!err ) console.log(preview, err);
  
      if ( !!response ) {
        var upvotes = 0;
        
        for ( var i = 0 ; i < response.length; i++ ) {
          var voteCast = false;
          if ( response[i].voter == $('#current-account').data('name') ) {
            voteCount.classList.remove('badge-secondary');
            voteCast = true;
          }
          
          if ( response[i].percent > 0 ) {
            upvotes++;
            
            if ( voteCast ) {
              voteCount.classList.add('badge-success');
            }
          }
          
          if ( response[i].percent < 0 && voteCast ) {
            voteCount.classList.add('badge-danger');
          }
        }
  
        voteCount.textContent = 'Votes: ' + upvotes;
      }
    });
  }
  
  refrestReplyCount() {
    var replyCount = this.previewReplyCountTarget;
    
    replyCount.innerHTML = '<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">Replies: 0</span>';
    
    hive.api.getContentReplies(this.authorValue, this.permlinkValue, function(err, response) {
      if ( !!err ) console.log(preview, err);
  
      if ( !!response ) {
        replyCount.textContent = 'Replies: ' + response.length;
      }
    });
  }
  
  refreshPendingPayout(pendingPayout) {
    hive.api.getContent(this.authorValue, this.permlinkValue, function(err, response) {
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
  
  changeUpvote(e) {
    $(`#upvote-${this.idValue} .upvote-percent`).html($(e.target).val() + ' %');
  }
  
  changeDownvote(e) {
    $(`#downvote-${this.idValue} .downvote-percent`).html(-parseInt($(e.target).val()) + ' %');
  }
  
  upvote(e) {
    var voter = $('#current-account').data('name');
    var weight = parseInt($(`#upvote-${this.idValue} input`).val()) * 100;
    var label = $(e.target);
    
    label.html('<span class="spinner-border" style="height: 24px; width: 24px" />');
    
    if ( !!hivesignerAccessToken ) {
      window.open(`https://hivesigner.com/sign/vote?authority=post&voter=${voter}&author=${this.authorValue}&permlink=${this.permlinkValue}&weight=${weight}`)
      window.addEventListener('focus', () => {
        this.refreshPostDetails(e, 3000);
        $(`#upvote-${this.idValue}`).modal('hide');
        label.html('Vote');
      });
    } else {
      hive_keychain.requestVote(voter, this.permlinkValue, this.authorValue, weight, (response) => {
        this.refreshPostDetails(e, 10000);
        $(`#upvote-${this.idValue}`).modal('hide');
        label.html('Vote');
      });
    }
  }

  downvote(e) {
    var voter = $('#current-account').data('name');
    var weight = parseInt($(`#downvote-${this.idValue} input`).val()) * 100;
    var label = $(e.target);
    
    label.html('<span class="spinner-border" style="height: 24px; width: 24px" />');
    
    if ( !!hivesignerAccessToken ) {
      window.open(`https://hivesigner.com/sign/vote?authority=post&voter=${voter}&author=${this.authorValue}&permlink=${this.permlinkValue}&weight=${-weight}`)
      this.refreshPostDetails(e, 3000);
      $(`#downvote-${this.idValue}`).modal('hide');
      label.html('Vote');
    } else {
      hive_keychain.requestVote(voter, this.permlinkValue, this.authorValue, -weight, (response) => {
        this.refreshPostDetails(e, 10000);
        $(`#downvote-${this.idValue}`).modal('hide');
        label.html('Vote');
      });
    }
  }
  
  refreshPostDetails(e, timeout) {
    this.previewVoteCountTarget.innerHTML = '<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">Votes: 0</span>';
    this.previewPendingPayoutTarget.innerHTML = '<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">00.000 HBD</span>';
    
    window.addEventListener('focus', () => {
      setTimeout(() => {
        this.refrestVoteCount();
        this.refreshPendingPayout(this.pendingPayoutTarget);
        this.refreshPendingPayout(this.previewPendingPayoutTarget);
      }, timeout);
    });
  }
}
