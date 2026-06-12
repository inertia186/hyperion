import { Controller } from '@hotwired/stimulus'
import { diffPairOptions, escapeHtml, normalizePairIndex, renderCodeDiff, renderCodeRevision } from './posts_diff'
import {
  isFocusNextKey,
  isFocusPreviousKey,
  isMarkReadAndPreviewNextKey,
  isMarkReadAndPreviewPreviousKey,
  isPreviewDismissKey,
  isPreviewNextKey,
  isPreviewPreviousKey,
  isPreviewScrollKey,
  isScrollDownKey,
  isScrollUpKey
} from './posts_keyboard'
import { adjacentPostActionLink, focusAndClickLink, focusLink, postActionLink } from './posts_navigation'
import { bindPreviewListeners, clearPreviewIframe, isPreviewBackdropClick, loadPreviewIframe, unbindPreviewListeners } from './posts_preview'
import { refreshPendingPayout, refreshReplyCount, refreshVoteCount } from './posts_details'

import $ from 'jquery';

var firstLink;
var bindingFocusPreviousKey;
var bindingFocusNextKey;

export default class extends Controller {
  static values = {
    id: String,
    author: String,
    permlink: String
  }
  static targets = ['row', 'pendingPayout', 'preview', 'previewVoteCount', 'previewReplyCount', 'previewPendingPayout', 'diffModal', 'diffBody', 'diffPair']
  
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
    loadPreviewIframe($, this.idValue);
    
    $(preview).modal('show');
    
    this.refrestVoteCount();
    this.refrestReplyCount();
    this.refreshPendingPayout(this.previewPendingPayoutTarget);
    
    this.previewBindings = bindPreviewListeners(document, this);
  }
  
  previewPrevious(e) {
    focusAndClickLink(adjacentPostActionLink(this.element, -1, 'show'));
  }
  
  previewNext(e) {
    focusAndClickLink(adjacentPostActionLink(this.element, 1, 'show'));
  }
  
  focusPrevious(e) {
    focusLink(adjacentPostActionLink(this.element, -1, 'show'));
  }
  
  focusCurrent(e) {
    focusLink(postActionLink(this.element, 'show'));
  }
  
  focusNext(e) {
    focusLink(adjacentPostActionLink(this.element, 1, 'show'));
  }
  
  previewPreviousKey(e) {
    if (isPreviewPreviousKey(e)) {
      this.previewDismiss(e);
      this.previewPrevious(e);
    }
  }
  
  previewNextKey(e) {
    if (isPreviewNextKey(e)) {
      this.previewDismiss(e);
      this.previewNext(e);
    }
  }
  
  markAsReadAndPreviewPreviousKey(e) {
    if (isMarkReadAndPreviewPreviousKey(e)) {
      this.previewDismiss(e);
      this.markRowAsRead(e);
      this.previewPrevious(e);
    }
  }
  
  markAsReadAndPreviewNextKey(e) {
    if (isMarkReadAndPreviewNextKey(e)) {
      this.previewDismiss(e);
      this.markRowAsRead(e);
      this.previewNext(e);
    }
  }
  
  focusPreviousKey(e) {
    if (isFocusPreviousKey(e)) {
      this.focusPrevious(e);
    }
  }
  
  focusNextKey(e) {
    if (isFocusNextKey(e)) {
      this.focusNext(e);
    }
  }
  
  // https://discourse.stimulusjs.org/t/add-and-remove-eventlisteners/710/2
  previewDismissKey(e) {
    if (isPreviewDismissKey(e)) {
      e.preventDefault();
      this.previewDismiss(e);
    }
  }
  
  scrollKey(e) {
    if (isPreviewScrollKey(e)) {
      var iframe = $(`#preview-${this.idValue} iframe`);
      
      // Paging down.
      if (isScrollDownKey(e)) {
        var top = iframe.contents().scrollTop();
        iframe.contents().scrollTop(top + 150);
        
        if ( top == iframe.contents().scrollTop() ) {
          // at the bottom
          this.previewDismiss();
          this.previewNext();
        }
      }
      
      // Paging up.
      if (isScrollUpKey(e)) {
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
    if (isPreviewBackdropClick(e, this.idValue)) {
      e.preventDefault();
      this.previewDismiss(e);
    }
  }
    
  previewDismiss(e) {
    var preview = this.previewTarget;
    clearPreviewIframe($, this.idValue);
    
    $(preview).modal('hide');
    unbindPreviewListeners(document, this.previewBindings);
    this.previewBindings = null;
  }

  diffShow(e) {
    e.preventDefault();

    this.diffBodyTarget.innerHTML = '<div class="alert alert-secondary">Loading revisions...</div>';
    this.diffPairTarget.innerHTML = '';
    $(this.diffModalTarget).modal('show');

    fetch(`/api/v1/posts/${this.idValue}/revisions`, {
      credentials: 'same-origin',
      headers: {Accept: 'application/json'}
    }).then((response) => response.json().then((payload) => {
      if (!response.ok) throw new Error(payload.error || response.statusText);
      this.renderDiff(payload.revisions || []);
    })).catch((error) => {
      this.diffBodyTarget.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Diff failed to load.')}</div>`;
    });
  }

  diffPairChanged(e) {
    this.renderDiff(this.currentDiffRevisions || [], parseInt(e.target.value));
  }

  renderDiff(revisions, selectedIndex = null) {
    this.currentDiffRevisions = revisions;

    if (revisions.length === 0) {
      this.diffPairTarget.innerHTML = '';
      this.diffBodyTarget.innerHTML = '<div class="alert alert-secondary">No revisions were found for this post.</div>';
      return;
    }

    if (revisions.length === 1) {
      this.diffPairTarget.innerHTML = '';
      this.diffBodyTarget.innerHTML = renderCodeRevision(revisions[0]);
      return;
    }

    var pairCount = revisions.length - 1;
    var pairIndex = normalizePairIndex(revisions, selectedIndex);

    this.diffPairTarget.innerHTML = diffPairOptions(revisions, pairIndex);

    this.diffBodyTarget.innerHTML = renderCodeDiff(revisions[pairIndex], revisions[pairIndex + 1]);
  }
  
  markRowAsRead(e) {
    const link = postActionLink(this.element, 'mark-as-read');
    if (link) link.click();
  }
  
  markRowAsUnread(e) {
    const link = postActionLink(this.element, 'mark-as-unread');
    if (link) link.click();
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
    refreshVoteCount({
      hiveApi: hive.api,
      voteCount: this.previewVoteCountTarget,
      author: this.authorValue,
      permlink: this.permlinkValue,
      currentAccountName: $('#current-account').data('name')
    });
  }
  
  refrestReplyCount() {
    refreshReplyCount({
      hiveApi: hive.api,
      replyCount: this.previewReplyCountTarget,
      author: this.authorValue,
      permlink: this.permlinkValue
    });
  }
  
  refreshPendingPayout(pendingPayout) {
    refreshPendingPayout({
      hiveApi: hive.api,
      pendingPayout,
      author: this.authorValue,
      permlink: this.permlinkValue
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
