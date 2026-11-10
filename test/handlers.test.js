import { aegis, $ } from "@axel669/aegis";
import { success, fail, validate, SchemaError, HttpError, body, json, routeHandler } from '../lib/handlers.js';
import { caught } from "./aegis_setup.js";

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import * as joker from "@axel669/joker";


/******************************************************************************/


export const name = "Response Handlers";


/******************************************************************************/


/* A helper to generate a schema object that mimics what the rollup plugin
 * produces, ensuring we have both validate and mask functions. */
function wrapJoker(schemaDef) {
  return {
    validate: joker.validator(schemaDef),
    mask: joker.mask(schemaDef)
  };
}


/******************************************************************************/


/* A more robust mock context that mimics Hono's ability to store and retrieve
 * environment variables, set status codes, and importantly, get/set arbitrary
 * values in the context (which is required for the verify middleware). */
const mockCtx = (env = {}) => {
  const store = new Map();
  let currentStatus = 200;

  return {
    env,

    // Emulate Hono's context storage
    set: (key, value) => store.set(key, value),
    get: (key) => store.get(key),

    // Emulate response helpers
    status: (code) => { currentStatus = code; },
    body: (payload, code) => ({ _body: payload, _httpStatus: code }),
    json: (payload) => payload === null ? null : ({
      ...payload,

      // We attach the status here so we can verify it in tests, even though
      // Hono sends it via the Response object.
      _httpStatus: currentStatus
    })
  };
};


/******************************************************************************/


export const UserSchema = wrapJoker({
  root: {
    "success": "bool",
    "status": "number",
    "message": "string",
    "data": {
      id: "number",
      username: "string",
      "?email": "string"
    }
  }
});


export const RawJSONSchema = wrapJoker({
  root: {
    "value1": "string",
    "value2": "number",
    "?value3": "bool"
  }
})


// Schemas for testing status routing
export const Status200Schema = wrapJoker({
  root: {
    "is_ok": "bool"
  }
});

export const StatusDefaultSchema = wrapJoker({
  root: {
    "is_error": "bool",
    "error_code": "number"
  }
});


// Wrapper schemas for testing success() status routing
export const Success200Schema = wrapJoker({
  root: {
    "success": "bool",
    "status": "number",
    "message": "string",
    "data": {
      "ok": "bool"
    }
  }
});

export const SuccessDefaultSchema = wrapJoker({
  root: {
    "success": "bool",
    "status": "number",
    "message": "string",
    "data": {
      "fallback": "bool"
    }
  }
});


/******************************************************************************/


/* This collection verifies the behavior of the unified response handlers,
 * ensuring that success and failure responses are formatted correctly and that
 * the validate('result') middleware correctly enforces output schemas when
 * present. */
aegis.test`Success Responses`(async () => {
  const ctx = mockCtx();

  const defaults = await success(ctx, "Operation successful");
  $.check`success() returns standard structure with defaults`(
    $.isObject(defaults),
    $.eq(defaults.success, true),
    $.eq(defaults.status, 200),
    $.eq(defaults.message, "Operation successful"),
    $.isArray(defaults.data),
    $.eq(defaults.data.length, 0),
    $.eq(defaults._httpStatus, 200)
  );

  const created = await success(ctx, "Resource Created", { id: 1 }, 201);
  $.check`success() respects provided status and data`(
    $.eq(created.success, true),
    $.eq(created.status, 201),
    $.eq(created.message, "Resource Created"),
    $.eq(created.data.id, 1),
    $.eq(created._httpStatus, 201)
  );
});


/******************************************************************************/


aegis.test`Failure Responses`(async () => {
  const ctx = mockCtx();

  const defaults = fail(ctx, "Something went wrong");
  $.check`fail() returns standard structure with defaults`(
    $.isObject(defaults),
    $.eq(defaults.success, false),
    $.eq(defaults.status, 400),
    $.eq(defaults.message, "Something went wrong"),
    $.eq(defaults.data, undefined),
    $.eq(defaults._httpStatus, 400)
  );

  const notFound = fail(ctx, "Not Found", 404, { hint: "check the ID" });
  $.check`fail() respects provided status and result payload`(
    $.eq(notFound.success, false),
    $.eq(notFound.status, 404),
    $.eq(notFound.data.hint, "check the ID"),
    $.eq(notFound._httpStatus, 404)
  );
});


