Rails.application.routes.draw do
  get '/.well-known/healthcheck.json', to: 'healthcheck#show', defaults: {format: :json}

  namespace :api do
    namespace :v1 do
      resource :session, only: :show

      resources :posts, only: %i(index show) do
        member do
          get :revisions
          patch :read, action: :mark_read
          delete :read, action: :mark_unread
        end

        collection do
          patch :read, action: :mark_many_read
        end
      end

      post '/tags/:tag/ignored', to: 'tags#create_ignored', as: :tag_ignored, constraints: { tag: /[^\/]+/ }, format: false
      delete '/tags/:tag/ignored', to: 'tags#destroy_ignored', constraints: { tag: /[^\/]+/ }, format: false
      post '/tags/:tag/poisoned_pill', to: 'tags#create_poisoned_pill', as: :tag_poisoned_pill, constraints: { tag: /[^\/]+/ }, format: false
      delete '/tags/:tag/poisoned_pill', to: 'tags#destroy_poisoned_pill', constraints: { tag: /[^\/]+/ }, format: false
      post '/tags/:tag/favorite', to: 'tags#create_favorite', as: :tag_favorite, constraints: { tag: /[^\/]+/ }, format: false
      delete '/tags/:tag/favorite', to: 'tags#destroy_favorite', constraints: { tag: /[^\/]+/ }, format: false
      delete '/past_tags/:tag', to: 'tags#destroy_past', as: :past_tag, constraints: { tag: /[^\/]+/ }, format: false
      delete '/past_tags', to: 'tags#destroy_past_tags'
      delete '/ignored_tags', to: 'tags#destroy_ignored_tags'

      patch '/preferences/mute', to: 'preferences#mute'
      patch '/preferences/only_favorite_tags', to: 'preferences#only_favorite_tags'
      patch '/preferences/blacklists', to: 'preferences#blacklists'
      patch '/preferences/theme', to: 'preferences#theme'
      patch '/preferences/minimum_reputation', to: 'preferences#minimum_reputation'
    end
  end

  resources :sessions, only: %i(new create destroy) do
    collection do
      get :authorized # hivesigner
    end
    
    member do
      get :authorized # hive keychain
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
  get '/posts/@:author(/:sort)(/:limit)', to: 'posts#index', as: :posts_authored, constraints: { author: /[^\/]+/ }, format: false
  
  get '/tags/:type(/:sort)(/:limit)', to: 'tags#index', as: :tags_by_type
  
  root to: 'spa#show'
end
