import { Controller } from 'stimulus'

var firstLink;
var bindingPreviewDismissKey;
var bindingPreviewDismissOutsideModal;
var bindingPreviewPreviousKey;
var bindingPreviewNextKey;

export default class extends Controller {
  static values = {
    id: String,
    author: String,
    permlink: String
  }
  static targets = ['pendingPayout', 'preview', 'previewVoteCount', 'previewReplyCount', 'previewPendingPayout']
  
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
  
  previewShow(e) {
    e.preventDefault();
    
    this.previewShowModal();
  }
  
  previewShowModal() {
    var preview = this.previewTarget;
    var iframe = $(`#preview-${this.idValue} iframe`);
    
    iframe.attr('src', iframe.data('src'));
    
    // simulate bs preview.modal('show')
    document.body.classList.add('modal-open');
    document.body.classList.add('modal-backdrop');
    preview.style.display = 'block';
    preview.classList.add('show');
    
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
    
    document.body.classList.remove('modal-open');
    document.body.classList.remove('modal-backdrop');
    preview.style.display = 'none';
    preview.classList.remove('show');
    
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
