"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_chained_error_1 = require("typescript-chained-error");
class SecurityChecker {
    static checkSecurity(text, props) {
        if (!props.allowScriptTag && this.containsScriptTag(text)) {
            throw new SecurityChecker.SecurityError("Renderer rejected the input because of insecure content: text contains script tag");
        }
    }
    static containsScriptTag(text) {
        return /<\s*script/gi.test(text);
    }
}
exports.SecurityChecker = SecurityChecker;
(function (SecurityChecker) {
    /* tslint:disable max-classes-per-file */
    class SecurityError extends typescript_chained_error_1.default {
        constructor(message, cause) {
            super(message, cause);
        }
    }
    SecurityChecker.SecurityError = SecurityError;
})(SecurityChecker = exports.SecurityChecker || (exports.SecurityChecker = {}));
//# sourceMappingURL=SecurityChecker.js.map