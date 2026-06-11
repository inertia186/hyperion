Rails.application.routes.draw do
  get '/.well-known/healthcheck.json', to: 'healthcheck#show', defaults: {format: :json}
  get '/.well-known', to: 'agent_discovery#index', defaults: {format: :json}
  get '/.well-known/hyperion-agent.json', to: 'agent_discovery#show', defaults: {format: :json}, as: :hyperion_agent_discovery
  get '/llms.txt', to: 'agent_discovery#llms', as: :llms
  get '/openapi.json', to: 'agent_discovery#openapi', defaults: {format: :json}, as: :openapi
  match '/mcp', to: 'mcp#create', via: :post, defaults: {format: :json}
  match '/mcp', to: 'mcp#show', via: :get, defaults: {format: :json}
  match '/mcp', to: 'mcp#destroy', via: :delete, defaults: {format: :json}

  namespace :api do
    namespace :v1 do
      resources :agent_auth_challenges, path: '/agent/auth_challenges', only: %i(create show) do
        member do
          get :hivesigner_callback
          post :redeem
          post :keychain
        end
      end

      get '/agent/session', to: 'agent#show_session'
      get '/agent/digest', to: 'agent#digest'
      get '/agent/posts/:id', to: 'agent#post', as: :agent_post
      get '/agent/posts/:id/vote_link', to: 'agent#vote_link', as: :agent_post_vote_link
      post '/agent/read', to: 'agent#mark_read', as: :agent_read
      post '/agent/ignored_tags', to: 'agent#create_ignored_tags', as: :agent_ignored_tags
      delete '/agent/ignored_tags', to: 'agent#destroy_ignored_tags'

      resource :session, only: :show do
        get :voting_power
      end

      get '/images/proxy', to: 'images#proxy'

      resources :posts, only: %i(index show) do
        member do
          get :revisions
          get :chain_stats
          get :payout
          patch :read, action: :mark_read
          delete :read, action: :mark_unread
        end

        collection do
          get :timeline
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
