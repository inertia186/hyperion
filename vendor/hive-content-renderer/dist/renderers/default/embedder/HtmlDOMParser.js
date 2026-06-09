"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Based on: https://github.com/steemit/condenser/raw/master/src/shared/HtmlReady.js
 */
// tslint:disable max-classes-per-file
const typescript_chained_error_1 = require("typescript-chained-error");
const xmldom = require("@xmldom/xmldom");
const Log_1 = require("../../../Log");
const LinkSanitizer_1 = require("../../../security/LinkSanitizer");
const DefaultRendererLocalization_1 = require("../DefaultRendererLocalization");
const AssetEmbedderOptions_1 = require("./AssetEmbedderOptions");
const AccountNameValidator_1 = require("./utils/AccountNameValidator");
const Links_1 = require("./utils/Links");
const VideoEmbedders_1 = require("./videoembedders/VideoEmbedders");
const ThreespeakEmbedder_1 = require("./videoembedders/ThreespeakEmbedder");
const YoutubeEmbedder_1 = require("./videoembedders/YoutubeEmbedder");
class HtmlDOMParser {
    constructor(options, localization = DefaultRendererLocalization_1.DefaultRendererLocalization.DEFAULT) {
        this.domParser = new xmldom.DOMParser({
            onError: () => {
                /* */
            },
        });
        this.xmlSerializer = new xmldom.XMLSerializer();
        this.mutate = true;
        this.parsedDocument = undefined;
        AssetEmbedderOptions_1.AssetEmbedderOptions.validate(options);
        this.options = options;
        this.localization = localization;
        this.linkSanitizer = new LinkSanitizer_1.LinkSanitizer({
            baseUrl: this.options.baseUrl,
        });
        this.state = {
            hashtags: new Set(),
            usertags: new Set(),
            htmltags: new Set(),
            images: new Set(),
            links: new Set(),
        };
    }
    setMutateEnabled(mutate) {
        this.mutate = mutate;
        return this;
    }
    parse(html) {
        try {
            const doc = this.domParser.parseFromString(html, "text/html");
            this.traverseDOMNode(doc);
            if (this.mutate)
                this.postprocessDOM(doc);
            this.parsedDocument = doc;
        }
        catch (error) {
            throw new HtmlDOMParser.HtmlDOMParserError("Parsing error", error);
        }
        return this;
    }
    getState() {
        if (!this.parsedDocument)
            throw new HtmlDOMParser.HtmlDOMParserError("Html has not been parsed yet");
        return this.state;
    }
    getParsedDocument() {
        if (!this.parsedDocument)
            throw new HtmlDOMParser.HtmlDOMParserError("Html has not been parsed yet");
        return this.parsedDocument;
    }
    getParsedDocumentAsString() {
        return this.xmlSerializer.serializeToString(this.getParsedDocument());
    }
    traverseDOMNode(node, depth = 0) {
        if (!node || !node.childNodes) {
            return;
        }
        Array.from(node.childNodes).forEach(child => {
            const tag = child.tagName ? child.tagName.toLowerCase() : null;
            if (tag) {
                this.state.htmltags.add(tag);
            }
            if (tag === "img") {
                this.processImgTag(child);
            }
            else if (tag === "iframe") {
                this.processIframeTag(child);
            }
            else if (tag === "a") {
                this.processLinkTag(child);
            }
            else if (child.nodeName === "#text") {
                this.processTextNode(child);
            }
            this.traverseDOMNode(child, depth + 1);
        });
    }
    processLinkTag(child) {
        const url = child.getAttribute("href");
        if (url) {
            const threespeak = ThreespeakEmbedder_1.ThreespeakEmbedder.getMetadataFromLink(url);
            if (threespeak && child.getElementsByTagName("img").length > 0) {
                this.state.links.add(threespeak.canonical);
                if (threespeak.thumbnail) {
                    this.state.images.add(threespeak.thumbnail);
                }
                if (this.mutate) {
                    const marker = `~~~ embed:${threespeak.id} threespeak ~~~`;
                    child.parentNode.replaceChild(child.ownerDocument.createTextNode(marker), child);
                }
                return;
            }
            this.state.links.add(url);
            if (this.mutate) {
                // Unlink potential phishing attempts
                const urlTitle = child.textContent + "";
                const sanitizedLink = this.linkSanitizer.sanitizeLink(url, urlTitle);
                if (sanitizedLink === false) {
                    const phishyDiv = child.ownerDocument.createElement("div");
                    phishyDiv.textContent = `${child.textContent} / ${url}`;
                    phishyDiv.setAttribute("title", this.localization.phishingWarning);
                    phishyDiv.setAttribute("class", "phishy");
                    child.parentNode.replaceChild(phishyDiv, child);
                }
                else {
                    child.setAttribute("href", sanitizedLink);
                }
            }
        }
    }
    // wrap iframes in div.videoWrapper to control size/aspect ratio
    processIframeTag(child) {
        const url = child.getAttribute("src");
        if (url)
            this.reportIframeLink(url);
        if (!this.mutate) {
            return;
        }
        const tag = child.parentNode.tagName
            ? child.parentNode.tagName.toLowerCase()
            : child.parentNode.tagName;
        if (tag === "div" && child.parentNode.getAttribute("class") === "videoWrapper") {
            return;
        }
        const html = this.xmlSerializer.serializeToString(child);
        const wrapper = this.domParser.parseFromString(`<div class="videoWrapper">${html}</div>`, "text/html").documentElement;
        child.parentNode.replaceChild(wrapper, child);
    }
    reportIframeLink(url) {
        const yt = YoutubeEmbedder_1.YoutubeEmbedder.getYoutubeMetadataFromLink(url);
        if (yt) {
            this.state.links.add(yt.url);
            this.state.images.add("https://img.youtube.com/vi/" + yt.id + "/0.jpg");
        }
    }
    processImgTag(child) {
        const url = child.getAttribute("src");
        if (url) {
            this.state.images.add(url);
            if (this.mutate) {
                let url2 = this.normalizeUrl(url);
                if (/^\/\//.test(url2)) {
                    // Change relative protocol imgs to https
                    url2 = "https:" + url2;
                }
                if (url2 !== url) {
                    child.setAttribute("src", url2);
                }
            }
        }
    }
    processTextNode(child) {
        try {
            const tag = child.parentNode.tagName
                ? child.parentNode.tagName.toLowerCase()
                : child.parentNode.tagName;
            if (tag === "code") {
                return;
            }
            if (tag === "a") {
                return;
            }
            if (!child.data) {
                return;
            }
            const embedResp = VideoEmbedders_1.VideoEmbedders.processTextNodeAndInsertEmbeds(child);
            embedResp.images.forEach(img => this.state.images.add(img));
            embedResp.links.forEach(link => this.state.links.add(link));
            const data = this.xmlSerializer.serializeToString(child);
            const content = this.linkify(data);
            if (this.mutate && content !== data) {
                const newChild = this.domParser.parseFromString(`<span>${content}</span>`, "text/html").documentElement;
                child.parentNode.replaceChild(newChild, child);
                return newChild;
            }
        }
        catch (error) {
            Log_1.Log.log().error(error);
        }
    }
    linkify(content) {
        // plaintext links
        content = content.replace(Links_1.any("gi"), ln => {
            if (Links_1.default.image.test(ln)) {
                this.state.images.add(ln);
                return `<img src="${this.normalizeUrl(ln)}" />`;
            }
            // do not linkify .exe or .zip urls
            if (/\.(zip|exe)$/i.test(ln)) {
                return ln;
            }
            // do not linkify phishy links
            const sanitizedLink = this.linkSanitizer.sanitizeLink(ln, ln);
            if (sanitizedLink === false) {
                return `<div title='${this.localization.phishingWarning}' class='phishy'>${ln}</div>`;
            }
            this.state.links.add(sanitizedLink);
            const out = `<a href="${this.normalizeUrl(ln)}">${sanitizedLink}</a>`;
            return out;
        });
        // hashtag
        content = content.replace(/(^|\s)(#[-a-z\d]+)/gi, tag => {
            if (/#[\d]+$/.test(tag)) {
                return tag;
            } // Don't allow numbers to be tags
            const space = /^\s/.test(tag) ? tag[0] : "";
            const tag2 = tag.trim().substring(1);
            const tagLower = tag2.toLowerCase();
            this.state.hashtags.add(tagLower);
            if (!this.mutate) {
                return tag;
            }
            const tagUrl = this.options.hashtagUrlFn(tagLower);
            return space + `<a href="${tagUrl}">${tag.trim()}</a>`;
        });
        // usertag (mention)
        // Cribbed from https://github.com/twitter/twitter-text/blob/v1.14.7/js/twitter-text.js#L90
        content = content.replace(/(^|[^a-zA-Z0-9_!#$%&*@＠\/]|(^|[^a-zA-Z0-9_+~.-\/#]))[@＠]([a-z][-\.a-z\d]+[a-z\d])/gi, (match, preceeding1, preceeding2, user) => {
            const userLower = user.toLowerCase();
            const valid = AccountNameValidator_1.AccountNameValidator.validateAccountName(userLower, this.localization) == null;
            if (valid && this.state.usertags) {
                this.state.usertags.add(userLower);
            }
            // include the preceeding matches if they exist
            const preceedings = (preceeding1 || "") + (preceeding2 || "");
            if (!this.mutate) {
                return `${preceedings}${user}`;
            }
            const userTagUrl = this.options.usertagUrlFn(userLower);
            return valid ? `${preceedings}<a href="${userTagUrl}">@${user}</a>` : `${preceedings}@${user}`;
        });
        return content;
    }
    postprocessDOM(doc) {
        this.hideImagesIfNeeded(doc);
        this.proxifyImagesIfNeeded(doc);
    }
    hideImagesIfNeeded(doc) {
        if (this.mutate && this.options.hideImages) {
            for (const image of Array.from(doc.getElementsByTagName("img"))) {
                const pre = doc.createElement("pre");
                pre.setAttribute("class", "image-url-only");
                pre.appendChild(doc.createTextNode(image.getAttribute("src") || ""));
                if (image.parentNode) {
                    image.parentNode.replaceChild(pre, image);
                }
            }
        }
    }
    proxifyImagesIfNeeded(doc) {
        if (this.mutate && !this.options.hideImages) {
            this.proxifyImages(doc);
        }
    }
    // For all img elements with non-local URLs, prepend the proxy URL (e.g. `https://img0.steemit.com/0x0/`)
    proxifyImages(doc) {
        if (!doc) {
            return;
        }
        Array.from(doc.getElementsByTagName("img")).forEach(node => {
            const url = node.getAttribute("src") || "";
            if (!Links_1.default.local.test(url)) {
                node.setAttribute("src", this.options.imageProxyFn(url));
            }
        });
    }
    normalizeUrl(url) {
        if (this.options.ipfsPrefix) {
            // Convert //ipfs/xxx  or /ipfs/xxx  into  https://steemit.com/ipfs/xxxxx
            if (/^\/?\/ipfs\//.test(url)) {
                const slash = url.charAt(1) === "/" ? 1 : 0;
                url = url.substring(slash + "/ipfs/".length); // start with only 1 /
                return this.options.ipfsPrefix + "/" + url;
            }
        }
        return url;
    }
}
exports.HtmlDOMParser = HtmlDOMParser;
(function (HtmlDOMParser) {
    class HtmlDOMParserError extends typescript_chained_error_1.default {
        constructor(message, cause) {
            super(message, cause);
        }
    }
    HtmlDOMParser.HtmlDOMParserError = HtmlDOMParserError;
})(HtmlDOMParser = exports.HtmlDOMParser || (exports.HtmlDOMParser = {}));
/*

*/
/****************
 * Legacy docs of HtmlReady:
 */
/**
 * Functions performed by HTMLReady
 *
 * State reporting
 *  - hashtags: collect all #tags in content
 *  - usertags: collect all @mentions in content
 *  - htmltags: collect all html <tags> used (for validation)
 *  - images: collect all image URLs in content
 *  - links: collect all href URLs in content
 *
 * Mutations
 *  - link()
 *    - ensure all <a> href's begin with a protocol. prepend https:// otherwise.
 *  - iframe()
 *    - wrap all <iframe>s in <div class="videoWrapper"> for responsive sizing
 *  - img()
 *    - convert any <img> src IPFS prefixes to standard URL
 *    - change relative protocol to https://
 *  - linkifyNode()
 *    - scans text content to be turned into rich content
 *    - embedYouTubeNode()
 *      - identify plain youtube URLs and prep them for "rich embed"
 *    - linkify()
 *      - scan text for:
 *        - #tags, convert to <a> links
 *        - @mentions, convert to <a> links
 *        - naked URLs
 *          - if img URL, normalize URL and convert to <img> tag
 *          - otherwise, normalize URL and convert to <a> link
 *  - proxifyImages()
 *    - prepend proxy URL to any non-local <img> src's
 *
 * We could implement 2 levels of HTML mutation for maximum reuse:
 *  1. Normalization of HTML - non-proprietary, pre-rendering cleanup/normalization
 *    - (state reporting done at this level)
 *    - normalize URL protocols
 *    - convert naked URLs to images/links
 *    - convert embeddable URLs to <iframe>s
 *    - basic sanitization?
 *  2. Steemit.com Rendering - add in proprietary Steemit.com functions/links
 *    - convert <iframe>s to custom objects
 *    - linkify #tags and @mentions
 *    - proxify images
 *
 * TODO:
 *  - change ipfsPrefix(url) to normalizeUrl(url)
 *    - rewrite IPFS prefixes to valid URLs
 *    - schema normalization
 *    - gracefully handle protocols like ftp, mailto
 */
/** Split the HTML on top-level elements. This allows react to compare separately, preventing excessive re-rendering.
 * Used in MarkdownViewer.jsx
 */
// export function sectionHtml (html) {
//   const doc = this.domParser.parseFromString(html, 'text/html')
//   const sections = Array(...doc.childNodes).map(child => this.xmlSerializer.serializeToString(child))
//   return sections
// }
/* Embed videos, link mentions and hashtags, etc...
    If hideImages and mutate is set to true all images will be replaced
    by <pre> elements containing just the image url.
*/
//# sourceMappingURL=HtmlDOMParser.js.map