/******************************************************************************/


aegis.test`Status Validation`(async () => {
  const invalidSuccess = await caught(() => success(mockCtx(), "bad", [], 199));
  $.check`success() rejects an invalid status with a clear error`(
    $.instanceof(invalidSuccess, RangeError),
    $.eq(invalidSuccess.message, "invalid HTTP status '199'; expected an integer from 200 to 599")
  );

  const invalidJSON = await caught(() => json(mockCtx(), {}, 200.5));
  $.check`json() rejects a non-integer status with a clear error`(
    $.instanceof(invalidJSON, RangeError),
    $.eq(invalidJSON.message, "invalid HTTP status '200.5'; expected an integer from 200 to 599")
  );

  const invalidFail = await caught(() => fail(mockCtx(), "bad", 600));
  $.check`fail() rejects an out-of-range status with a clear error`(
    $.instanceof(invalidFail, RangeError),
    $.eq(invalidFail.message, "invalid HTTP status '600'; expected an integer from 200 to 599")
  );

  const invalidHttpError = await caught(() => new HttpError("bad", 99));
  $.check`HttpError rejects an invalid status with a clear error`(
    $.instanceof(invalidHttpError, RangeError),
    $.eq(invalidHttpError.message, "invalid HTTP status '99'; expected an integer from 200 to 599")
  );

  const validatedCtx = mockCtx();
  await validate('result', UserSchema)(validatedCtx, async () => {});

  const bodyless = await success(validatedCtx, "no content", { id: "not-a-number" }, 204);
  $.check`success() skips result validation for a bodyless status`(
    $.eq(bodyless._body, null),
    $.eq(bodyless._httpStatus, 204)
  );

  const noBody = await json(mockCtx(), { ignored: true }, 304);
  $.check`json() sends a null body for a bodyless status`(
    $.eq(noBody._body, null),
    $.eq(noBody._httpStatus, 304)
  );

  const reset = fail(mockCtx(), "reset", 205);
  $.check`fail() sends a null body for a bodyless status`(
    $.eq(reset._body, null),
    $.eq(reset._httpStatus, 205)
  );
});


/******************************************************************************/


aegis.test`Verified Responses`(async () => {
  const ctx = mockCtx();

  // Manually run the verify middleware to inject the validator into the context
  // for the below tests.
  await validate('result', UserSchema)(ctx, async () => {});

  $.check`validate('result') middleware correctly sets the validator in context`(
    $.isObject(ctx.get('__cf_requests_response_validator'))
  );

  const valid = await success(ctx, "User Found", {
    id: 100,
    username: "test_user",
    email: "test@example.com",
    password: "SHOULD_BE_MASKED"
  });
  $.check`success() validates and masks data when verification is active`(
    $.eq(valid.success, true),
    $.eq(valid.data.id, 100),
    $.eq(valid.data.username, "test_user"),
    $.eq(valid.data.email, "test@example.com"),
    // The password field should be masked away by the schema
    $.eq(valid.data.password, undefined)
  );

  // Test that invalid data throws the correct SchemaError
  const error = await caught(() =>
    success(ctx, "Invalid User", { id: "not-a-number", username: "test" }));

  $.check`success() throws SchemaError when data does not match schema`(
    $.instanceof(error, SchemaError),
    $.eq(error.status, 500),
    $.isArray(error.result)
  );

  // Verify that the error result contains specific validation details
  $.check`SchemaError contains validation details`(
    $.eq(error.result[0].message, "item.data.id is not a number")
  );
});


/******************************************************************************/


