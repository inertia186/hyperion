export declare class LinkSanitizer {
    private options;
    private baseUrl;
    private topLevelsBaseDomain;
    constructor(options: LinkSanitizer.Options);
    sanitizeLink(url: string, urlTitle: string): string | false;
    private getTopLevelBaseDomainFromBaseUrl;
    private prependUnknownProtocolLink;
    private isPseudoLocalUrl;
}
export declare namespace LinkSanitizer {
    interface Options {
        baseUrl: string;
    }
    namespace Options {
        function validate(o: Options): void;
    }
}
