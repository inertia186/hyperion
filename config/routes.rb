Rails.application.routes.draw do
  resources :sessions, only: %i(new create destroy) do
    member do
      get :authorized
    end
  end
  
  resources :posts, only: %i(index) do
    collection do
      patch :clear_read
      patch :clear_past_tags
      patch :mark_all_as_read
      patch :ignore_all
      patch :clear_ignored_tags
      patch :toggle_mutes
      get :content_loading
    end
    
    member do
      patch :mark_as_read
      patch :mark_as_unread
      get :content_sandbox
    end
  end
  
  root to: 'posts#index'
end