aegis.test`Body Integration`(async () => {
  const ctx = mockCtx();

  // Manually run the verify middleware to inject the validator into the context
  // for the below tests.
  await validate('result', UserSchema)(ctx, async () => {});

  // Create a handler using body() that will trigger a schema error by passing
  // invalid data to the call to success().
  const safeHandler = body(async (c) => {
    return success(c, "Invalid", { id: "not-number" });
  });

  // Execute the handler and verify that it catches the error; for this case it
  // is important to note that we return 500 for schema errors on output because
  // that is technicaly the server being a shit.
  const caughtSchema = await safeHandler(ctx);
  $.check`body() catches SchemaError and returns validation details`(
    $.isObject(caughtSchema),
    $.eq(caughtSchema.success, false),
    $.eq(caughtSchema.status, 500),
    $.isArray(caughtSchema.data),
    $.eq(caughtSchema.data[0], "item.data.id is not a number (got 'not-number')")
  );

  // Create a manual handler that double checks that throwing the exception
  // directly when outside of the body handler still gives the correct result.
  const manualHandler = body(async (c) => {
    throw new SchemaError("Manual Fail", 422, [{ message: "manual", value: "undefined" }]);
  });

  const manual = await manualHandler(ctx);
  $.check`body() catches manual SchemaError with custom status`(
    $.eq(manual.success, false),
    $.eq(manual.status, 422),
    $.eq(manual.data[0], "manual (got 'undefined')")
  );

  const stringHandler = body(async () => {
    throw "boom";
  });

  const nonError = await stringHandler(ctx);
  $.check`body() reports a thrown non-Error value`(
    $.eq(nonError.status, 500),
    $.eq(nonError.message, "boom")
  );
});


/******************************************************************************/


aegis.test`Validation Error Formatting`(async () => {
  const ctx = mockCtx();

  const mixedHandler = body(async () => {
    throw new SchemaError("Invalid", 422, [
      { message: "item is wrong", value: 1 },
      "not an error object",
      null
    ]);
  });

  const mixed = await mixedHandler(ctx);
  $.check`body() formats error objects and leaves other entries alone`(
    $.eq(mixed.status, 422),
    $.isArray(mixed.data),
    $.eq(mixed.data[0], "item is wrong (got '1')"),
    $.eq(mixed.data[1], "not an error object"),
    $.eq(mixed.data[2], null)
  );
});


/******************************************************************************/


aegis.test`Foreign Error Copies`(async () => {
  // Importing the module through a different URL creates a second copy with its
  // own classes, which is what a duplicated dependency looks like.
  const foreign = await import('../lib/handlers.js?foreign-copy');

  $.check`a foreign HttpError is not an instance of this copy's class`(
    $.eq(new foreign.HttpError("teapot", 418) instanceof HttpError, false)
  );

  const schemaHandler = body(async () => {
    throw new foreign.SchemaError("foreign", 422, [
      { message: "bad", value: "data" }
    ]);
  });

  const foreignSchema = await schemaHandler(mockCtx());
  $.check`body() honours the status and data of a foreign SchemaError`(
    $.eq(foreignSchema.status, 422),
    $.isArray(foreignSchema.data),
    $.eq(foreignSchema.data[0], "bad (got 'data')")
  );

  const httpHandler = body(async () => {
    throw new foreign.HttpError("foreign status", 418);
  });

  const foreignHttp = await httpHandler(mockCtx());
  $.check`body() honours the status of a foreign HttpError`(
    $.eq(foreignHttp.status, 418)
  );
});


/******************************************************************************/


aegis.test`Hono HTTP Exceptions`(async () => {
  const handler = body(async () => {
    throw new HTTPException(401, { message: "no auth" });
  });

  const response = await handler(mockCtx());

  $.check`body() returns Hono's response for an HTTPException`(
    $.instanceof(response, Response),
    $.eq(response.status, 401)
  );

  $.check`the HTTPException response carries its message`(
    $.eq(await response.text(), "no auth")
  );
});


/******************************************************************************/


aegis.test`Schema Guards`(async () => {
  const missingInput = await caught(() => validate('json', undefined));
  $.check`validate() explains a missing input schema`(
    $.eq(missingInput?.message, "validation for 'json' requires a schema object")
  );

  const missingResult = await caught(() => validate('result', null));
  $.check`validate() explains a missing result schema`(
    $.eq(missingResult?.message, "validation for 'result' requires a schema object")
  );
});


/******************************************************************************/


