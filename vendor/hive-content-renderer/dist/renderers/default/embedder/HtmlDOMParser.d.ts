/**
 * Based on: https://github.com/steemit/condenser/raw/master/src/shared/HtmlReady.js
 */
import ChainedError from "typescript-chained-error";
import { DefaultRendererLocalization } from "../DefaultRendererLocalization";
import { AssetEmbedderOptions } from "./AssetEmbedderOptions";
export declare class HtmlDOMParser {
    private options;
    private localization;
    private linkSanitizer;
    private domParser;
    private xmlSerializer;
    private state;
    private mutate;
    private parsedDocument;
    constructor(options: AssetEmbedderOptions, localization?: DefaultRendererLocalization);
    setMutateEnabled(mutate: boolean): HtmlDOMParser;
    parse(html: string): HtmlDOMParser;
    getState(): HtmlDOMParser.State;
    getParsedDocument(): Document;
    getParsedDocumentAsString(): string;
    private traverseDOMNode;
    private processLinkTag;
    private processIframeTag;
    private reportIframeLink;
    private processImgTag;
    private processTextNode;
    private linkify;
    private postprocessDOM;
    private hideImagesIfNeeded;
    private proxifyImagesIfNeeded;
    private proxifyImages;
    private normalizeUrl;
}
export declare namespace HtmlDOMParser {
    interface State {
        hashtags: Set<string>;
        usertags: Set<string>;
        htmltags: Set<string>;
        images: Set<string>;
        links: Set<string>;
    }
    class HtmlDOMParserError extends ChainedError {
        constructor(message?: string, cause?: Error);
    }
}
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
