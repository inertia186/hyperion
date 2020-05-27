// This file is automatically compiled by Webpack, along with any other files
// present in this directory. You're encouraged to place your actual application logic in
// a relevant structure within app/javascript and only use these pack files to reference
// that code so it'll be compiled.

require('@rails/ujs').start()
require('turbolinks').start()
require('@rails/activestorage').start()
require('channels')
require('jquery')
require('lazyload')
require('bootstrap')

// Uncomment to copy all static images under ../images to the output folder and reference
// them with the image_pack_tag helper in views (e.g <%= image_pack_tag 'rails.png' %>)
// or the `imagePath` JavaScript helper below.
//
// const images = require.context('../images', true)
// const imagePath = (name) => images(name, true)

document.addEventListener("turbolinks:load", () => {
  $('img.lazyload').lazyload();
  // $('[data-toggle="tooltip"]').tooltip();
  
  // https://getbootstrap.com/docs/4.5/getting-started/javascript/#programmatic-api
  // $('[data-what="post-preview"]').on('shown.bs.collapse', function () {
  //   alert('hello');
  // });
  
  $('[data-toggle="modal"]').click(function() {
    modal_target = $(this).data('target')
    iframe = $(modal_target + ' iframe');
    iframe.attr('src', iframe.data('src'));
    
    $(modal_target + ' [data-what="vote-count"]').each(function() {
      var elem = $(this);
      
      hive.api.getActiveVotes(elem.data('author'), elem.data('permlink'), function(err, response) {
        if ( !!err ) console.log(elem, err);
        
        if ( !!response ) {
          upvotes = 0
          for ( i = 0 ; i < response.length; i++ ) {
            if ( response[i].percent > 0 ) upvotes++;
          }
          
          elem.text('Votes: ' + upvotes);
        }
      });
    });
    
    $(modal_target + ' [data-what="reply-count"]').each(function() {
      var elem = $(this);
      
      hive.api.getContentReplies(elem.data('author'), elem.data('permlink'), function(err, response) {
        if ( !!err ) console.log(elem, err);
        
        if ( !!response ) {
          elem.text('Replies: ' + response.length);
        }
      });
    });
  });
  
  $('[data-what="pending-payout"]').each(function() {
    var elem = $(this);
  
    elem.html('<span class="spinner-grow spinner-grow-sm align-middle" style="height: 1px; width: 100%" /><span style="opacity: 0;">00.000 HBD</span>');
  
    hive.api.getContent(elem.data('author'), elem.data('permlink'), function(err, response) {
      if ( !!err ) console.log(elem, err);
  
      if ( !!response ) {
        if ( response.cashout_time == '1969-12-31T23:59:59' ) {
          elem.text(response.total_payout_value);
        } else {
          elem.text(response.pending_payout_value);
        }
      }
    });
  });
});
