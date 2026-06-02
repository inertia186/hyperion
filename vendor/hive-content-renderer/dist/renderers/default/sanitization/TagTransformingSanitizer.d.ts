import { DefaultRendererLocalization } from "../DefaultRendererLocalization";
export declare class TagTransformingSanitizer {
    private options;
    private localization;
    private sanitizationErrors;
    constructor(options: TagTransformingSanitizer.Options, localization: DefaultRendererLocalization);
    sanitize(text: string): string;
    getErrors(): string[];
    private generateSanitizeConfig;
}
export declare namespace TagTransformingSanitizer {
    interface Options {
        iframeWidth: number;
        iframeHeight: number;
        addNofollowToLinks: boolean;
        noImage: boolean;
        isLinkSafeFn: (url: string) => boolean;
    }
    namespace Options {
        function validate(o: Options): void;
    }
}
