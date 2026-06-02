/**
 * This file is based on
 *  - https://github.com/steemit/condenser/blob/master/src/app/utils/SanitizeConfig.js
 */
export declare class StaticConfig {
    static sanitization: {
        iframeWhitelist: {
            re: RegExp;
            fn: (src: string) => string | null;
        }[];
        noImageText: string;
        allowedTags: string[];
    };
}
