/******************************************************************************/


import { validator } from 'hono/validator';


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


/* This custom error class works as HttpError does, but it is specificaly thrown
 * to indicate that there was a schema validation error, either on input or on
 * output.
 *
 * The result here is optional and if given is used as the result in the
 * handler's fail() call; for schema errors this generally returns the object
 * that the schema validator returns when it signals the error. */
export class SchemaError extends HttpError {
  constructor(message, status=500, result=undefined) {
    super(message, status);
    this.name = 'SchemaError';
    this.result = result;
  }
}


/******************************************************************************/


/* This internal helper takes an array of error objects in Joker format which
 * are the result of a validation failure, and converts them into strings so
 * that they are easier to read than the objects that Joker produces.
 *
 * If the result passed in is not an array it will be returned untouched. In a
 * similar vein, an entries in the list that are not objects that have the
 * required fields are left alone as well. */
const getErrors = (errors) => {
  if (Array.isArray(errors) === true) {
    errors = errors.map(e => {
      if ("message" in e && "value" in e) {
        return `${e.message} (got '${e.value}')`
      } else {
        return e;
      }
    })
  }

  return errors;
}


/******************************************************************************/


/* Examine the context provided to see if a result validator was provided,
 * choose the one for the status that is provided, and validate the data in the
 * body, throwing a SchemaError if the data does not validate.
 *
 * If the data in the body DOES validate, then use the appropriate mask function
 * (if any) to mask the body.
 *
 * The returned result is the payload, ready for return. */
function validatePayload(ctx, status, body) {
  // Try to get the schema map out of the context; if it was found, then we need
  // to validate.
  const schemaMap = ctx.get('__cf_requests_response_validator');
  if (schemaMap !== undefined) {
    // The validation object to use is either the one for the status provided,
    // or, if there is no such entry, the default map entry.
    const validator = schemaMap[status] ?? schemaMap['default'];

    if (validator !== undefined) {
      // Try to validate; if this does not return true, then the data is not
      // valid and we should throw an error. If there is a mask function, then
      // use it to set up the value of the result.
      const valid = validator.validate(body);
      if (valid !== true) {
        throw new SchemaError(`response data for status ${status} failed schema validation`, 500, valid);
      }

      // Try to validate; if this does not return true, then the data is not
      // valid and we should throw an error. If there is a mask function, then
      // use it to set up the value of the result.
      if (typeof validator.mask === 'function') {
        return validator.mask(body);
      }
    }
  }

  return body;
}


/******************************************************************************/


/* Generate a standardized success response from an API call. If the provided
 * context has a response guard attached to it, the result that is provided will
 * be validated against it (and also masked, if a mask was provided) prior to
 * being attached to the output and returned.
 *
 * If this results in an error, an exception is thrown to indicate this; the
 * standard machinery will catch this and handle it as appropriate.
 *
 * On success (no validation, or validation passes), this generates a JSON
 * return value with the given HTTP status, with a data section that contains
 * the provided result, whatever it may be (and which could possibly have been
 * masked). */
export const success = async (ctx, message, result, status) => {
  status ??= 200;
  result ??= [];

  // Construct the body that we will be returning back and validate/mask it as
  // appropriate.
  let body = validatePayload(ctx, status, { success: true, status, message, data: result });

  ctx.status(status);
  return ctx.json(body);
}

/******************************************************************************/


/* Generate a standardized JSON response from an API call. If the provided
 * context has a response guard attached to it, the body that is provided will
 * be validated against it (and also masked, if a mask was provided) prior to
 * being passed to the underlying framework.
 *
 * If this results in an error, an exception is thrown to indicate this; the
 * standard machinery will catch this and handle it as appropriate.
 *
 * On success (no validation, or validation passes), this generates a JSON
 * return value with the given HTTP status containing the (possibly masked)
 * body. */
