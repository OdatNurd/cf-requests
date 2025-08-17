# Simple CloudFlare Request Handlers

`cf-requests` is a very simple set of wrapper functions that allow for working
with requests in a
[Cloudflare Worker](https://developers.cloudflare.com/workers/) or in
[Cloudflare Pages](https://developers.cloudflare.com/pages/) using
[Hono](https://hono.dev/) as a route handler, with a focus on API routes,
though this is not strictly required.

This is also intended to be used with
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker) as a schema
validation library and
[@axel669/hono-file-routes](https://www.npmjs.com/package/@axel669/hono-file-routes),
which collectively allow for fast and easy schema validation and data masking
and allowing file based in Cloudflare Workers, where that is not directly
possible. This again is not strictly required, but examples below assume that
this is the case.


## Installation

Install `cf-requests` via `npm`, `pnpm`, and so on, in the usual way.

```sh
npm install @odatnurd/cf-requests
```

## Usage

The library provides all of the pieces needed to validate incoming requests
based on an appropriate schema and return a JSON result that has a consistent
field layout. In addition, request handlers are wrapped such that any
exceptions that propagate out of the handler function are handled as errors
with an appropriate return, making the actual handler code more straight
forward.

### Example

Assuming a file named `test.joker.json` that contains the following Joker
schema:

```json
{
  "itemName": "body",
  "root": {
    "key1": "number",
    "key2": "string",
  }
}
```

The following is a minimal route handler that validates the JSON body against
the schema and returning it back. The request will result in a `422` error if
the data is not valid, and the JSON body is masked to ensure that only the
fields declared by the schema are present.


```js
import { validate, success, routeHandler } from '#lib/common';

import * as testSchema from '#schemas/test';


export const $post = routeHandler(
  validate('json', testSchema),

  async (ctx) => {
    const body = ctx.req.valid('json');

    // Generic errors show up as a 500 server error; throwing HTTPError allows
    // for a specific error code to be returned instead
    if (body.key1 != 69) {
      throw new Error('key is not nice');
    }

    return success(ctx, 'request body validated', body);
  },
);
```

## Methods

```js
export function success(ctx, message, result, status) {}
```

Indicate a successful return in JSON with the given `HTTP` status code; the
status code is used to construct the JSON as well as the response:

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

---

```js
export function fail(ctx, message, status, result) {}
```

Indicates a failure return in JSON with the given `HTTP` status code.

This follows a similar form to `success`, though the `success` field is `false`
instead of `true`.

Note that the order of the last two arguments is different because generally
one wants to specify the status of an error but it usually does not return any
other meaningful result (which is the opposite of the `success` case).

If `status` is not provided, it defaults to `400`, while if `result` is not
provided, the `data` field will not be present in the result.

---

```js
export function validate(dataType, schemaObj) {}
```

This function uses the [Hono validator()](https://hono.dev/docs/guides/validation)
function to create a validator that will validate the data of the provided type
using the provided `Joker` schema.

`schemaObj` is an object that contains a `validate` and `mask` member that can
validate data and store it into the `Hono` context, masking away all fields that
are not present in the schema; this is intended to be used with
[@axel669/joker](https://www.npmjs.com/package/@axel669/joker), though you are
free to use any other validation schema so long as the call signatures match
that of `joker`.

On success, the data is placed in the context. If the data does not pass the
validation of the schema, the `fail()` method is invoked on it with a status of
`422` to signify the issue directly.

---

```js
export function body(handler) {}
```

This is a simple wrapper which returns a function that wraps the provided
handler function in a `try-catch` block, so that any uncaught exceptions can
gracefully return a `fail()` result.

The wrapper returned by this function will itself return either the result of
the provided handler, so long as no exceptions are raised.

Exceptions of type `HttpError` carry a specific `HTTP` status code, which will
be used in the call to `fail()`; all other exceptions use a status of `500`.

```js
export const $post = [
  validate('json', testSchema),

  body(async (ctx) => {
    const body = ctx.req.valid('json');

    if (body.key1 != 69) {
      throw new Error('key is not nice');
    }

    return success(ctx, 'code test worked', body);
  }),
];
```

---

```js
export class HttpError extends Error(message: string, status) {}
```

This is a simple exception class that wraps a textual message and a status code.

When `body()` catches an exception of this type, it directly returns an error
JSON containing the provided message and uses the status code as the `HTTP`
status of the return.

If `status` is not provided, it defaults to `500`.

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

  // More than one argument, so function is directly returned; no body() call.
  async (ctx, next) => {
    console.log('Async middleware is running!');
    await next();
  },

  // Single argument async functions are wrapped in body(), so exceptions raised
  // are handled appropriately.
  async (ctx) => {
    const body = ctx.req.valid('json');

    if (body.key1 != 69) {
      throw new Error('key is not nice');
    }

    return success(ctx, 'code test worked', body);
  },
);
```