aegis.test`Route Handler`(async () => {
  const asyncMiddleware = async (ctx, next) => {
    await next();
  };
  const syncMiddleware = (ctx, next) => next();
  const asyncHandler = async (ctx) => success(ctx, "async ok", { id: 1 });
  const syncHandler = (ctx) => success(ctx, "sync ok", { id: 2 });
  const syncThrower = (ctx) => {
    throw new SchemaError("sync fail", 422, []);
  };
  const zeroArity = () => {};

  const handler = routeHandler(
    asyncMiddleware,
    syncMiddleware,
    asyncHandler,
    syncHandler,
    syncThrower,
    zeroArity
  );

  $.check`routeHandler() returns every argument in order`(
    $.eq(handler.length, 6)
  );

  $.check`routeHandler() leaves async middleware untouched`(
    $.eq(handler[0] === asyncMiddleware, true)
  );

  $.check`routeHandler() leaves sync middleware untouched`(
    $.eq(handler[1] === syncMiddleware, true)
  );

  $.check`routeHandler() leaves zero-argument functions untouched`(
    $.eq(handler[5] === zeroArity, true)
  );

  $.check`routeHandler() wraps an async single-argument handler in body()`(
    $.eq(handler[2].constructor.name, 'AsyncFunction')
  );

  const asyncResult = await handler[2](mockCtx());
  $.check`routeHandler() runs an async single-argument handler`(
    $.eq(asyncResult.message, "async ok"),
    $.eq(asyncResult.data.id, 1)
  );

  $.check`routeHandler() wraps a regular single-argument handler in body()`(
    $.eq(handler[3].constructor.name, 'AsyncFunction')
  );

  const syncResult = await handler[3](mockCtx());
  $.check`routeHandler() runs a regular single-argument handler`(
    $.eq(syncResult.message, "sync ok"),
    $.eq(syncResult.data.id, 2)
  );

  const thrownResult = await handler[4](mockCtx());
  $.check`routeHandler() catches errors from a regular handler`(
    $.eq(thrownResult.status, 422),
    $.eq(thrownResult.message, "sync fail")
  );
});


/******************************************************************************/


aegis.test`HTTP Error`(async () => {
  const handler = body(async () => {
    throw new HttpError("teapot", 418);
  });

  const response = await handler(mockCtx());
  $.check`body() uses the status from an HttpError`(
    $.eq(response.status, 418),
    $.eq(response.message, "teapot")
  );
});


/******************************************************************************/


aegis.test`Real Hono Responses`(async () => {
  const app = new Hono();

  app.get('/success', body((ctx) => success(ctx, "ok", { id: 1 })));
  app.get('/null', body((ctx) => json(ctx, null)));
  app.get('/error', body(async () => { throw new Error("boom"); }));
  app.get('/http', body(async () => { throw new HttpError("teapot", 418); }));
  app.get('/exception', body(async () => {
    throw new HTTPException(401, { message: "no auth" });
  }));

  const okResponse = await app.request('/success');
  const okBody = await okResponse.json();

  $.check`a real Hono request returns the success envelope`(
    $.eq(okBody.success, true),
    $.eq(okBody.data.id, 1)
  );

  const nullResponse = await app.request('/null');

  $.check`a real Hono request preserves a null body`(
    $.eq(await nullResponse.text(), 'null')
  );

  const errorResponse = await app.request('/error');
  const errorBody = await errorResponse.json();

  $.check`a handler without an env still returns the JSON error envelope`(
    $.eq(errorResponse.status, 500)
  );

  $.check`the env-less error envelope is the standard one`(
    $.eq(errorBody.success, false)
  );

  const httpResponse = await app.request('/http');

  $.check`a real Hono request honors HttpError statuses`(
    $.eq(httpResponse.status, 418)
  );

  const exceptionResponse = await app.request('/exception');

  $.check`a real Hono request honors HTTPException statuses`(
    $.eq(exceptionResponse.status, 401)
  );
});


/******************************************************************************/


aegis.test`Bodyless Statuses`(async () => {
  const app = new Hono();

  app.get('/no-content', body((ctx) => success(ctx, "no content", { id: 1 }, 204)));
  app.get('/reset-content', body((ctx) => fail(ctx, "reset", 205)));
  app.get('/not-modified', body((ctx) => json(ctx, { ignored: true }, 304)));

  const noContent = await app.request('/no-content');

  $.check`a real 204 response keeps its status`(
    $.eq(noContent.status, 204)
  );

  $.check`a real 204 response sends no content`(
    $.eq(await noContent.text(), '')
  );

  const resetContent = await app.request('/reset-content');

  $.check`a real 205 response keeps its status`(
    $.eq(resetContent.status, 205)
  );

  $.check`a real 205 response sends no content`(
    $.eq(await resetContent.text(), '')
  );

  const notModified = await app.request('/not-modified');

  $.check`a real 304 response keeps its status`(
    $.eq(notModified.status, 304)
  );

  $.check`a real 304 response sends no content`(
    $.eq(await notModified.text(), '')
  );
});


