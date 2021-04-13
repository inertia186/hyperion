# Limit logger spam like:
# 
# [ActiveJob] [PostIndexJob] [114bcc78-f128-42df-aacd-866c8fa6c956] You are setting a key that conflicts with a built-in method Hashie::Mash#method defined in Kernel. This can cause unexpected behavior when accessing the key as a property. You can still access the key via the #[] method.

Hashie.logger = Logger.new(nil)
