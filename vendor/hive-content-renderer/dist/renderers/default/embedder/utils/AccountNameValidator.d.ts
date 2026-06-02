/**
 * Based on: https://raw.githubusercontent.com/steemit/condenser/master/src/app/utils/ChainValidation.js
 */
import { DefaultRendererLocalization } from "../../DefaultRendererLocalization";
export declare class AccountNameValidator {
    static validateAccountName(value: string, localization: DefaultRendererLocalization): string | null;
}
