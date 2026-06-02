"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ow_1 = require("ow");
const Remarkable = require("remarkable");
const SecurityChecker_1 = require("../../security/SecurityChecker");
const DefaultRendererLocalization_1 = require("./DefaultRendererLocalization");
const AssetEmbedder_1 = require("./embedder/AssetEmbedder");
const PreliminarySanitizer_1 = require("./sanitization/PreliminarySanitizer");
const TagTransformingSanitizer_1 = require("./sanitization/TagTransformingSanitizer");
class DefaultRenderer {
    constructor(options, localization = DefaultRendererLocalization_1.DefaultRendererLocalization.DEFAULT) {
        DefaultRenderer.Options.validate(options);
        this.options = options;
        DefaultRendererLocalization_1.DefaultRendererLocalization.validate(localization);
        this.tagTransformingSanitizer = new TagTransformingSanitizer_1.TagTransformingSanitizer({
            iframeWidth: this.options.assetsWidth,
            iframeHeight: this.options.assetsHeight,
            addNofollowToLinks: this.options.addNofollowToLinks,
            noImage: this.options.doNotShowImages,
            isLinkSafeFn: this.options.isLinkSafeFn,
        }, localization);
        this.embedder = new AssetEmbedder_1.AssetEmbedder({
            ipfsPrefix: this.options.ipfsPrefix,
            width: this.options.assetsWidth,
            height: this.options.assetsHeight,
            hideImages: this.options.doNotShowImages,
            imageProxyFn: this.options.imageProxyFn,
            hashtagUrlFn: this.options.hashtagUrlFn,
            usertagUrlFn: this.options.usertagUrlFn,
            baseUrl: this.options.baseUrl,
        }, localization);
    }
    render(input) {
        ow_1.default(input, "input", ow_1.default.string.nonEmpty);
        return this.doRender(input);
    }
    doRender(text) {
        text = PreliminarySanitizer_1.PreliminarySanitizer.preliminarySanitize(text);
        const isHtml = this.isHtml(text);
        text = isHtml ? text : this.renderMarkdown(text);
        text = this.wrapRenderedTextWithHtmlIfNeeded(text);
        text = this.embedder.markAssets(text);
        text = this.sanitize(text);
        SecurityChecker_1.SecurityChecker.checkSecurity(text, { allowScriptTag: this.options.allowInsecureScriptTags });
        text = this.embedder.insertAssets(text);
        return text;
    }
    renderMarkdown(text) {
        const renderer = new Remarkable({
            html: true,
            breaks: this.options.breaks,
            linkify: false,
            typographer: false,
            quotes: "“”‘’",
        });
        return renderer.render(text);
    }
    wrapRenderedTextWithHtmlIfNeeded(renderedText) {
        // If content isn't wrapped with an html element at this point, add it.
        if (renderedText.indexOf("<html>") !== 0) {
            renderedText = "<html>" + renderedText + "</html>";
        }
        return renderedText;
    }
    isHtml(text) {
        let html = false;
        // See also ReplyEditor isHtmlTest
        const m = text.match(/^<html>([\S\s]*)<\/html>$/);
        if (m && m.length === 2) {
            html = true;
            text = m[1];
        }
        else {
            // See also ReplyEditor isHtmlTest
            html = /^<p>[\S\s]*<\/p>/.test(text);
        }
        return html;
    }
    sanitize(text) {
        if (this.options.skipSanitization) {
            return text;
        }
        return this.tagTransformingSanitizer.sanitize(text);
    }
}
exports.DefaultRenderer = DefaultRenderer;
(function (DefaultRenderer) {
    let Options;
    (function (Options) {
        function validate(o) {
            ow_1.default(o.baseUrl, "Options.baseUrl", ow_1.default.string.nonEmpty);
            ow_1.default(o.breaks, "Options.breaks", ow_1.default.boolean);
            ow_1.default(o.skipSanitization, "Options.skipSanitization", ow_1.default.boolean);
            ow_1.default(o.addNofollowToLinks, "Options.addNofollowToLinks", ow_1.default.boolean);
            ow_1.default(o.doNotShowImages, "Options.doNotShowImages", ow_1.default.boolean);
            ow_1.default(o.ipfsPrefix, "Options.ipfsPrefix", ow_1.default.string);
            ow_1.default(o.assetsWidth, "Options.assetsWidth", ow_1.default.number.integer.positive);
            ow_1.default(o.assetsHeight, "Options.assetsHeight", ow_1.default.number.integer.positive);
            ow_1.default(o.imageProxyFn, "Options.imageProxyFn", ow_1.default.function);
            ow_1.default(o.hashtagUrlFn, "Options.hashtagUrlFn", ow_1.default.function);
            ow_1.default(o.usertagUrlFn, "Options.usertagUrlFn", ow_1.default.function);
            ow_1.default(o.isLinkSafeFn, "TagTransformingSanitizer.Options.isLinkSafeFn", ow_1.default.function);
        }
        Options.validate = validate;
    })(Options = DefaultRenderer.Options || (DefaultRenderer.Options = {}));
})(DefaultRenderer = exports.DefaultRenderer || (exports.DefaultRenderer = {}));
//# sourceMappingURL=DefaultRenderer.js.map