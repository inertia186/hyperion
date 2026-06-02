/**
 * Based on: https://raw.githubusercontent.com/steemit/condenser/master/src/app/utils/Links.js
 */
/**
 * Unless your using a 'g' (glob) flag you can store and re-use your regular expression.  Use the cache below.
 *  If your using a glob (for example: replace all), the regex object becomes stateful and continues where it
 *   left off when called with the
 *   same string so naturally the regexp object can't be cached for long.
 */
export declare const any: (flags?: string) => RegExp;
export declare const local: (flags?: string) => RegExp;
export declare const remote: (flags?: string) => RegExp;
export declare const youTube: (flags?: string) => RegExp;
export declare const image: (flags?: string) => RegExp;
export declare const imageFile: (flags?: string) => RegExp;
declare const _default: {
    any: RegExp;
    local: RegExp;
    remote: RegExp;
    image: RegExp;
    imageFile: RegExp;
    youTube: RegExp;
    youTubeId: RegExp;
    vimeo: RegExp;
    vimeoId: RegExp;
    ipfsPrefix: RegExp;
    twitch: RegExp;
};
export default _default;
/**
 * Returns a new object extended from outputParams with [key] == inputParams[key] if the value is in allowedValues
 * @param outputParams
 * @param inputParamsco
 * @param key
 * @param allowedValues
 * @returns {*}
 */
export declare const addToParams: (outputParams: any, inputParams: any, key: any, allowedValues: any) => any;
export declare const makeParams: (params: string[], prefix: string | false) => string;
