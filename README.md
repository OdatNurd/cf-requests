# Simple CloudFlare Request Handlers

`cf-requests` is a simple set of wrapper functions that allow for working with
requests in a
[Cloudflare Worker](https://developers.cloudflare.com/workers/) or in
[Cloudflare Pages](https://developers.cloudflare.com/pages/) using
[Hono](https://hono.dev/) as a route handler.

The focus is to allow for more easy creation of robust `API` routes, providing
a standard `JSON` response format on both success and failure.

The request validation functionality is intended to be used alongside the
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker) schema
validation library. However this is not strictly required, and the validation
wrapper can be used with any validator with some simple wrapper code; see below
for more details.

The examples seen here utilize
[@axel669/hono-file-routes](https://www.npmjs.com/package/@axel669/hono-file-routes),
which allows for file based routing in a Cloudflare worker. This is also not
strictly required.

Finally, there are some routines here that can be used with the
[@axel669/aegis](https://www.npmjs.com/package/@axel669/aegis) test runner
library, which is also documented below.


## Installation

Install `cf-requests` via `npm`, `pnpm`, and so on, in the usual way.

```sh
npm install @odatnurd/cf-requests
```

## Usage

The library provides all of the pieces needed to:

- validate incoming requests based on a schema (applied to the `json` body, path
  parameters, query parameters, etc).
- return a consistently structured `json` result in both `success` and `failure`
  conditions
- wrap a request handler with exception handling to remove boilerplate and help
  enforce consistency in results.
- compose all of the above into a single, cohesive handler for a route.


### Example

This example presumes that the
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker) library is being
used to implement schema validation, and that routes are defined via the
[@axel669/hono-file-routes](https://www.npmjs.com/package/@axel669/hono-file-routes)
package.

The contents of the `test.joker.json` file looks like the following, defining
that the body of the request contain `key1` and `key2`, each of specific types:

```json
{
  "itemName": "body",
  "root": {
    "key1": "number",
    "key2": "string",
  }
}
```

Given this, the following is a minimal route handler that validates the JSON
body against the schema.

The request will result in a `422 Unprocessible Entity` error if the data is
not valid, and the JSON body is masked to ensure that only the fields declared
by the schema are present.


```js
// Bring in the validation generator, the success response generator, and the
// route handler generator.
import { validate, verify, success, routeHandler } from '@odatnurd/cf-requests';

// Using the Joker rollup plugin, this will result in a testSchema object with a
// `validate()` and `mask()` function within it, which verify that the result is
// correct and mask away any fields not defined by the schema, respectively.
import * as inputSchema from '#schemas/test_input';
import * as outputSchema from '#schemas/test_output';

// The hono-file-routes package defines routes in a file by exporting `$verb`
// as routes. Here we are using the routeHandler() generator, which constructs
// an appropriate route array based on its arguments.
//
// This value could also be used in a standard Hono app.
export const $post = routeHandler(
  // Generate a validator using the standard Hono mechanism; this will ensure
  // that the JSON in the body fits the schema, and will mask extraneous fields.
  validate('json', inputSchema),

  // Verify that the resulting object, on success, follows the provided schema,
  verify(outputSchema),

  // Async functions that take a single argument are route handlers; they will
  // be automatically guarded with a try/catch block
  async (ctx) => {
    // PUll out the validated JSON body.
    const body = ctx.req.valid('json');

    // Thrown exceptions inside the handler cause a fail() call to occur; the
    // status is 500 for generic errors, but you can throw HTTPError instances
    // to get a specific result as desired.
    if (body.key1 != 69) {
      throw new Error('key is not nice');
    }

    return success(ctx, 'request body validated', body);
  },
);
```


## Testing Utilities (Optional)

This package includes an optional set of helpers to facilitate testing your own
projects with the [@axel669/aegis](https://www.npmjs.com/package/@axel669/aegis)
test runner and the
[@odatnurd/cf-aegis](https://www.npmjs.com/package/@odatnurd/cf-aegis) helper
libraries.

To use these utilities, you must install the required peer dependencies into
your own project's `devDependencies` if you have not already done so.

```sh
pnpm add -D @axel669/aegis @axel669/joker @odatnurd/cf-aegis miniflare
```

The `@odatnurd/cf-requests/aegis` module exports the following functions to
aid in setting up tests:


### Aegis Helper Functions

```javascript
export function initializeRequestChecks() {}
```
Registers all [custom checks](#custom-checks) with `Aegis`. This should be
called once at the top of your `aegis.config.js` file.

---

```javascript
export async function schemaTest(dataType, schema, data, validator = undefined) {}
```
Takes a `dataType` and `schema` as would be provided to the `validate` function
and runs the validation against `data` to see what the result is. The function
will return either:

 * `Valid Data`: An Object that represents the validated and masked data
 * `Invalid Data`: A `Response` object that carries the error payload

Using this, it is possible to validate that a schema works as expected without
having to use it in the actual request first.

> ℹ️ By default, the test will use the `validate` function to perform the data
> validation. If desired, you can pass an optional `validator` function as the
> final argument. This must take the same arguments as `validate` does, and
> follow the same contract. This allows for testing of other schema libraries,
> such as during migrations to this library.


### Aegis Test Configuration

You can import the helper functions into your `aegis.config.js` file to easily
set up a test environment, optionally also populating one or more SQL files into
the database first in order to set up testing.

**Example `aegis.config.js`:**

```js
import { initializeCustomChecks, aegisSetup, aegisTeardown } from '@odatnurd/cf-aegis';
import { initializeRequestChecks } from '@odatnurd/cf-requests/aegis';

initializeCustomChecks();
initializeRequestChecks()

export const config = {
    files: [
        "test/**/*.test.js",
    ],
    hooks: {
        async setup(ctx) {
            await aegisSetup(ctx, 'test/setup.sql', 'DB');
        },

        async teardown(ctx) {
            await aegisTeardown(ctx);
        },
    },
    failAction: "afterSection",
}
```


### Custom Checks

The `initializeRequestChecks()` function registers several custom checks with
Aegis to simplify testing database-related logic.

* `.isResponse($)`: Checks if a value is a `Response` object.
* `.isNotResponse($)`: Checks if a value is not a `Response` object.
* `.isResponseWithStatus($, count)`: Checks if an object is a `Response` with a
  specific `status` code.


## Library Methods

```js
export async function success(ctx, message, result=[], status=200) {}
```

Generate a successful return in JSON with the given `HTTP` status code; the
status code is used to construct the JSON as well as the response object:

```js
{
    "success": true,
    status,
    message,
    data: result
}
```

`result` is optional and defaults to an empty array if not provided. Similarly
`status` is option and defaults to `200` if not provided.

If the `verify()` function was used to set a schema, then this function will
validate that the `result` you provide matches the schema, and will also
optionally mask it, if `verify()` was given a mask function.

When using `verify()`, if the data in `result` does not conform to the schema,
a `SchemaError` exception will be thrown. This is automatically handled by
`body()`, and will result in a `fail()` response instead of a `success()`.

---

```js
export function fail(ctx, message, status=400, result=undefined) {}
```

Generate a failure return in JSON with the given `HTTP` status code; the status
code is used to construct the JSON as well as the response object:

This results in JSON in a similar form to `success`, though the `success` field
is `false` instead of `true`.

Note that the order of the last two arguments is different because generally
one wants to specify the status of an error but it usually does not return any
other meaningful result (which is the opposite of the `success` case).

If `status` is not provided, it defaults to `400`, while if `result` is not
provided, the `data` field will not be present in the result.

Note that unlike `success()`, `fail()` will not honor the addition of an output
validator via `verify()`, since it is usually expected that it will not provide
a meaningful data result.

---

```js
export function validate(dataType, { validate, mask? }) {}
```

This function uses the [Hono validator()](https://hono.dev/docs/guides/validation)
function to create a validator that will validate the data of the provided type
using the provided validation object.

The second parameter should be an object that contains a `validate` and an
(optional) `mask` member:

- `validate` takes the item to validate, and returns `true` when the data given
  is valid. Any other return value is considered to be an error.
- `mask` takes as an input the same item passed to `validate`, and returns a
  masked version of the data that strips fields from the object that do not
  appear in the schema.

If `mask` is not provided, then the data will be validated but not masked.

This method is intended to be used with the
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker) library (and
in particular it's rollup plugin), though you are free to use any other
validation schema so long as the call signatures are as defined above.

On success, the data is placed in the context. If the data does not pass the
validation of the schema, the `fail()` method is invoked on it with a status of
`422` to signify the issue directly.

---

```js
export function verify({ validate, mask? }) {}
```

This function registers the provided validation/masking pair for the current
route. This causes `success` to validate (and optionally mask) the data payload
that you give it before finalizing the request and sending the data out.

The parameter should be an object that contains a `validate` and an (optional)
`mask` member:

- `validate` takes the item to validate, and returns `true` when the data given
  is valid. Any other return value is considered to be an error.
- `mask` takes as an input the same item passed to `validate`, and returns a
  masked version of the data that strips fields from the object that do not
  appear in the schema.

If `mask` is not provided, then the data will be validated but not masked.

This method is intended to be used with the
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker) library (and
in particular it's rollup plugin), though you are free to use any other
validation schema so long as the call signatures are as defined above.

---

```js
export function body(handler) {}
```

This is a simple wrapper which returns a function that wraps the provided
handler function in a `try-catch` block, so that any uncaught exceptions can
gracefully return a `fail()` result.

The wrapper returned by this function will itself return the result of the
provided handler, so long as no exceptions are raised.

When an exception is caught, the `fail()` function is used to generate and
return a response; this will contain as a message the text of the exception
that was caught.

Exceptions of type `HttpError` carry a specific `HTTP` status code, which will
be used in the call to `fail()`; all other exceptions use a status of `500`.

For debugging, if your worker has the  `CF_REQUESTS_STACKTRACE` environment
variable set to either `true` or `yes`, the `fail()` response will include in
its data field the stack trace as an array of strings that represent the trace.

> ℹ️ If the body catches a `SchemaError`, the `CF_REQUESTS_STACKTRACE` variable
> will be ignored since in this case it is the data and not the code that was at
> fail. In these cases, the result inside of the returned body will be the
> validation error object instead.


```js
export const $post = [
  validate('json', testSchema),

  body(async (ctx) => {
    const body = ctx.req.valid('json');

    if (body.key1 != 69) {
      throw new Error('key is not nice');

      // The above throw is the same as:
      // return fail(ctx, 'key is not nice', 500)
    }

    return success(ctx, 'code test worked', body);
  }),
];
```

---

```js
export class HttpError extends Error { constructor(message, status=500) {} }
```

This is a simple exception class that wraps a textual message and a status code.

When `body()` catches an exception of this type, the `fail()` call it makes
will use the status provided here as the `HTTP` status of the return.

If `status` is not provided, it defaults to `500`, making this class generate an
error with the same layout as any other exception class.

---

```js
export class SchemaError extends HttpError { constructor(message, status=500, result=undefined) {} }
```

This is a simple extension to HttpError and is thrown in cases where a schema
validation error has occurred; it is handled by `body()` the same as `HttpError`
is. If the exception has a `result`, it will be used in the call to `fail()` in
this case, so that the result of the validation will be returned.

---

```js
export function routeHandler(...args) {}
```

This small helper makes it slightly cleaner to set up a route handler by taking
any number of arguments and returning them back as an array.

As a part of this operation, any `async` function that takes exactly one argument
is implicitly wrapped in `body()`. This makes the resulting handler somewhat
cleaner looking, while still allowing for arbitrary middleware

```js
export const $post = routeHandler(
  validate('json', testSchema),

  // More than one argument, so function is directly returned; no body() call
  // wrapper here.
  async (ctx, next) => {
    console.log('Async middleware is running!');
    await next();
  },

  // Single argument async functions are wrapped in body(), so exceptions raised
  // are handled consistently.
  async (ctx) => {
    const body = ctx.req.valid('json');

    if (body.key1 != 69) {
      throw new Error('key is not nice');
    }

    return success(ctx, 'code test worked', body);
  },
);
```
