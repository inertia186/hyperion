"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("../../../../Log");
const Links_1 = require("../utils/Links");
const AbstractVideoEmbedder_1 = require("./AbstractVideoEmbedder");
class TwitchEmbedder extends AbstractVideoEmbedder_1.AbstractVideoEmbedder {
    markEmbedIfFound(child) {
        try {
            const data = child.data;
            const twitch = this.twitchId(data);
            if (!twitch) {
                return undefined;
            }
            const embedMarker = AbstractVideoEmbedder_1.AbstractVideoEmbedder.getEmbedMarker(twitch.id, TwitchEmbedder.TYPE);
            child.data = data.replace(twitch.url, embedMarker);
            return { link: twitch.canonical };
        }
        catch (error) {
            Log_1.Log.log().error(error);
        }
        return undefined;
    }
    processEmbedIfRelevant(embedType, id, size, htmlElementKey) {
        if (embedType !== TwitchEmbedder.TYPE)
            return undefined;
        const url = `https://player.twitch.tv/${id}`;
        return `<div className="videoWrapper">
                <iframe
                    key=${htmlElementKey}
                    src=${url}
                    width=${size.width}
                    height=${size.height}
                    rameBorder="0"
                    allowFullScreen
                />
            </div>`;
    }
    twitchId(data) {
        if (!data) {
            return null;
        }
        const m = data.match(Links_1.default.twitch);
        if (!m || m.length < 3) {
            return null;
        }
        return {
            id: m[1] === `videos` ? `?video=${m[2]}` : `?channel=${m[2]}`,
            url: m[0],
            canonical: m[1] === `videos`
                ? `https://player.twitch.tv/?video=${m[2]}`
                : `https://player.twitch.tv/?channel=${m[2]}`,
        };
    }
}
TwitchEmbedder.TYPE = "twitch";
exports.TwitchEmbedder = TwitchEmbedder;
//# sourceMappingURL=TwitchEmbedder.js.map