import { aegis, $ } from "@axel669/aegis";
import { schemaTest } from "../aegis/index.js";
import { body } from '../lib/handlers.js';
import { caught } from "./aegis_setup.js";

import * as joker from "@axel669/joker";


/******************************************************************************/


// Extend Joker to support being able to validate a type of file, which
// represents a File instance, for in our form testing.
joker.extendTypes({
  "file.$": (item) => (item instanceof File) === false,
});


/******************************************************************************/


/* When using the Joker Rollup plugin, you get an object with validate and
 * mask properties, and our validator is set to assume that. For our tests
 * here where we're not using the plugin, this simple helper takes a schema
 * definition and returns the appropriate object directly. */
function wrapJoker(schemaDef, includeMask = true) {
  const result = {
    validate: joker.validator(schemaDef)
  };

  if (includeMask === true) {
    result.mask = joker.mask(schemaDef);
  }

  return result;
}


/******************************************************************************/


export const name = "Schema Validation";


export const JsonSchema = wrapJoker({
  root: {
    userId: "number",
    "?isActive": "bool",
  }
});

export const JsonDateSchema = wrapJoker({
  root: {
    "created": "string"
  }
});

export const FormSchema = wrapJoker({
  root: {
    username: "string",
    "?avatar": "file",
  }
});

export const QuerySchema = wrapJoker({
  root: {
    search: "string",
    "?page": "string",
  }
});

export const ParamSchema = wrapJoker({
  root: {
    id: "string",
    "?format": "string",
  }
});

export const HeaderSchema = wrapJoker({
  root: {
    "x_request_id": "string",
    "?x_api_version": "string",
  }
});

export const CookieSchema = wrapJoker({
  root: {
    "session_id": "string",
    "?theme": "string",
  }
});

export const MaskSchema = wrapJoker({
  root: {
    "field1": "string"
  }
});

export const NoMaskSchema = wrapJoker({
  root: {
    "field1": "string"
  }
}, false);

export const ResultSchema = wrapJoker({
  root: {
    "value1": "string",
    "?value2": "number"
  }
});


/******************************************************************************/


aegis.test`Masking`(async () => {
  const masked = await schemaTest('json', MaskSchema, { field1: 'hello', field2: 'world' });
  $.check`should mask away extra fields when mask function is present`(
    $.isObject(masked),
    $.eq(masked.field1, 'hello'),
    $.eq(masked.field2, undefined)
  );

  const unmasked = await schemaTest('json', NoMaskSchema, { field1: 'hello', field2: 'world' });
  $.check`should not mask away extra fields when mask function is absent`(
    $.isObject(unmasked),
    $.eq(unmasked.field1, 'hello'),
    $.eq(unmasked.field2, 'world')
  );
});


/******************************************************************************/


aegis.test`JsonSchema`(async () => {
  const withOptional = await schemaTest('json', JsonSchema, { userId: 123, isActive: true });
  $.check`should succeed with valid required and optional json data`(
    $.isObject(withOptional),
    $.eq(withOptional.userId, 123),
    $.eq(withOptional.isActive, true)
  );

  const requiredOnly = await schemaTest('json', JsonSchema, { userId: 456 });
  $.check`should succeed with only required json data`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly.userId, 456)
  );

  const missing = await schemaTest('json', JsonSchema, { isActive: false });
  $.check`should fail if required json data is missing`(
    $.isResponseWithStatus(missing, 422)
  );

  const serialized = await schemaTest('json', JsonDateSchema, { created: new Date() });
  $.check`should validate json data after it has been serialized`(
    $.isObject(serialized)
  );
});


/******************************************************************************/


aegis.test`FormSchema`(async () => {
  const withOptional = await schemaTest('form', FormSchema, {
    username: 'testuser',
    avatar: new File([], 'avatar.png')
  });
  $.check`should succeed with valid required and optional form data`(
    $.isObject(withOptional),
    $.eq(withOptional.username, 'testuser')
  );

  const requiredOnly = await schemaTest('form', FormSchema, { username: 'testuser' });
  $.check`should succeed with only required form data`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly.username, 'testuser')
  );

  const missing = await schemaTest('form', FormSchema, {
    avatar: new File([], 'avatar.png')
  });
  $.check`should fail if required form data is missing`(
    $.isResponseWithStatus(missing, 422)
  );
});


/******************************************************************************/


aegis.test`QuerySchema`(async () => {
  const withOptional = await schemaTest('query', QuerySchema, { search: 'testing', page: '2' });
  $.check`should succeed with valid required and optional query params`(
    $.isObject(withOptional),
    $.eq(withOptional.search, 'testing'),
    $.eq(withOptional.page, '2')
  );

  const requiredOnly = await schemaTest('query', QuerySchema, { search: 'testing' });
  $.check`should succeed with only required query param`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly.search, 'testing')
  );

  const missing = await schemaTest('query', QuerySchema, { page: '2' });
  $.check`should fail if required query param is missing`(
    $.isResponseWithStatus(missing, 422)
  );
});


/******************************************************************************/


