class IndexerState < ApplicationRecord
  validates_presence_of :name
  validates_uniqueness_of :name

  def self.fetch!(name)
    find_or_create_by!(name: name)
  end
end
