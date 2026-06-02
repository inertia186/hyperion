"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class PreliminarySanitizer {
    static preliminarySanitize(text) {
        return PreliminarySanitizer.stripHtmlComments(text);
    }
    static stripHtmlComments(text) {
        return text.replace(/<!--([\s\S]+?)(-->|$)/g, "(html comment removed: $1)");
    }
}
exports.PreliminarySanitizer = PreliminarySanitizer;
//# sourceMappingURL=PreliminarySanitizer.js.map