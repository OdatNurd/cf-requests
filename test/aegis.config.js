/******************************************************************************/


import { initializeCustomChecks, aegisSetup, aegisTeardown } from "@odatnurd/cf-aegis";

import { initializeRequestChecks } from "../aegis/index.js";


/******************************************************************************/


// Initialize custom Aegis checks for this test suite.
initializeCustomChecks();
initializeRequestChecks();


/******************************************************************************/


export const config = {
  files: [
    "test/validator.test.js",
    "test/handlers.test.js",
  ],
  hooks: {
    setup: async (ctx) => await aegisSetup(ctx),
    teardown: async (ctx) => aegisTeardown(ctx),
  },

  // Can be set to "afterSection" or "afterCollection" to have the test suite
  // exit as soon as a check fails in a section or collection. Default of
  // "ignore" runs all tests without stopping on failures.
  failAction: "afterSection",
}


/******************************************************************************/
