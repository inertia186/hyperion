"use strict";
/**
 * Based on: https://raw.githubusercontent.com/steemit/condenser/master/src/app/utils/Links.js
 */
// tslint:disable variable-name prefer-for-of
Object.defineProperty(exports, "__esModule", { value: true });
const urlChar = '[^\\s"<>\\]\\[\\(\\)]';
const urlCharEnd = urlChar.replace(/\]$/, ".,']"); // insert bad chars to end on
const imagePath = "(?:(?:\\.(?:tiff?|jpe?g|gif|png|svg|ico)|ipfs/[a-z\\d]{40,}))";
const domainPath = "(?:[-a-zA-Z0-9\\._]*[-a-zA-Z0-9])";
const urlChars = "(?:" + urlChar + "*" + urlCharEnd + ")?";
const urlSet = ({ domain = domainPath, path = "" } = {}) => {
    // urlChars is everything but html or markdown stop chars
    return `https?:\/\/${domain}(?::\\d{2,5})?(?:[/\\?#]${urlChars}${path ? path : ""})${path ? "" : "?"}`;
};
/**
 * Unless your using a 'g' (glob) flag you can store and re-use your regular expression.  Use the cache below.
 *  If your using a glob (for example: replace all), the regex object becomes stateful and continues where it
 *   left off when called with the
 *   same string so naturally the regexp object can't be cached for long.
 */
exports.any = (flags = "i") => new RegExp(urlSet(), flags);
exports.local = (flags = "i") => new RegExp(urlSet({ domain: "(?:localhost|(?:.*\\.)?steemit.com)" }), flags);
exports.remote = (flags = "i") => new RegExp(urlSet({ domain: `(?!localhost|(?:.*\\.)?steemit.com)${domainPath}` }), flags);
exports.youTube = (flags = "i") => new RegExp(urlSet({ domain: "(?:(?:.*.)?(youtube\\.com|youtu\\.be))" }), flags);
exports.image = (flags = "i") => new RegExp(urlSet({ path: imagePath }), flags);
exports.imageFile = (flags = "i") => new RegExp(imagePath, flags);
// export const nonImage = (flags = 'i') => new RegExp(urlSet({path: '!' + imageFile}), flags)
// export const markDownImageRegExp = (flags = 'i') => new RegExp('\!\[[\w\s]*\]\(([^\)]+)\)', flags);
exports.default = {
    any: exports.any(),
    local: exports.local(),
    remote: exports.remote(),
    image: exports.image(),
    imageFile: exports.imageFile(),
    youTube: exports.youTube(),
    youTubeId: /(?:(?:youtube.com\/watch\?v=)|(?:youtu.be\/)|(?:youtube.com\/embed\/))([A-Za-z0-9\_\-]+)/i,
    vimeo: /https?:\/\/(?:vimeo.com\/|player.vimeo.com\/video\/)([0-9]+)\/*/,
    vimeoId: /(?:vimeo.com\/|player.vimeo.com\/video\/)([0-9]+)/,
    // simpleLink: new RegExp(`<a href="(.*)">(.*)<\/a>`, 'ig'),
    ipfsPrefix: /(https?:\/\/.*)?\/ipfs/i,
    twitch: /https?:\/\/(?:www.)?twitch.tv\/(?:(videos)\/)?([a-zA-Z0-9][\w]{3,24})/i,
};
/**
 * Returns a new object extended from outputParams with [key] == inputParams[key] if the value is in allowedValues
 * @param outputParams
 * @param inputParamsco
 * @param key
 * @param allowedValues
 * @returns {*}
 */
exports.addToParams = (outputParams, inputParams, key, allowedValues) => {
    const respParams = Object.assign({}, outputParams);
    if (inputParams[key] && allowedValues.indexOf(inputParams[key]) > -1) {
        respParams[key] = inputParams[key];
    }
    return respParams;
};
exports.makeParams = (params, prefix) => {
    let paramsList = [];
    if (params.constructor === Array) {
        paramsList = params;
    }
    else {
        Object.entries(params).forEach(([key, value]) => {
            paramsList.push(`${key}=${value}`);
        });
    }
    if (paramsList.length > 0) {
        return (prefix !== false ? (typeof prefix === "string" ? prefix : "?") : "") + paramsList.join("&");
    }
    return "";
};
//# sourceMappingURL=Links.js.map