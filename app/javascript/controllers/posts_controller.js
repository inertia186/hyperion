import { Controller } from '@hotwired/stimulus'

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
      this.diffBodyTarget.innerHTML = `<div class="alert alert-danger">${this.escapeHtml(error.message || 'Diff failed to load.')}</div>`;
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
      this.diffBodyTarget.innerHTML = this.renderCodeRevision(revisions[0]);
      return;
    }

    var pairCount = revisions.length - 1;
    var pairIndex = selectedIndex === null || isNaN(selectedIndex) ? pairCount - 1 : selectedIndex;
    pairIndex = Math.min(Math.max(pairIndex, 0), pairCount - 1);

    if (pairCount > 1) {
      this.diffPairTarget.innerHTML = `<select class="custom-select custom-select-sm w-auto" data-action="posts#diffPairChanged">${Array.from({length: pairCount}, (_item, index) => {
        var selected = index === pairIndex ? ' selected' : '';
        return `<option value="${index}"${selected}>${this.escapeHtml(revisions[index].label)} -&gt; ${this.escapeHtml(revisions[index + 1].label)}</option>`;
      }).join('')}</select>`;
    } else {
      this.diffPairTarget.innerHTML = '';
    }

    this.diffBodyTarget.innerHTML = this.renderCodeDiff(revisions[pairIndex], revisions[pairIndex + 1]);
  }

  renderCodeRevision(revision) {
    return `
      <section class="border rounded bg-dark text-light">
        <pre class="m-0 p-3 overflow-auto" style="max-height: 65vh;"><code>${this.escapeHtml(revision.body || '')}</code></pre>
      </section>
    `;
  }

  renderCodeDiff(previousRevision, currentRevision) {
    var rows = this.lineDiff(previousRevision.body || '', currentRevision.body || '').map((line) => {
      var rowClass = line.type === 'added' ? 'bg-success text-white' : line.type === 'removed' ? 'bg-danger text-white' : 'text-light';
      return `<div class="d-flex ${rowClass}"><span class="text-right text-monospace px-2 text-muted" style="width: 4rem;">${line.number || ''}</span><code class="text-monospace flex-fill px-2" style="white-space: pre-wrap;">${this.escapeHtml(line.prefix + line.text)}</code></div>`;
    }).join('');

    return `
      <section class="border rounded bg-dark overflow-hidden">
        <div class="row no-gutters border-bottom border-secondary text-light small">
          <div class="col-sm-6 border-right border-secondary p-2">
            <strong>${this.escapeHtml(previousRevision.label || 'Before')}</strong>
            <div class="text-muted">${this.escapeHtml(this.revisionDetail(previousRevision))}</div>
          </div>
          <div class="col-sm-6 p-2">
            <strong>${this.escapeHtml(currentRevision.label || 'After')}</strong>
            <div class="text-muted">${this.escapeHtml(this.revisionDetail(currentRevision))}</div>
          </div>
        </div>
        <div class="overflow-auto" style="max-height: 65vh;">${rows}</div>
      </section>
    `;
  }

  lineDiff(before, after) {
    var beforeLines = before.split(/\r?\n/);
    var afterLines = after.split(/\r?\n/);
    var table = Array.from({length: beforeLines.length + 1}, () => Array(afterLines.length + 1).fill(0));

    for (var i = beforeLines.length - 1; i >= 0; i--) {
      for (var j = afterLines.length - 1; j >= 0; j--) {
        table[i][j] = beforeLines[i] === afterLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    var diff = [];
    i = 0;
    j = 0;
    while (i < beforeLines.length && j < afterLines.length) {
      if (beforeLines[i] === afterLines[j]) {
        diff.push({type: 'same', prefix: ' ', text: beforeLines[i], number: j + 1});
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1});
        i++;
      } else {
        diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1});
        j++;
      }
    }

    while (i < beforeLines.length) {
      diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1});
      i++;
    }

    while (j < afterLines.length) {
      diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1});
      j++;
    }

    return diff;
  }

  revisionDetail(revision) {
    var parts = [];
    if (revision.published_at) parts.push(revision.published_at);
    if (revision.block_num) parts.push(`block ${revision.block_num}`);
    return parts.length > 0 ? parts.join(' · ') : 'No chain metadata';
  }

  escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
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
