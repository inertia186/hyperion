"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ow_1 = require("ow");
const Log_1 = require("../Log");
const Phishing_1 = require("./Phishing");
class LinkSanitizer {
    constructor(options) {
        LinkSanitizer.Options.validate(options);
        this.options = options;
        this.baseUrl = new URL(this.options.baseUrl);
        this.topLevelsBaseDomain = this.getTopLevelBaseDomainFromBaseUrl(this.baseUrl);
    }
    sanitizeLink(url, urlTitle) {
        url = this.prependUnknownProtocolLink(url);
        Log_1.Log.log().debug("LinkSanitizer#sanitizeLink", { url, urlTitle });
        if (Phishing_1.Phishing.looksPhishy(url)) {
            Log_1.Log.log().debug("LinkSanitizer#sanitizeLink", "phishing link detected", "phishing list", url, {
                url,
                urlTitle,
            });
            return false;
        }
        if (this.isPseudoLocalUrl(url, urlTitle)) {
            Log_1.Log.log().debug("LinkSanitizer#sanitizeLink", "phishing link detected", "pseudo local url", url, {
                url,
                urlTitle,
            });
            return false;
        }
        return url;
    }
    getTopLevelBaseDomainFromBaseUrl(url) {
        const regex = /([^\s\/$.?#]+\.[^\s\/$.?#]+)$/g;
        const m = regex.exec(url.hostname);
        if (m && m[0])
            return m[0];
        else {
            throw new Error(`LinkSanitizer: could not determine top level base domain from baseUrl hostname: ${url.hostname}`);
        }
    }
    prependUnknownProtocolLink(url) {
        // If this link is not relative, http, https, or steem -- add https.
        if (!/^((#)|(\/(?!\/))|(((steem|https?):)?\/\/))/.test(url)) {
            url = "https://" + url;
        }
        return url;
    }
    isPseudoLocalUrl(url, urlTitle) {
        if (url.indexOf("#") === 0)
            return false;
        url = url.toLowerCase();
        urlTitle = urlTitle.toLowerCase();
        try {
            const urlTitleContainsBaseDomain = urlTitle.indexOf(this.topLevelsBaseDomain) !== -1;
            const urlContainsBaseDomain = url.indexOf(this.topLevelsBaseDomain) !== -1;
            if (urlTitleContainsBaseDomain && !urlContainsBaseDomain) {
                return true;
            }
        }
        catch (error) {
            if (error instanceof TypeError) {
                return false; // if url is invalid it is ok
            }
            else
                throw error;
        }
        return false;
    }
}
exports.LinkSanitizer = LinkSanitizer;
(function (LinkSanitizer) {
    let Options;
    (function (Options) {
        function validate(o) {
            ow_1.default(o, "LinkSanitizer.Options", ow_1.default.object);
            ow_1.default(o.baseUrl, "LinkSanitizer.Options.baseUrl", ow_1.default.string.nonEmpty);
        }
        Options.validate = validate;
    })(Options = LinkSanitizer.Options || (LinkSanitizer.Options = {}));
})(LinkSanitizer = exports.LinkSanitizer || (exports.LinkSanitizer = {}));
//# sourceMappingURL=LinkSanitizer.js.map