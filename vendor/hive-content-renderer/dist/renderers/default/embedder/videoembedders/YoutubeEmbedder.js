"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("../../../../Log");
const Links_1 = require("../utils/Links");
const AbstractVideoEmbedder_1 = require("./AbstractVideoEmbedder");
class YoutubeEmbedder extends AbstractVideoEmbedder_1.AbstractVideoEmbedder {
    /** @return {id, url} or <b>null</b> */
    static getYoutubeMetadataFromLink(data) {
        if (!data) {
            return null;
        }
        const m1 = data.match(Links_1.default.youTube);
        const url = m1 ? m1[0] : null;
        if (!url) {
            return null;
        }
        const m2 = url.match(Links_1.default.youTubeId);
        const id = m2 && m2.length >= 2 ? m2[1] : null;
        if (!id) {
            return null;
        }
        return {
            id,
            url,
            thumbnail: "https://img.youtube.com/vi/" + id + "/0.jpg",
        };
    }
    markEmbedIfFound(child) {
        try {
            const data = child.data;
            const yt = YoutubeEmbedder.getYoutubeMetadataFromLink(data);
            if (!yt) {
                return undefined;
            }
            const embedMarker = AbstractVideoEmbedder_1.AbstractVideoEmbedder.getEmbedMarker(yt.id, YoutubeEmbedder.TYPE);
            child.data = data.replace(yt.url, embedMarker);
            return { image: yt.thumbnail, link: yt.url };
        }
        catch (error) {
            Log_1.Log.log().error(error);
        }
        return undefined;
    }
    processEmbedIfRelevant(embedType, id, size, htmlElementKey) {
        if (embedType !== YoutubeEmbedder.TYPE)
            return undefined;
        const ytUrl = `https://www.youtube.com/embed/${id}`;
        return `<div class="videoWrapper"><iframe
                    width="${size.width}"
                    height="${size.height}"
                    src="${ytUrl}"
                    allowfullscreen="allowfullscreen"
                    webkitallowfullscreen="webkitallowfullscreen"
                    mozallowfullscreen="mozallowfullscreen"
                    frameborder="0"
                ></iframe></div>`;
    }
}
YoutubeEmbedder.TYPE = "youtube";
exports.YoutubeEmbedder = YoutubeEmbedder;
//# sourceMappingURL=YoutubeEmbedder.js.map