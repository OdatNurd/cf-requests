/******************************************************************************/


import { addCheck } from '@axel669/aegis';
import { validate } from '../lib/handlers.js';


/******************************************************************************/


/* A mapping of all of the common status errors that might be returned by the
 * validator. */
const STATUS_TEXT = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
};


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
  // you provide a call-compatible validator. This is here primarily to support
  // some migrations of old code that is using a different validator than the
  // one this library currently uses.
  validator = validator ??= validate;

  // Use the Hono factory to create our middleware, just as a caller would.
  const middleware = validator(dataType, schema);

  // A successful test captures the validated and masked JSON output, while a
  // failed test generates a failure JSON response and has a specific status
  // as a result of the validator's call to fail().
  let validData = null;
  let errorResponse = null;
  let responseStatus = 200;

  // In order to handle formdata, cookie, and header validation we need a
  // request object to put into the context. These portions are parsed out of
  // the response by the validator and thus can't be backfilled. This also
  // ensures that for formData we get a proper form encoded body.
  const options = { method: 'POST' };
  if (dataType === 'form') {
    // For form data, turn the passed in object into FormData and add it to
    // the body.
    options.body  = new FormData();
    Object.entries(data).forEach(([k, v]) => options.body.append(k, v));

  } else if (dataType === 'cookie') {
    // If we are testing cookies, we need a cookie header
    options.headers = { 'Cookie': Object.entries(data).map(([k,v]) => `${k}=${v}`).join('; ') }

  } else if (dataType === 'header') {
    // If we are testing a header, we need actual headers.
    options.headers = data;
  }

  // Create the response now.
  const rawRequest = new Request('http://localhost/', options)

  // Construct a mock Hono context object to pass to the middleware. We have
  // here a mix of functions that the validator will call to get data that Hono
  // has already processed or should process, such as the JSON body or the
  // mapped request URI paramters, as well as a raw Request object for things
  // that Hono does not tend to parse, such as form data and headers.
  const ctx = {
    req: {
      // The raw request; used by form data, headers, and cookies.
      raw: rawRequest,

      // These methods in the context convey information that Hono parses as a
      // part of its request handling; as such we can return the data back
      // directly.
      param: () => data,
      json: async () => data,

      // Query paramters must always return the value of a key as an array
      // since they can appear more than once; also, if you provide no key, you
      // get them all. We're precomputing here for no good reason.
      queries: (() => {
        const result = Object.entries(data).reduce((acc, [key, value]) => {
          acc[key] = Array.isArray(value) ? value : [value];
          return acc;
        }, {});

        return key => key ? result[key] : result;
      })(),

      // For form data, the validator expects to be able to get at the raw body
      // and a place to cache the parsed body data.
      arrayBuffer: async () => rawRequest.arrayBuffer(),
      bodyCache: {},

      // The context supports gathering either a single header by name, or all
      // headers (by passing undefined as a name.
      header: name => {
        if (name === undefined) {
          return data;
        }

        return name.toLowerCase() !== 'content-type' ? undefined : {
          json: 'application/json',
          form: rawRequest.headers.get('Content-Type'),
        }[dataType];
      },

      // The validator invokes this to store the validated data back to the
      // context; here we just capture it as the validated data for later
      // return.
      addValidatedData: (target, data) => validData = data
    },

    // If a failure occurs, the validator should call fail(), which invokes
    // thee two endpoints to place an error status and JSON payload into the
    // response. Here we just create an actual response object, since that is
    // what the middleware would return.
    status: status => responseStatus = status,
    json: payload => {
      errorResponse = new Response(
        JSON.stringify(payload), {
          status: responseStatus,
          statusText: STATUS_TEXT[responseStatus] ?? 'Unknown Error',
          headers: { "Content-Type": "application/json" }
        }
      );
    },
  };

  // Execute the middleware with an empty next().
  // Run the middleware; we either capture a result in the error payload or the
  // validation result.
  await middleware(ctx, () => {});

  // Return the error payload if validation failed, otherwise return the
  // validated data from the success path.
  return errorResponse ?? validData;
};


/******************************************************************************/