export const json = async (ctx, result, status) => {
  status ??= 200;

  // Construct the body that we will be returning back and validate/mask it as
  // appropriate.
  let body = validatePayload(ctx, status, result ?? []);

  ctx.status(status);
  return ctx.json(body);
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
 * properties of the data are discarded, if applicable.
 *
 * This provides a middleware filter for use in Hono; it is expected to either
 * trigger a failure, or return the data that is the validated and cleaned
 * object from the request.
 *
 * When using this filter, underlying requests can fetch the validated data
 * via the ctx.req.valid() function, e.g. ctx.req.valid('json').
 *
 * The schema to use is specified as an object with a "validate" function that
 * can verify the data and an optional "mask" function to mask data away if
 * desired.
 *
 * When the special data type "result" is used, the middleware is set up to be
 * used to verify the result of the response before it is transmitted. In this
 * specific case, the schema input can be as above to apply the same schema to
 * the result regardless of the status, or it can be an objects with keys that
 * are status values (or "default" as a fallback) and values that represent the
 * schema to use for that status type, falling back to the "default" key if a
 * specific status is not defined. */
export const validate = (dataType, schemaInput) => {
  // If this is our own internal `result` data type, then return a middleware
  // that will store the validator into the context to be used by the json() or
  // success() functions. This supports both single schemas and status maps.
  //
  // Due to my excessive amount of paranoia, this is namespaced with the package
  // name to slightly reduce the possibility of a name conflict.
  if (dataType === 'result') {
    // The schema input can be either a single object with "validate" and
    // "mask" keys (and mask is optional), or it can be an object that maps
    // status  codes to such objects, allowing for per-result schema checking.
    //
    // Such a schema object supports "default" as the default schema status
    // key, to be used for every other status. When the incoming object has a
    // "validate" key, we assume that this is intended to be a single schema
    // lookup for all possible statuses.
    let schemaMap = schemaInput;
    if (typeof schemaInput.validate === 'function') {
      schemaMap = { default: schemaInput };
    }

    return async (ctx, next) => {
      ctx.set('__cf_requests_response_validator', schemaMap);
      await next();
    }
  }

  // All other data types are inputs, and they require the schema input to be a
  // single object; for the sake of sanity, catch people doing that and error
  // out.
  const validateFn = schemaInput.validate;
  const maskFn = schemaInput.mask;

  if (typeof validateFn !== 'function') {
    throw new Error(`validation for input type '${dataType}' requires a single schema object, not a status map`);
  }

  // We can now fall through to the Hono validator function to make the call and
  // let it build the middleware for us.
  return validator(dataType, async (value, ctx) => {
    // Joker returns true for valid data and an array of error objects on
    // failure.
    const result = await validateFn(value);
    if (result === true) {
      return typeof maskFn === 'function' ? maskFn(value) : value;
    }

    // Fail with 422 to signal unprocessible entity.
    return fail(ctx, `request ${dataType} data failed schema validation`, 422, getErrors(result));
  });
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
      // By default, the result has no data attached.
      let errorData = undefined;

      // If the exception is a schema validation error, then the exception will
      // carry what we want to use for the result, since that tells us how the
      // validation failed.
      if (err instanceof SchemaError) {
        errorData = getErrors(err.result);
      } else {
        // This is not a schema validation; check to see if we should be adding
        // a stack trace as the data instead.
        const generateTrace = ['true', 'yes'].includes(ctx.env.CF_REQUESTS_STACKTRACE);

        // If we should generate the stack trace and the error that we got
        // actually has a trace in it, then generate a trace array by converting
        // the stack into an array of locations for better readability.
        //
        // This elides the start line, since we capture the message already
        // below, and removes the `at` prefix since that is redundant.
        if (generateTrace === true && typeof err.stack === 'string') {
          errorData = err.stack.split('\n')
            .slice(1)
            .map(line => {
              const trimmedLine = line.trim();
              return trimmedLine.startsWith('at ') ? trimmedLine.substring(3) : trimmedLine;
            });
        }
      }

      // If the error was an HttpError or a SchemaError, then use its status as
      // the status; otherwise default to 500.
      const status = (err instanceof HttpError) ? err.status : 500;

      return fail(ctx, err.message, status, errorData);
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
