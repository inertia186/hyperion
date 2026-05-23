import { Application } from "@hotwired/stimulus"
import HelpController from "./help_controller"
import HyperionController from "./hyperion_controller"
import PastTagsController from "./past_tags_controller"
import PostsController from "./posts_controller"
import SearchTagsController from "./search_tags_controller"
import SessionsController from "./sessions_controller"

const application = Application.start()
application.register("help", HelpController)
application.register("hyperion", HyperionController)
application.register("past-tags", PastTagsController)
application.register("posts", PostsController)
application.register("search-tags", SearchTagsController)
application.register("sessions", SessionsController)
