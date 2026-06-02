"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_chained_error_1 = require("typescript-chained-error");
class RendererError extends typescript_chained_error_1.default {
    constructor(message, cause) {
        super(message, cause);
    }
}
exports.RendererError = RendererError;
//# sourceMappingURL=RendererError.js.map