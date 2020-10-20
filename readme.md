# ☁️ Ersa - The quickest way to run GraphQL on Cloudflare Workers

In greek mythology, Ersa is the godess of dew, a lesser known half sister of Apollo. Ersa is also a GraphQL server that is purpose built for Cloudflare Workers. It has none of the cruft of solutions that weren't built for serverless and handles all cases described in the [Serving over HTTP](https://graphql.org/learn/serving-over-http/) part of the GraphQL documentation. It is comparable to and heavily inspired by [express-graphql](https://github.com/graphql/express-graphql).

- **Tiny**: Because your app should get as much of the 1MB worker limit as possible. It only adds 34 KB.
- **Tested**: Using a ported version of the express-graphql test suite as well as additional tests for added features.
- **Familiar**: Ersa works with any executable graphql schema and supports all applicable configuration options offered by `express-graphql`.
- **Ready to go**: It works in `wrangler` webpack projects out of the box. No dummy modules, no adapters, no `webpack.config.js`.

```js
import { createRequestHandler } from "ersa";
import executableSchema from "./schema";

const gqlHandler = createRequestHandler(executableSchema);

addEventListener("fetch", (event) => {
  event.respondWith(gqlHandler(event.request));
});
```

## Bring Your Own Schema

The only thing you need to provide to get started with Ersa is an executable GraphQL schema. The heavy lifting of executing queries is done by the widely used [graphql.js](https://github.com/graphql/graphql-js) library. This means it is compatible with the same type of schema used by other servers. There are a number of great tools to create a compatible schema. Here are a few example options:

### Minimalist: graphql.js

The reference GraphQL implementation includes a solid way to create a schema. If you import the required tools directly from the `ersa` package, it ads no additional bundle size.

```js
import { createRequestHandler } from "ersa";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "ersa/graphql";

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      hi: {
        type: GraphQLString,
        args: { name: { type: GraphQLString } },
        resolve: (_root, args) => "Hello " + (args.name ? args.name : "World"),
      },
    },
  }),
});

const gqlHandler = createRequestHandler(schema);

addEventListener("fetch", (event) => {
  event.respondWith(gqlHandler(event.request));
});
```

### Familiar: graphql-tools

[`graphql-tools`](https://www.graphql-tools.com) allows you to create a schema from a string in the GraphQL Schema Defintion language and an object containing the required resolvers. This is also the way `apollo-server` defines a schema, so you should be able to bring your schema right over.

```js
import { createRequestHandler } from "ersa";
import { makeExecutableSchema } from "@graphql-tools/schema";

// a trick to let your editor provide language support
const gql = (strings) => string[0];

const typeDefs = gql`
  type Query {
    hi(name: String): String
  }
`;

const resolvers = {
  Query: { hi: (name) => `Hello ${name ? name : "World"}` },
};

const gqlHandler = createRequestHandler(
  makeExecutableSchema({ typeDefs, resolvers })
);

addEventListener("fetch", (event) => {
  event.respondWith(gqlHandler(event.request));
});
```

### Fancy: Nexus with TypeScript

[Nexus](https://nexusjs.org) is a TypeScript powered schema builder from the prisma team. Like the first example with `grapqhl.js`, it is code-first (and only). It is more convenient and fully featured and especially powerful when using TypeScript.

```js
import { createRequestHandler } from "ersa";
import { queryType, makeSchema } from "@nexus/schema";

const Query = queryType({
  definition(t) {
    t.string("hi", {
      args: { name: "String" },
      resolve: (_root, args) => `Hello ${args.message ?? "World"}`,
    });
  },
});

const gqlHandler = createRequestHandler(makeSchema({ types: [Query] }));

addEventListener("fetch", (event) => {
  event.respondWith(gqlHandler(event.request));
});
```

# API

## Setup

You can import `createRequestHandler` from `ersa` or `ersa/lean`. The function requires a schema as the first argument and takes optional config object as the second.
It returns a handler that takes a `Request` object as the first argument, and an optional object that will be provided as `context` in resolvers as the second.

If no context is provided, the request is used as context. The choice goes:

**context passed to handler** > **context provided in config** > **request passed to handler**

```js
import { createRequestHandler } from `ersa`
import { createRequestHandler } from `ersa/lean`

// ExecutableSchema is an executable graphql schema
// ConfigObject is documented in the next section
// Request and Response are the native fetch types used by Workers and the browser
const handler = createRequestHandler(schema: ExecutableSchema, config: ConfigObject)

const response: Response = handler(request: Request, context: object)
```

## Options

Ersa supports the same options as [express-graphql](https://github.com/graphql/express-graphql#options). Currently the only additional option is `allowOrigins`. `graphiql` (+ related) and `formatErrors` are not supported. `schema` is pulled out as it's own argument.

- **`allowOrigins`**: Because clouflare workers has not yet established a common middleware pattern, CORS handling is included in Ersa. If you provide a string here, CORS requests will be allowed and the string will be the `Access-Control-Allow-Origin` header. Pass `"*"` to allow all, don't include in config to disable.

- **`rootValue`**: A value to pass as the `rootValue` to the `graphql()`
  function from [`GraphQL.js/src/execute.js`](https://github.com/graphql/graphql-js/blob/master/src/execution/execute.js#L119).

- **`context`**: A value to pass as the `context` to the `graphql()`
  function from [`GraphQL.js/src/execute.js`](https://github.com/graphql/graphql-js/blob/master/src/execution/execute.js#L120). If `context` is not provided, the
  `request` object is passed as the context.

- **`pretty`**: If `true`, any JSON response will be pretty-printed.

- **`extensions`**: An optional function for adding additional metadata to the
  GraphQL response as a key-value object. The result will be added to the
  `"extensions"` field in the resulting JSON. This is often a useful place to
  add development time metadata such as the runtime of a query or the amount
  of resources consumed. This may be an async function. The function is
  given one object as an argument: `{ document, variables, operationName, result, context }`.

- **`validationRules`**: Optional additional validation rules queries must
  satisfy in addition to those defined by the GraphQL spec.

- **`customValidateFn`**: An optional function which will be used to validate
  instead of default `validate` from `graphql-js`.

- **`customExecuteFn`**: An optional function which will be used to execute
  instead of default `execute` from `graphql-js`.

- **`customFormatErrorFn`**: An optional function which will be used to format any
  errors produced by fulfilling a GraphQL operation. If no function is
  provided, GraphQL's default spec-compliant [`formatError`][] function will be used.

- **`customParseFn`**: An optional function which will be used to create a document
  instead of the default `parse` from `graphql-js`.

Note: Some option descriptions where copied from `express-graphql`

# Notes

## Stay Lean

As an exercise in extreme efficiency, Ersa provides a lean version that is only 26 KB in size.
This version skips on validating incoming queries, which is likely a bad choice, but with allow-listing on the roadmap, it may be worth it?

I would like to experiment more with timing parts of the request pipeline and may remove this version if it turns out to be a bad idea. With the low latency and distributed data sources offered by Workers, you can reach latency so low that every millisecond counts. If other features are introduced that increase the size significantly, the lean version will also stay around.

As a bonus, if you use `graphql.js` to construct your schema and read data from Worker-native sources, you can ship an entire GraphQL microservice in ~30KB.

```js
import { createRequestHandler } from "ersa/lean";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "ersa/graphql";

// ... continue like examples above
```

## ❤️ express-graphql

It did not start out as one, but currently this project can almost be considered a fork of [`express-graphql`](https://github.com/graphql/express-graphql). In particular, the settings API is the same and I have copied their `http-tests` test suite and adapted it to work against Ersa. In the process of working through the tests, the source code came ever closer to that of `express-graphql`. If you want to know in which ways Ersa is not yet as correct or fully featured as `express-graphql` you can check out which tests are currently skipped. The following features are not supported:

- Solid handling of encoding and compression: will add
- Configuration as function or promise: may add
- Pretty printing config with request: eh
- GraphiQL: will not add (except as extra module)

## On Bundling

This library is not bundled in any way and uses the bundler-only flavor of es module imports. This means it will only work with a bundler that will also bundle it. The best way to build a Cloudflare Worker is with the official `wrangler` CLI and it's automatic webpack setup. This is currently the only tested configuration for Ersa.

## Roadmap

The following features are planned or on the wishlist for Ersa

- TypeScript Declarations
- Automatic Persisted Queries with Workers KV
- Naive full GET query caching with the Cache API
- Allow-listing queries, possibly in combination with persisted queries
- Batched queries

I would quite like Apollo Tracing, but it seems impossible with the spectre mitigating frozen clocks in Workers.
