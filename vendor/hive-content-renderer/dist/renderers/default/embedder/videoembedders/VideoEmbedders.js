"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AbstractVideoEmbedder_1 = require("./AbstractVideoEmbedder");
const TwitchEmbedder_1 = require("./TwitchEmbedder");
const ThreespeakEmbedder_1 = require("./ThreespeakEmbedder");
const VimeoEmbedder_1 = require("./VimeoEmbedder");
const YoutubeEmbedder_1 = require("./YoutubeEmbedder");
class VideoEmbedders {
    static processTextNodeAndInsertEmbeds(node) {
        const out = { links: [], images: [] };
        for (const embedder of VideoEmbedders.LIST) {
            const markResult = embedder.markEmbedIfFound(node);
            if (markResult) {
                if (markResult.image)
                    out.images.push(markResult.image);
                if (markResult.link)
                    out.links.push(markResult.link);
            }
        }
        return out;
    }
    static insertMarkedEmbedsToRenderedOutput(input, size) {
        return AbstractVideoEmbedder_1.AbstractVideoEmbedder.insertAllEmbeds(VideoEmbedders.LIST, input, size);
    }
}
VideoEmbedders.LIST = [
    //
    new YoutubeEmbedder_1.YoutubeEmbedder(),
    new VimeoEmbedder_1.VimeoEmbedder(),
    new TwitchEmbedder_1.TwitchEmbedder(),
    new ThreespeakEmbedder_1.ThreespeakEmbedder(),
];
exports.VideoEmbedders = VideoEmbedders;
//# sourceMappingURL=VideoEmbedders.js.map
