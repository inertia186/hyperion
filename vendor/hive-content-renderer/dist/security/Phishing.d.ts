/**
 * Based on: https://raw.githubusercontent.com/steemit/condenser/master/src/app/utils/Phishing.js
 */
export declare namespace Phishing {
    /**
     * Does this URL look like a phishing attempt?
     *
     * @param {string} questionableUrl
     * @returns {boolean}
     */
    const looksPhishy: (questionableUrl: string) => boolean;
}
