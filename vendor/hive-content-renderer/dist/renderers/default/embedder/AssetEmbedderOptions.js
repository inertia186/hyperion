"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ow_1 = require("ow");
var AssetEmbedderOptions;
(function (AssetEmbedderOptions) {
    function validate(o) {
        ow_1.default(o.ipfsPrefix, "AssetEmbedderOptions.ipfsPrefix", ow_1.default.string);
        ow_1.default(o.width, "AssetEmbedderOptions.width", ow_1.default.number.integer.positive);
        ow_1.default(o.height, "AssetEmbedderOptions.height", ow_1.default.number.integer.positive);
        ow_1.default(o.hideImages, "AssetEmbedderOptions.hideImages", ow_1.default.boolean);
        ow_1.default(o.baseUrl, "AssetEmbedderOptions.baseUrl", ow_1.default.string.nonEmpty);
        ow_1.default(o.imageProxyFn, "AssetEmbedderOptions.imageProxyFn", ow_1.default.function);
        ow_1.default(o.hashtagUrlFn, "AssetEmbedderOptions.hashtagUrlFn", ow_1.default.function);
        ow_1.default(o.usertagUrlFn, "AssetEmbedderOptions.usertagUrlFn", ow_1.default.function);
    }
    AssetEmbedderOptions.validate = validate;
})(AssetEmbedderOptions = exports.AssetEmbedderOptions || (exports.AssetEmbedderOptions = {}));
//# sourceMappingURL=AssetEmbedderOptions.js.map