/******************************************************************************/


aegis.test`Raw JSON Responses`(async () => {
  const ctx = mockCtx();

  const payload = await json(ctx, { hello: "world" });
  $.check`json() returns exact payload with default status`(
    $.isObject(payload),
    $.eq(payload.hello, "world"),
    $.eq(payload._httpStatus, 200)
  );

  const created = await json(ctx, { created: true }, 201);
  $.check`json() respects provided status`(
    $.eq(created.created, true),
    $.eq(created._httpStatus, 201)
  );

  const nullCtx = mockCtx();

  $.check`json() preserves an explicit null body`(
    $.eq(await json(nullCtx, null), null)
  );

  // Manually run the verify middleware to inject the RawJSONSchema validator
  await validate('result', RawJSONSchema)(ctx, async () => {});

  const originalData = {
    value1: "test_string",
    value2: 42,
    extra_field: "SHOULD_BE_MASKED"
  };

  const validated = await json(ctx, originalData);
  $.check`json() validates and masks data when verification is active`(
    $.eq(validated.value1, "test_string"),
    $.eq(validated.value2, 42),
    $.eq(validated.extra_field, undefined)
  );

  // Test that invalid data throws the correct SchemaError
  const error = await caught(() =>
    json(ctx, { value1: 100, value2: "string_instead_of_number" }));

  $.check`json() throws SchemaError when data does not match schema`(
    $.instanceof(error, SchemaError),
    $.eq(error.status, 500),
    $.isArray(error.result)
  );
});


/******************************************************************************/


aegis.test`Status Mapped Schemas`(async () => {
  const singleCtx = mockCtx();
  const mapCtx = mockCtx();

  // 1. Test that a single schema applies to any status code (wraps in default)
  await validate('result', RawJSONSchema)(singleCtx, async () => {});

  const single200 = await json(singleCtx, { value1: "test", value2: 1, extra: "drop" }, 200);
  $.check`Single schema validates and masks a 200 status`(
    $.eq(single200.value1, "test"),
    $.eq(single200.extra, undefined)
  );

  const single404 = await json(singleCtx, { value1: "test404", value2: 2, extra: "drop" }, 404);
  $.check`Single schema validates and masks a 404 status`(
    $.eq(single404.value1, "test404"),
    $.eq(single404.extra, undefined)
  );

  // 2. Test status mapping logic using json()
  await validate('result', {
    200: Status200Schema,
    default: StatusDefaultSchema
  })(mapCtx, async () => {});

  const mapped200 = await json(mapCtx, { is_ok: true, extra: "drop" }, 200);
  $.check`json() applies the specific schema for a matching status`(
    $.eq(mapped200.is_ok, true),
    $.eq(mapped200.extra, undefined)
  );

  const mapped404 = await json(mapCtx, { is_error: true, error_code: 404, extra: "drop" }, 404);
  $.check`json() falls back to the default schema for a non-matching status`(
    $.eq(mapped404.is_error, true),
    $.eq(mapped404.error_code, 404),
    $.eq(mapped404.extra, undefined)
  );

  // 3. Test status mapping logic using success() envelope
  const successMapCtx = mockCtx();
  await validate('result', {
    200: Success200Schema,
    default: SuccessDefaultSchema
  })(successMapCtx, async () => {});

  const success200 = await success(successMapCtx, "OK", { ok: true, extra: "drop" }, 200);
  $.check`success() applies the specific schema for a matching status`(
    $.eq(success200.data.ok, true),
    $.eq(success200.data.extra, undefined)
  );

  const success404 = await success(successMapCtx, "Fallback", { fallback: true, extra: "drop" }, 404);
  $.check`success() falls back to the default schema for a non-matching status`(
    $.eq(success404.data.fallback, true),
    $.eq(success404.data.extra, undefined)
  );
});


/******************************************************************************/
