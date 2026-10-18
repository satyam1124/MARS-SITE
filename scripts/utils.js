/* ===== MOB Guard shared frontend utils (scripts/utils.js) =====
 *
 * Load this BEFORE api.js / dashboard.js / alerts.js / map.js / app.js.
 * Provides window.escapeHtml for safely rendering user-controlled values
 * (crew names, roles, emails, alert messages, contact input).
 */
(function () {
    'use strict';

    var ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    window.escapeHtml = function (value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/[&<>"']/g, function (ch) { return ESCAPE_MAP[ch]; });
    };
})();
