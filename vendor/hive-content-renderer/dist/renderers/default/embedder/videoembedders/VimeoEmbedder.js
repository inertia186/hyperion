"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("../../../../Log");
const Links_1 = require("../utils/Links");
const AbstractVideoEmbedder_1 = require("./AbstractVideoEmbedder");
class VimeoEmbedder extends AbstractVideoEmbedder_1.AbstractVideoEmbedder {
    markEmbedIfFound(child) {
        try {
            const data = child.data;
            const vimeo = this.vimeoId(data);
            if (!vimeo) {
                return undefined;
            }
            const embedMarker = AbstractVideoEmbedder_1.AbstractVideoEmbedder.getEmbedMarker(vimeo.id, VimeoEmbedder.TYPE);
            child.data = data.replace(vimeo.url, embedMarker);
            return { link: vimeo.canonical };
        }
        catch (error) {
            Log_1.Log.log().error(error);
        }
        return undefined;
    }
    processEmbedIfRelevant(embedType, id, size, htmlElementKey) {
        if (embedType !== VimeoEmbedder.TYPE)
            return undefined;
        const url = `https://player.vimeo.com/video/${id}`;
        return `<div className="videoWrapper">
            <iframe
                key=${htmlElementKey}
                src=${url}
                width=${size.width}
                height=${size.height}
                frameBorder="0"
                webkitallowfullscreen
                mozallowfullscreen
                allowFullScreen
            />
        </div>`;
    }
    vimeoId(data) {
        if (!data) {
            return null;
        }
        const m = data.match(Links_1.default.vimeo);
        if (!m || m.length < 2) {
            return null;
        }
        return {
            id: m[1],
            url: m[0],
            canonical: `https://player.vimeo.com/video/${m[1]}`,
        };
    }
}
VimeoEmbedder.TYPE = "vimeo";
exports.VimeoEmbedder = VimeoEmbedder;
//# sourceMappingURL=VimeoEmbedder.js.map