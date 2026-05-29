source 'https://rubygems.org'
git_source(:github) { |repo| "https://github.com/#{repo}.git" }

ruby '3.3.11'

# Bundle edge Rails instead: gem 'rails', github: 'rails/rails'
#gem 'rails', github: 'rails/rails'
gem 'rails', '~> 7.2.3', '>= 7.2.3.1'
gem 'activerecord-session_store'
gem 'responders'
gem 'stackprof'
# Use sqlite3 as the database for Active Record
gem 'pg', '~> 1.5'
# Use Puma as the app server
gem 'puma', '~> 6.4'
# Build JavaScript and CSS with modern bundlers while keeping the asset pipeline.
gem 'jsbundling-rails'
gem 'cssbundling-rails'
gem 'sprockets-rails'
gem 'vite_rails'
# Build JSON APIs with ease. Read more: https://github.com/rails/jbuilder
gem 'jbuilder', '~> 2.7'
# Use Redis adapter to run Action Cable in production
# gem 'redis', '~> 4.0'
# Use Active Model has_secure_password
# gem 'bcrypt', '~> 3.1.7'

# Use Active Storage variant
# gem 'image_processing', '~> 1.2'

# Reduces boot times through caching; required in config/boot.rb
gem 'bootsnap', '>= 1.4.2', require: false

gem 'haml-rails', '~> 2.0'

gem 'hive-ruby', '1.0.6', require: 'hive'

gem 'kramdown'

gem 'memoist'

gem 'matrix'

gem 'pagy'

group :development, :test do
  gem 'debug', platforms: [:mri, :mingw, :x64_mingw]
end

group :development do
  # Access an interactive console on exception pages or by calling 'console' anywhere in the code.
  gem 'web-console', '>= 3.3.0'
  gem 'listen', '~> 3.2'
  gem 'pry'
  gem 'rack-mini-profiler', require: false
  gem 'fast_stack'
  gem 'flamegraph'
  gem 'better_errors'
  gem 'binding_of_caller'
end

group :test do
  # Adds support for Capybara system testing and selenium driver
  gem 'capybara', '>= 2.15'
  gem 'selenium-webdriver'
end

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem 'tzinfo-data', platforms: [:mingw, :mswin, :x64_mingw, :jruby]
