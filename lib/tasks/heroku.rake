if Rake::Task.task_defined?("assets:precompile") && Rake::Task.task_defined?("vite:build")
  Rake::Task["assets:precompile"].enhance(["vite:build"])
end
