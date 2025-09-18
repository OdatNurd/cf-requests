/******************************************************************************/


import { validator } from 'hono/validator';


/******************************************************************************/


/* Generate a standardized success response from an API call.
 *
 * This generates a JSON return value with the given HTTP status, with a
 * data section that contains the provided result, whatever it may be. */
export const success = (ctx, message, result, status) => {
  status ??= 200;
  result ??= [];

  ctx.status(status);
  return ctx.json({ success: true, status, message, data: result });
}


/******************************************************************************/


/* Generate a standardized error response from an API call.
 *
 * This generates a JSON return value with the given HTTP status, with an
 * error reason that is the reason specified. */
export const fail = (ctx, message, status, result) => {
  status ??= 400;

  ctx.status(status);
  return ctx.json({ success: false, status, message, data: result });
}


/******************************************************************************/


/* Create a validator that will validate the type of request data provided
 * against a specifically defined Joker schema object. The data is both
 * validated against the schema as well as filtered so that non-schema
 * properties of the data are discarded.
 *
 * This provides a middleware filter for use in Hono; it is expected to either
 * trigger a failure, or return the data that is the validated and cleaned
 * object from the request.
 *
 * When using this filter, underlying requests can fetch the validated data
 * via the ctx.req.valid() function, e.g. ctx.req.valid('json'). */
export const validate = (dataType, { validate, mask }) => validator(dataType, async (value, ctx) => {
  // Joker returns true for valid data and an array of error objects on failure.
  const result = await validate(value);
  if (result === true) {
    return typeof mask === 'function' ? mask(value) : value;
  }

  return fail(ctx, `${dataType} data is not valid`, 422, result);
});


/******************************************************************************/


/* A custom error base class that allows for route handlers to generate errors
 * with a specific message and status code without having to have more explicit
 * exception handling logic.
 *
 * When instances of this class are thrown by the code that is wrapped in a
 * call to body(), the error response from that handler will follow a standard
 * form and have a distinct HTTP error code.
 *
 * For simplicity, if the status code is not provided, 500 is assumed.
 */
export class HttpError extends Error {
  constructor(message, status=500) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

/******************************************************************************/

/* Create a request handler that will execute the provided handler function and
 * catch any exceptions that it may raise, returning an appropriate error
 * response back to the caller. */
export function body(handler) {
  return async (ctx) => {
    try {
      return await handler(ctx);
    }
    catch (err) {
      const generateTrace = ['true', 'yes'].includes(ctx.env.CF_REQUESTS_STACKTRACE);
      let trace = undefined;

      // If we should generate the stack trace and the error that we got
      // actually has a trace in it, then generate a trace array by converting
      // the stack into an array of locations for better readability.
      //
      // This elides the start line, since we capture the message already below,
      // and removes the `at` prefix since that is redundant.
      if (generateTrace === true && typeof err.stack === 'string') {
        trace = err.stack.split('\n')
          .slice(1)
          .map(line => {
            const trimmedLine = line.trim();
            return trimmedLine.startsWith('at ') ? trimmedLine.substring(3) : trimmedLine;
          });
      }

      if (err instanceof HttpError) {
        return fail(ctx, err.message, err.status, trace);
      }

      return fail(ctx, err.message, 500, trace);
    }
  }
}


/******************************************************************************/

/* This is a utility wrapper function that simplifies the creation of a Hono
 * route handler; it accepts any number of arguments and returns back a prepared
 * array of items for use as a route handler.
 *
 * Any argument that is an async function with exactly one argument is wrapped
 * in a call to body() directly, while all other values (including async
 * functions that take more than one argument) are put into the array as-is.
 *
 * This allows for not only validations but also arbitrary middleware as well
 * to be used. */
 export function routeHandler(...args) {
  return args.map(arg => {
    // Any async functions that take exactly one argument are passed through the
    // body wrapper to wrap them; everything else passes through as-is.
    if (typeof arg === 'function' && arg.constructor.name === 'AsyncFunction' && arg.length === 1) {
      return body(arg);
    }
    return arg;
  });
}

/******************************************************************************/
