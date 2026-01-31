import { Collection, $check, $ } from "@axel669/aegis";
import { success, fail, validate, SchemaError, body } from '../lib/handlers.js';

import joker from "@axel669/joker";


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
    json: (payload) => ({
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


/******************************************************************************/


/* This collection verifies the behavior of the unified response handlers,
 * ensuring that success and failure responses are formatted correctly and that
 * the validate('result') middleware correctly enforces output schemas when
 * present. */
export default Collection`Response Handlers`({
  "Success Responses": async () => {
    const ctx = mockCtx();

    await $check`success() returns standard structure with defaults`
      .value(await success(ctx, "Operation successful"))
      .isObject($)
      .eq($.success, true)
      .eq($.status, 200)
      .eq($.message, "Operation successful")
      .isArray($.data)
      .eq($.data.length, 0)
      .eq($._httpStatus, 200);

    await $check`success() respects provided status and data`
      .value(await success(ctx, "Resource Created", { id: 1 }, 201))
      .eq($.success, true)
      .eq($.status, 201)
      .eq($.message, "Resource Created")
      .eq($.data.id, 1)
      .eq($._httpStatus, 201);
  },


  /****************************************************************************/


  "Failure Responses": async () => {
    const ctx = mockCtx();

    await $check`fail() returns standard structure with defaults`
      .value(fail(ctx, "Something went wrong"))
      .isObject($)
      .eq($.success, false)
      .eq($.status, 400)
      .eq($.message, "Something went wrong")
      .eq($.data, undefined)
      .eq($._httpStatus, 400);

    await $check`fail() respects provided status and result payload`
      .value(fail(ctx, "Not Found", 404, { hint: "check the ID" }))
      .eq($.success, false)
      .eq($.status, 404)
      .eq($.data.hint, "check the ID")
      .eq($._httpStatus, 404);
  },


  /****************************************************************************/


  "Verified Responses": async () => {
    const ctx = mockCtx();

    // Manually run the verify middleware to inject the validator into the
    // context for the below tests.
    await validate('result', UserSchema)(ctx, async () => {});

    await $check`validate('result') middleware correctly sets the validator in context`
      .value(ctx.get('__cf_requests_response_validator'))
      .isObject($);

    await $check`success() validates and masks data when verification is active`
      .value(await success(ctx, "User Found", {
        id: 100,
        username: "test_user",
        email: "test@example.com",
        password: "SHOULD_BE_MASKED"
      }))
      .eq($.success, true)
      .eq($.data.id, 100)
      .eq($.data.username, "test_user")
      .eq($.data.email, "test@example.com")
      // The password field should be masked away by the schema
      .eq($.data.password, undefined);

    // Test that invalid data throws the correct SchemaError
    let error = null;
    try {
      await success(ctx, "Invalid User", { id: "not-a-number", username: "test" });
    } catch (exception) {
      error = exception;
    }

    await $check`success() throws SchemaError when data does not match schema`
      .value(error)
      .instanceof($, SchemaError)
      .eq($.status, 500)
      .isArray($.result);

    // Verify that the error result contains specific validation details
    await $check`SchemaError contains validation details`
      .value(error.result[0])
      .eq($.message, "item.data.id is not a number");
  },


  /****************************************************************************/


  "Body Integration": async () => {
    const ctx = mockCtx();

    // Manually run the verify middleware to inject the validator into the
    // context for the below tests.
    await validate('result', UserSchema)(ctx, async () => {});

    // Create a handler using body() that will trigger a schema error by passing
    // invalid data to the call to success().
    const safeHandler = body(async (c) => {
       return success(c, "Invalid", { id: "not-number" });
    });

    // Execute the handler and verify that it catches the error; for this case
    // it is important to note that we return 500 for schema errors on output
    // because that is technicaly the server being a shit.
    await $check`body() catches SchemaError and returns validation details`
      .value(safeHandler(ctx))
      .isObject($)
      .eq($.success, false)
      .eq($.status, 500)
      .isArray($.data)
      .eq($.data[0], "item.data.id is not a number (got 'not-number')");

    // Create a manual handler that double checks that throwing the exception
    // directly when outside of the body handler still gives the correct result.
    const manualHandler = body(async (c) => {
       throw new SchemaError("Manual Fail", 422, [{ message: "manual", value: "undefined" }]);
    });

    await $check`body() catches manual SchemaError with custom status`
     .value(await manualHandler(ctx))
     .eq($.success, false)
     .eq($.status, 422)
     .eq($.data[0], "manual (got 'undefined')");
  }
});


/******************************************************************************/
