"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BadActorList_1 = require("./BadActorList");
class AccountNameValidator {
    // tslint:disable cyclomatic-complexity
    static validateAccountName(value, localization) {
        let i;
        let label;
        let len;
        let length;
        let ref;
        if (!value) {
            return localization.accountNameWrongLength;
        }
        length = value.length;
        if (length < 3) {
            return localization.accountNameWrongLength;
        }
        if (length > 16) {
            return localization.accountNameWrongLength;
        }
        if (BadActorList_1.default.includes(value)) {
            return localization.accountNameBadActor;
        }
        ref = value.split(".");
        for (i = 0, len = ref.length; i < len; i++) {
            label = ref[i];
            if (!/^[a-z]/.test(label)) {
                return localization.accountNameWrongSegment;
                // each_account_segment_should_start_with_a_letter
            }
            if (!/^[a-z0-9-]*$/.test(label)) {
                return localization.accountNameWrongSegment;
                // each_account_segment_should_have_only_letters_digits_or_dashes
            }
            if (/--/.test(label)) {
                return localization.accountNameWrongSegment;
                // each_account_segment_should_have_only_one_dash_in_a_row
            }
            if (!/[a-z0-9]$/.test(label)) {
                return localization.accountNameWrongSegment;
                // each_account_segment_should_end_with_a_letter_or_digit
            }
            if (!(label.length >= 3)) {
                return localization.accountNameWrongSegment;
                // each_account_segment_should_be_longer
            }
        }
        return null;
    }
}
exports.AccountNameValidator = AccountNameValidator;
//# sourceMappingURL=AccountNameValidator.js.map