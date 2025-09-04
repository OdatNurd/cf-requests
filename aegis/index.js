/******************************************************************************/


import { addCheck } from '@axel669/aegis';
import { validate } from '../lib/handlers.js';


/******************************************************************************/


/*
 * Initializes some custom Aegis checks that make testing of schema and data
 * requests easier.
 *
 * This is entirely optional.
 */
export function initializeRequestChecks() {
  // Check that a value is a response object from our middleware
  addCheck.value.isResponse(
    source => source instanceof Response
  );

  // Check that a value is NOT a response object
  addCheck.value.isNotResponse(
    source => (source instanceof Response) === false
  );

  addCheck.value.isResponseWithStatus(
    (source, status) => source instanceof Response && source.status === status
  );
}


/******************************************************************************/


/* A helper function to be able to test the schema validation options in the
 * library. This takes a schema object and data type such as you would pass to
 * the validate() function, along with an input data object, and exercises that
 * the schema works as expected.
 *
 * The result of the call is either a JSON object that represents the validated
 * and masked input data if the schema validated the data, or a Response object
 * that carries the failure of the validation. This would be a response of code
 * 400 with a JSON body that carries the actual validation failure message
 * within it. */
export async function schemaTest(dataType, schema, data, validator) {
  // If a validator is provided, use it; otherwise use ours. This requires that
  // you provide a call-compatible validator. This is here only to support some
  // migrations of old code that is using a different validator than the one
  // this library currently uses.
  validator = validator ??= validate;

  // Use the Hono factory to create our middleware, just as a caller would.
  // Create a middleware using the Hono factory method for this, using the
  // schema object and data type provided.
  const middleware = validator(dataType, schema);

  // As a result of the middleware, we will either capture the validated (and
  // masked) input JSON data, or we will capture an error response. As a part of
  // this we also capture what the eventual status of the call would be if this
  // generates a response, so that we can put it into the response object.
  let validData = null;
  let errorResponse = null;
  let responseStatus = 200;

  // A fake next to pass to the middleware when we execute it, so that it does
  // not throw an error.
  const next = () => {};

  // In order to run the test we need to create a fake Hono context object to
  // pass to the middleware; this mimics the smallest possible footprint of
  // Hono context for our purposes.
  const ctx = {
    req: {
      // These methods are used by the validator to pull the parsed data out of
      // the request in order to validate it.
      param: () => data,
      json: async () => data,
      query: () => data,
      header: () => data,
      cookie: () => data,
      form: async () => data,

      // The validator invokes this to get headers out of the request when the
      // data type is JSON.
      header: (name) => {
        return name.toLowerCase() !== 'content-type' ? undefined : {
          json: 'application/json',
          form: 'multipart/form-data',
        }[dataType];
      },

      // When validation succeeds, it invokes this to store the data back into
      // the context.
      addValidatedData: (target, data) => validData = data
    },

    // Used to capture a failure; the validator will invoke status to set the
    // required HTTP response and then invoke the json() method to populate the
    // error.
    status: (inStatus) => { responseStatus = inStatus; },
    json: (payload) => {
      errorResponse = new Response(
        JSON.stringify(payload), {
          status: responseStatus,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" }
        }
      );
    },
  };

  // Run the middleware; we either capture a result in the error payload or the
  // validation result.
  await middleware(ctx, next);

  // Return the error payload if validation failed, otherwise return the
  // validated data from the success path.
  return errorResponse ?? validData;
};


/******************************************************************************/
