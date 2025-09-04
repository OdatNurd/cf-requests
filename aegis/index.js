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

  // For form data, we need to create a single, shared request object *before*
  // we build the context, so that both the header and the body can be derived
  // from the same source, ensuring the multipart boundary matches.
  let tempRequest = null;
  if (dataType === 'form') {
    const formData = new FormData();
    for (const key in data) {
      formData.append(key, data[key]);
    }
    tempRequest = new Request('http://localhost', {
      method: 'POST',
      body: formData,
    });
  }


  // In order to run the test we need to create a fake Hono context object to
  // pass to the middleware; this mimics the smallest possible footprint of
  // Hono context for our purposes.
  const ctx = {
    req: {
      // These methods are used by the validator to pull the parsed data out of
      // the request in order to validate it, except for when the data type is
      // header, in which case it invokes the header() function with no name.
      param: () => data,
      json: async () => data,
      query: (key) => data[key],
      queries: (key) => {
        const result = {};
        for(const [k, v] of Object.entries(data)) {
          result[k] = Array.isArray(v) ? v : [v];
        }
        return key ? result[key] : result;
      },
      cookie: () => data,
      formData: async () => {
        if (dataType === 'form') {
           return tempRequest.formData();
        }
        // Fallback for other types, though not strictly needed by the validator
        const formData = new FormData();
        for (const key in data) {
          formData.append(key, data[key]);
        }
        return formData;
      },
      // For form data, the validator expects to be able to get the raw body
      // as an ArrayBuffer. We can simulate this by URL-encoding the data.
      arrayBuffer: async () => tempRequest ? tempRequest.arrayBuffer() : new ArrayBuffer(0),
      // The validator also uses a bodyCache property to store parsed bodies.
      bodyCache: {},


      // We need to populate an actual cookie header in headers for it the
      // validator to be able to pull cookie data because it wants to parse it
      // itself.
      headers: new Headers(dataType === 'cookie'
        ? { 'Cookie': Object.entries(data).map(([k,v]) => `${k}=${v}`).join('; ') }
        : {}),

      // The validator invokes this to get headers out of the request when the
      // data type is JSON.
      header: (name) => {
        // If there is no name, return the data back directly; this call pattern
        // happens when the data type is header.
        if (name === undefined) {
          return data;
        }

        return name.toLowerCase() !== 'content-type' ? undefined : {
          json: 'application/json',
          form: tempRequest?.headers.get('Content-Type'),
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
