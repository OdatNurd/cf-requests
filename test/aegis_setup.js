/******************************************************************************/


import { aegis } from "@axel669/aegis";
import { initializeCustomChecks } from "@odatnurd/cf-aegis";

import { initializeRequestChecks } from "../aegis/index.js";


/******************************************************************************/


// Aegis 0.4 runs each test file in its own worker thread, so checks have to be
// registered in the worker rather than in aegis.config.js. Pass this package's
// Aegis instance explicitly: a linked cf-aegis can resolve its own copy of
// @axel669/aegis, and assertions are registered per module instance.
initializeCustomChecks(aegis);
initializeRequestChecks(aegis);


/******************************************************************************/


/* Run a function that may reject and return either its value or the error it
 * raised. This keeps asynchronous failure checks in the same assertion style as
 * the rest of the suite; Aegis' built-in throws assertion is synchronous. */
export async function caught(fn) {
  try {
    return await fn();
  } catch (error) {
    return error;
  }
}


/******************************************************************************/
