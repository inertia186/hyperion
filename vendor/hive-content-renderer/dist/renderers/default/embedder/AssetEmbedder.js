"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AssetEmbedderOptions_1 = require("./AssetEmbedderOptions");
const HtmlDOMParser_1 = require("./HtmlDOMParser");
const VideoEmbedders_1 = require("./videoembedders/VideoEmbedders");
class AssetEmbedder {
    constructor(options, localization) {
        AssetEmbedderOptions_1.AssetEmbedderOptions.validate(options);
        this.options = options;
        this.localization = localization;
    }
    markAssets(input) {
        const parser = new HtmlDOMParser_1.HtmlDOMParser(this.options, this.localization);
        return parser.parse(input).getParsedDocumentAsString();
    }
    insertAssets(input) {
        const size = {
            width: this.options.width,
            height: this.options.height,
        };
        return VideoEmbedders_1.VideoEmbedders.insertMarkedEmbedsToRenderedOutput(input, size);
    }
}
exports.AssetEmbedder = AssetEmbedder;
//# sourceMappingURL=AssetEmbedder.js.map