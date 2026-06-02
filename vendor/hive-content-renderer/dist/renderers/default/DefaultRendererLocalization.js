"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ow_1 = require("ow");
var DefaultRendererLocalization;
(function (DefaultRendererLocalization) {
    function validate(o) {
        ow_1.default(o, "DefaultRendererLocalization", ow_1.default.object);
        ow_1.default(o.phishingWarning, "DefaultRendererLocalization.phishingWarningMessage", ow_1.default.string.nonEmpty);
        ow_1.default(o.externalLink, "DefaultRendererLocalization.externalLink", ow_1.default.string.nonEmpty);
        ow_1.default(o.noImage, "DefaultRendererLocalization.noImage", ow_1.default.string.nonEmpty);
        ow_1.default(o.accountNameWrongLength, "DefaultRendererLocalization.accountNameWrongLength", ow_1.default.string.nonEmpty);
        ow_1.default(o.accountNameBadActor, "DefaultRendererLocalization.accountNameBadActor", ow_1.default.string.nonEmpty);
        ow_1.default(o.accountNameWrongSegment, "DefaultRendererLocalization.accountNameWrongSegment", ow_1.default.string.nonEmpty);
    }
    DefaultRendererLocalization.validate = validate;
    DefaultRendererLocalization.DEFAULT = {
        phishingWarning: "Link expanded to plain text; beware of a potential phishing attempt",
        externalLink: "This link will take you away from example.com",
        noImage: "Images not allowed",
        accountNameWrongLength: "Account name should be between 3 and 16 characters long",
        accountNameBadActor: "This account is on a bad actor list",
        accountNameWrongSegment: "This account name contains a bad segment",
    };
})(DefaultRendererLocalization = exports.DefaultRendererLocalization || (exports.DefaultRendererLocalization = {}));
//# sourceMappingURL=DefaultRendererLocalization.js.map