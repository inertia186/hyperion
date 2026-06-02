"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("../../../../Log");
const AbstractVideoEmbedder_1 = require("./AbstractVideoEmbedder");
class ThreespeakEmbedder extends AbstractVideoEmbedder_1.AbstractVideoEmbedder {
    static getMetadataFromLink(data) {
        if (!data) {
            return null;
        }
        const direct = data.match(ThreespeakEmbedder.DIRECT_RE);
        if (direct) {
            const fullId = direct[1];
            return {
                id: fullId,
                url: direct[0],
                canonical: direct[0],
                thumbnail: ThreespeakEmbedder.extractThumbnail(data),
            };
        }
        const post = data.match(ThreespeakEmbedder.HIVE_POST_RE);
        if (post) {
            const host = post[1];
            const category = post[2];
            const author = post[3];
            const permlink = post[4];
            return {
                id: `${author}/${permlink}`,
                url: post[0],
                canonical: `https://${host}/${category}/@${author}/${permlink}`,
                thumbnail: ThreespeakEmbedder.extractThumbnail(data),
            };
        }
        return null;
    }
    static extractThumbnail(data) {
        const thumbnail = data.match(ThreespeakEmbedder.THUMBNAIL_RE);
        return thumbnail ? thumbnail[0] : undefined;
    }
    static normalizeIframeUrl(src) {
        const match = src ? src.match(ThreespeakEmbedder.SANITIZE_RE) : null;
        if (!match) {
            return null;
        }
        return `https://play.3speak.tv/watch?v=${match[1]}&mode=iframe&layout=desktop`;
    }
    markEmbedIfFound(child) {
        try {
            const data = child.data;
            const threespeak = ThreespeakEmbedder.getMetadataFromLink(data);
            if (!threespeak) {
                return undefined;
            }
            const embedMarker = AbstractVideoEmbedder_1.AbstractVideoEmbedder.getEmbedMarker(threespeak.id, ThreespeakEmbedder.TYPE);
            child.data = data.replace(threespeak.url, embedMarker);
            return { image: threespeak.thumbnail, link: threespeak.canonical };
        }
        catch (error) {
            Log_1.Log.log().error(error);
        }
        return undefined;
    }
    processEmbedIfRelevant(embedType, id, size, htmlElementKey) {
        if (embedType !== ThreespeakEmbedder.TYPE)
            return undefined;
        const url = `https://play.3speak.tv/watch?v=${id}&mode=iframe&layout=desktop`;
        return `<div class="videoWrapper"><iframe
                    key="${htmlElementKey}"
                    width="${size.width}"
                    height="${size.height}"
                    src="${url}"
                    allowfullscreen="allowfullscreen"
                    webkitallowfullscreen="webkitallowfullscreen"
                    mozallowfullscreen="mozallowfullscreen"
                    frameborder="0"
                ></iframe></div>`;
    }
}
ThreespeakEmbedder.TYPE = "threespeak";
ThreespeakEmbedder.DIRECT_RE = /https?:\/\/(?:play\.)?3speak\.(?:online|co|tv)\/(?:embed|watch)\?v=([A-Za-z0-9_\-/.]+)(?:&[^\s"'<>]*)?/i;
ThreespeakEmbedder.SANITIZE_RE = /^https:\/\/(?:play\.)?3speak\.(?:online|co|tv)\/(?:embed|watch)\?v=([A-Za-z0-9_\-/.]+)(?:&.*)?$/i;
ThreespeakEmbedder.HIVE_POST_RE = /https?:\/\/((?:www\.)?(?:hive\.blog|peakd\.com))\/([A-Za-z0-9_-]+)\/@([a-z][-.a-z\d]+[a-z\d])\/(3speak-[A-Za-z0-9_-]+)/i;
ThreespeakEmbedder.THUMBNAIL_RE = /https:\/\/ipfs-3speak\.b-cdn\.net\/ipfs\/[A-Za-z0-9/._-]+/i;
exports.ThreespeakEmbedder = ThreespeakEmbedder;