aegis.test`ParamSchema`(async () => {
  const withOptional = await schemaTest('param', ParamSchema, { id: 'user-123', format: 'json' });
  $.check`should succeed with valid required and optional url params`(
    $.isObject(withOptional),
    $.eq(withOptional.id, 'user-123'),
    $.eq(withOptional.format, 'json')
  );

  const requiredOnly = await schemaTest('param', ParamSchema, { id: 'user-123' });
  $.check`should succeed with only required url param`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly.id, 'user-123')
  );

  const missing = await schemaTest('param', ParamSchema, { format: 'json' });
  $.check`should fail if required url param is missing`(
    $.isResponseWithStatus(missing, 422)
  );
});


/******************************************************************************/


aegis.test`HeaderSchema`(async () => {
  const withOptional = await schemaTest('header', HeaderSchema, {
    'x_request_id': 'xyz-123',
    'x_api_version': '2'
  });
  $.check`should succeed with valid required and optional headers`(
    $.isObject(withOptional),
    $.eq(withOptional['x_request_id'], 'xyz-123'),
    $.eq(withOptional['x_api_version'], '2')
  );

  const requiredOnly = await schemaTest('header', HeaderSchema, {
    'x_request_id': 'xyz-123'
  });
  $.check`should succeed with only required header`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly['x_request_id'], 'xyz-123')
  );

  const missing = await schemaTest('header', HeaderSchema, { 'x_api_version': '2' });
  $.check`should fail if required header is missing`(
    $.isResponseWithStatus(missing, 422)
  );
});


/******************************************************************************/


aegis.test`CookieSchema`(async () => {
  const withOptional = await schemaTest('cookie', CookieSchema, {
    'session_id': 'abc-456',
    'theme': 'dark'
  });
  $.check`should succeed with valid required and optional cookies`(
    $.isObject(withOptional),
    $.eq(withOptional['session_id'], 'abc-456'),
    $.eq(withOptional.theme, 'dark')
  );

  const requiredOnly = await schemaTest('cookie', CookieSchema, {
    'session_id': 'abc-456'
  });
  $.check`should succeed with only required cookie`(
    $.isObject(requiredOnly),
    $.eq(requiredOnly['session_id'], 'abc-456')
  );

  const missing = await schemaTest('cookie', CookieSchema, { 'theme': 'dark' });
  $.check`should fail if required cookie is missing`(
    $.isResponseWithStatus(missing, 422)
  );
});


/******************************************************************************/


aegis.test`ResultSchema`(async () => {
  const masked = await schemaTest('result', ResultSchema, {
    value1: 'hello',
    value2: 2,
    extra: 'drop'
  });
  $.check`should validate and mask result data`(
    $.isObject(masked),
    $.eq(masked.value1, 'hello'),
    $.eq(masked.extra, undefined)
  );

  const invalid = await schemaTest('result', ResultSchema, { value1: 42 });
  $.check`should fail result data that does not match the schema`(
    $.isResponseWithStatus(invalid, 500)
  );

  const selected = await schemaTest('result', {
    201: ResultSchema,
    default: wrapJoker({ root: { "created": "bool" } })
  }, { value1: 'hello' }, undefined, 201);
  $.check`should honor the requested status when selecting a result schema`(
    $.isObject(selected),
    $.eq(selected.value1, 'hello')
  );

  const bodyless = await schemaTest('result', ResultSchema, { value1: 'hello' }, undefined, 204);
  $.check`should return a null response for a bodyless result status`(
    $.isResponseWithStatus(bodyless, 204)
  );
});


/******************************************************************************/


aegis.test`Response Checks`(async () => {
  const responseLike = {
    status: 200,
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0)
  };

  $.check`should accept a response-like object from another realm`(
    $.isResponse(responseLike)
  );

  $.check`should not accept a plain object as a response`(
    $.isNotResponse({ status: 200 })
  );
});


/******************************************************************************/


aegis.test`Exception Stack Traces`(async () => {
  // A simple handler that always throws an error
  const faultyHandler = body(async (ctx) => {
    throw new Error("This is a test exception");
  });

  // A mock context for testing
  const mockCtx = (env = {}) => ({
    env,
    json: (payload) => payload,
    status: () => {}
  });

  const withStack = await faultyHandler(mockCtx({ CF_REQUESTS_STACKTRACE: 'true' }));
  $.check`should include a stack trace when env var is set`(
    $.isObject(withStack),
    $.isArray(withStack.data),
    $.gt(withStack.data.length, 0)
  );

  const withoutStack = await faultyHandler(mockCtx());
  $.check`should not include a stack trace when env var is not set`(
    $.isObject(withoutStack),
    $.eq(withoutStack.data, undefined)
  );

  // A context can legitimately have no env at all, such as when a handler is
  // exercised through Hono's app.request(); that must not turn a handled error
  // into an unhandled one.
  const bareCtx = () => ({
    json: (payload) => payload,
    status: () => {}
  });

  const bare = await faultyHandler(bareCtx());
  $.check`should not fail when the context has no env`(
    $.isObject(bare),
    $.eq(bare.success, false),
    $.eq(bare.status, 500)
  );
});


/******************************************************************************/
