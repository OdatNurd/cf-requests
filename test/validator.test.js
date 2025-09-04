import { Collection, $check, $ } from "@axel669/aegis";
import { schemaTest } from "../aegis/index.js";

import joker from "@axel669/joker";


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
function wrapJoker(schemaDef) {
  return {
    validate: joker.validator(schemaDef),
    mask: joker.mask(schemaDef),
  };
}


/******************************************************************************/


export const JsonSchema = wrapJoker({
  root: {
    userId: "number",
    "?isActive": "bool",
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


/******************************************************************************/


/* This overall collection exercises that our validation wrapper and the test
 * wrapper for it are both working correctly for all of the types of validation
 * that Hono is capable of doing, since it involvesus faking a Hono context. */
export default Collection`Schema Validation`({
  "JsonSchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional json data`
      .value(schemaTest('json', JsonSchema, { userId: 123, isActive: true }))
      .isObject()
      .eq($.userId, 123)
      .eq($.isActive, true);

    await $check`should succeed with only required json data`
      .value(schemaTest('json', JsonSchema, { userId: 456 }))
      .isObject()
      .eq($.userId, 456);

    await $check`should fail if required json data is missing`
      .value(schemaTest('json', JsonSchema, { isActive: false }))
      .isResponseWithStatus($, 422);
  },


  /****************************************************************************/


  "FormSchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional form data`
      .value(schemaTest('form', FormSchema, { username: 'testuser', avatar: new File([], 'avatar.png') }))
      .isObject()
      .eq($.username, 'testuser');

    await $check`should succeed with only required form data`
      .value(schemaTest('form', FormSchema, { username: 'testuser' }))
      .isObject()
      .eq($.username, 'testuser');

    await $check`should fail if required form data is missing`
      .value(schemaTest('form', FormSchema, { avatar: new File([], 'avatar.png') }))
      .isResponseWithStatus($, 422);
  },


  /****************************************************************************/


  "QuerySchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional query params`
      .value(schemaTest('query', QuerySchema, { search: 'testing', page: '2' }))
      .isObject()
      .eq($.search, 'testing')
      .eq($.page, '2');

    await $check`should succeed with only required query param`
      .value(schemaTest('query', QuerySchema, { search: 'testing' }))
      .isObject()
      .eq($.search, 'testing');

    await $check`should fail if required query param is missing`
      .value(schemaTest('query', QuerySchema, { page: '2' }))
      .isResponseWithStatus($, 422);
  },


  /****************************************************************************/


  "ParamSchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional url params`
      .value(schemaTest('param', ParamSchema, { id: 'user-123', format: 'json' }))
      .isObject()
      .eq($.id, 'user-123')
      .eq($.format, 'json');

    await $check`should succeed with only required url param`
      .value(schemaTest('param', ParamSchema, { id: 'user-123' }))
      .isObject()
      .eq($.id, 'user-123');

    await $check`should fail if required url param is missing`
      .value(schemaTest('param', ParamSchema, { format: 'json' }))
      .isResponseWithStatus($, 422);
  },


  /****************************************************************************/


  "HeaderSchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional headers`
      .value(schemaTest('header', HeaderSchema, { 'x_request_id': 'xyz-123', 'x_api_version': '2' }))
      .isObject()
      .eq($['x_request_id'], 'xyz-123')
      .eq($['x_api_version'], '2');

    await $check`should succeed with only required header`
      .value(schemaTest('header', HeaderSchema, { 'x_request_id': 'xyz-123' }))
      .isObject()
      .eq($['x_request_id'], 'xyz-123');

    await $check`should fail if required header is missing`
      .value(schemaTest('header', HeaderSchema, { 'x_api_version': '2' }))
      .isResponseWithStatus($, 422);
  },


  /****************************************************************************/


  "CookieSchema": async ({ runScope: ctx }) => {
    await $check`should succeed with valid required and optional cookies`
      .value(schemaTest('cookie', CookieSchema, { 'session_id': 'abc-456', 'theme': 'dark' }))
      .isObject()
      .eq($['session_id'], 'abc-456')
      .eq($.theme, 'dark');

    await $check`should succeed with only required cookie`
      .value(schemaTest('cookie', CookieSchema, { 'session_id': 'abc-456' }))
      .isObject()
      .eq($['session_id'], 'abc-456');

    await $check`should fail if required cookie is missing`
      .value(schemaTest('cookie', CookieSchema, { 'theme': 'dark' }))
      .isResponseWithStatus($, 422);
  },
});


/******************************************************************************/
