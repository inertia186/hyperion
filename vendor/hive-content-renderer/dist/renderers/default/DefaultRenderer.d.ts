import { DefaultRendererLocalization } from "./DefaultRendererLocalization";
export declare class DefaultRenderer {
    private options;
    private tagTransformingSanitizer;
    private embedder;
    constructor(options: DefaultRenderer.Options, localization?: DefaultRendererLocalization);
    render(input: string): string;
    private doRender;
    private renderMarkdown;
    private wrapRenderedTextWithHtmlIfNeeded;
    private isHtml;
    private sanitize;
}
export declare namespace DefaultRenderer {
    interface Options {
        baseUrl: string;
        breaks: boolean;
        skipSanitization: boolean;
        allowInsecureScriptTags: boolean;
        addNofollowToLinks: boolean;
        doNotShowImages: boolean;
        ipfsPrefix: string;
        assetsWidth: number;
        assetsHeight: number;
        imageProxyFn: (url: string) => string;
        hashtagUrlFn: (hashtag: string) => string;
        usertagUrlFn: (account: string) => string;
        isLinkSafeFn: (url: string) => boolean;
    }
    namespace Options {
        function validate(o: Options): void;
    }
}
