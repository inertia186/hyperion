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
      patch :toggle_only_favorite_tags
      get :content_loading
      get :new_saved_query
      post :create_saved_query
    end
    
    member do
      patch :mark_as_read
      patch :mark_as_unread
      delete :clear_past_tag
      get :content_sandbox
    end
  end
  
  resources :tags do
    member do
      post :create_favorite
      post :create_ignored
      post :create_past
      post :create_poisoned_pill
      delete :destroy_favorite
      delete :destroy_ignored
      delete :destroy_past
      delete :destroy_poisoned_pill
      
      get :unread_count
    end
  end
  
  get '/posts/:tag(/:sort)(/:limit)', to: 'posts#index', as: :posts_tagged
  get '/posts/@:author(/:sort)(/:limit)', to: 'posts#index', as: :posts_authored, constraints: { account: /([^\/])+/ }
  
  get '/tags/:type(/:sort)(/:limit)', to: 'tags#index', as: :tags_by_type
  
  root to: 'posts#index'
end
