import { createRequestHandler } from "./createHandler";
import { Request, Response } from "node-fetch";
import {
  Source,
  GraphQLError,
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  parse,
  execute,
  validate,
  buildSchema,
} from "graphql";
import { specifiedRules } from "graphql/validation/specifiedRules";
import { TestSchema, stringifyURLParams, urlString } from "./testUtils";

global.Request = Request;
global.Response = Response;

const headers = {
  "Content-Type": "application/json",
};

/** @type {(request: Request) => Promise<Response>} */
const handler = createRequestHandler(TestSchema);

describe("GET functionality", () => {
  it("allows GET with query param", async () => {
    const response = await handler(new Request(urlString({ query: "{test}" })));
    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });

  it("allows GET with variable values", async () => {
    const response = await handler(
      new Request(
        urlString({
          query: "query helloWho($who: String){ test(who: $who) }",
          variables: JSON.stringify({ who: "Dolly" }),
        })
      )
    );
    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("allows GET with operation name", async () => {
    const response = await handler(
      new Request(
        urlString({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: "helloWorld",
        })
      )
    );
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
        shared: "Hello Everyone",
      },
    });
  });

  it("Reports validation errors", async () => {
    const validatingHandler = createRequestHandler(TestSchema, {
      validationRules: specifiedRules,
      customValidateFn: validate,
    });
    const response = await validatingHandler(
      new Request(
        urlString({
          query: "{ test, unknownOne, unknownTwo }",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: 'Cannot query field "unknownOne" on type "QueryRoot".',
          locations: [{ line: 1, column: 9 }],
        },
        {
          message: 'Cannot query field "unknownTwo" on type "QueryRoot".',
          locations: [{ line: 1, column: 21 }],
        },
      ],
    });
  });

  it("Errors when missing operation name", async () => {
    const response = await handler(
      new Request(
        urlString({
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        })
      )
    );

    expect(response.status).toEqual(500);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message:
            "Must provide operation name if query contains multiple operations.",
        },
      ],
    });
  });

  it("Errors when sending a mutation via GET", async () => {
    const response = await handler(
      new Request(
        urlString({
          query: "mutation TestMutation { writeTest { test } }",
        })
      )
    );
    expect(response.status).toEqual(405);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: "Can only perform a mutation operation from a POST request.",
        },
      ],
    });
  });

  it("Errors when selecting a mutation within a GET", async () => {
    const response = await handler(
      new Request(
        urlString({
          operationName: "TestMutation",
          query: `
            query TestQuery { test }
            mutation TestMutation { writeTest { test } }
          `,
        })
      )
    );

    expect(response.status).toEqual(405);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: "Can only perform a mutation operation from a POST request.",
        },
      ],
    });
  });

  it("Allows a mutation to exist within a GET", async () => {
    const response = await handler(
      new Request(
        urlString({
          operationName: "TestQuery",
          query: `
            mutation TestMutation { writeTest { test } }
            query TestQuery { test }
          `,
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
      },
    });
  });

  it("Allows async resolvers", async () => {
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          foo: {
            type: GraphQLString,
            resolve: () => Promise.resolve("bar"),
          },
        },
      }),
    });
    const localHandler = createRequestHandler(schema);
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ foo }",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: { foo: "bar" },
    });
  });

  it("Allows passing in a context", async () => {
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          test: {
            type: GraphQLString,
            resolve: (_obj, _args, context) => context,
          },
        },
      }),
    });

    const localHandler = createRequestHandler(schema, { context: "testValue" });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ test }",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "testValue",
      },
    });
  });

  it("Allows passing in a fieldResolver", async () => {
    const schema = buildSchema(`
        type Query {
          test: String
        }
      `);

    const localHandler = createRequestHandler(schema, {
      fieldResolver: () => "fieldResolver data",
    });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ test }",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "fieldResolver data",
      },
    });
  });

  it("Allows passing in a typeResolver", async () => {
    const schema = buildSchema(`
        type Foo {
          foo: String
        }
        type Bar {
          bar: String
        }
        union UnionType = Foo | Bar
        type Query {
          test: UnionType
        }
      `);

    const localHandler = createRequestHandler(schema, {
      rootValue: { test: {} },
      typeResolver: () => "Bar",
    });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ test { __typename } }",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: { __typename: "Bar" },
      },
    });
  });

  it("Uses request as context by default", async () => {
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          test: {
            type: GraphQLString,
            resolve: (_obj, _args, context) => context.headers.get("foo"),
          },
        },
      }),
    });

    const localHandler = createRequestHandler(schema);
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ test }",
        }),
        { headers: { foo: "bar" } }
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "bar",
      },
    });
  });

  xit("Allows returning an options Promise", async () => {
    const localHandler = createRequestHandler(() =>
      Promise.resolve({
        schema: TestSchema,
      })
    );
    const response = await localHandler(
      new Request(
        urlString({
          query: "{test}",
        })
      )
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });

  xit("Provides an options function with arguments", async () => {
    const app = server();

    let seenRequest;
    let seenResponse;
    let seenParams;

    app.get(
      urlString(),
      graphqlHTTP((req, res, params) => {
        seenRequest = req;
        seenResponse = res;
        seenParams = params;
        return { schema: TestSchema };
      })
    );

    const response = await app.request().get(
      urlString({
        query: "{test}",
      })
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');

    expect(seenRequest).not.toEqual(null);
    expect(seenResponse).not.toEqual(null);
    expect(seenParams).toEqual({
      query: "{test}",
      operationName: null,
      variables: null,
      raw: false,
    });
  });

  xit("Catches errors thrown from options function", async () => {
    const app = server();

    app.get(
      urlString(),
      graphqlHTTP(() => {
        throw new Error("I did something wrong");
      })
    );

    const response = await app.request().get(
      urlString({
        query: "{test}",
      })
    );

    expect(response.status).toEqual(500);
    expect(await response.text()).toEqual(
      '{"errors":[{"message":"I did something wrong"}]}'
    );
  });
});

describe("POST functionality", () => {
  it("allows POST with JSON encoding", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({ query: "{test}" }),
        headers,
      })
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });

  it("Allows sending a mutation via POST", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({
          query: "mutation TestMutation { writeTest { test } }",
        }),
        headers,
      })
    );

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual(
      '{"data":{"writeTest":{"test":"Hello World"}}}'
    );
  });

  it("allows POST with url encoding", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: stringifyURLParams({ query: "{test}" }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });

  it("supports POST JSON query with string variables", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({
          query: "query helloWho($who: String){ test(who: $who) }",
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        headers,
      })
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("supports POST JSON query with JSON variables", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({
          query: "query helloWho($who: String){ test(who: $who) }",
          variables: { who: "Dolly" },
        }),
        headers,
      })
    );
    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("supports POST url encoded query with string variables", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: stringifyURLParams({
          query: "query helloWho($who: String){ test(who: $who) }",
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })
    );

    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("supports POST JSON query with GET variable values", async () => {
    const response = await handler(
      new Request(
        urlString({
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        {
          method: "POST",
          body: JSON.stringify({
            query: "query helloWho($who: String){ test(who: $who) }",
          }),
          headers,
        }
      )
    );
    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("supports POST url encoded query with GET variable values", async () => {
    const response = await handler(
      new Request(
        urlString({
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        {
          method: "POST",
          body: stringifyURLParams({
            query: "query helloWho($who: String){ test(who: $who) }",
          }),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
    );
    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("supports POST raw text query with GET variable values", async () => {
    const response = await handler(
      new Request(
        urlString({
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        {
          method: "POST",
          headers: { "Content-Type": "application/graphql" },
          body: "query helloWho($who: String){ test(who: $who) }",
        }
      )
    );
    expect(await response.text()).toEqual('{"data":{"test":"Hello Dolly"}}');
  });

  it("allows POST with operation name", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({
          query: `
            query helloYou { test(who: "You"), ...shared }
            query helloWorld { test(who: "World"), ...shared }
            query helloDolly { test(who: "Dolly"), ...shared }
            fragment shared on QueryRoot {
              shared: test(who: "Everyone")
            }
          `,
          operationName: "helloWorld",
        }),
        headers,
      })
    );

    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
        shared: "Hello Everyone",
      },
    });
  });

  it("allows POST with GET operation name", async () => {
    const response = await handler(
      new Request(
        urlString({
          operationName: "helloWorld",
        }),
        {
          method: "POST",
          headers: { "Content-Type": "application/graphql" },
          body: `
          query helloYou { test(who: "You"), ...shared }
          query helloWorld { test(who: "World"), ...shared }
          query helloDolly { test(who: "Dolly"), ...shared }
          fragment shared on QueryRoot {
            shared: test(who: "Everyone")
          }
        `,
        }
      )
    );

    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
        shared: "Hello Everyone",
      },
    });
  });

  xit("allows other UTF charsets", async () => {
    const app = server();

    app.post(
      urlString(),
      graphqlHTTP(() => ({
        schema: TestSchema,
      }))
    );

    const req = app
      .request()
      .post(urlString())
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip");

    req.write(zlib.gzipSync('{ "query": "{ test }" }'));

    const response = await req;
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
      },
    });
  });

  xit("allows deflated POST bodies", async () => {
    const app = server();

    app.post(
      urlString(),
      graphqlHTTP(() => ({
        schema: TestSchema,
      }))
    );

    const req = app
      .request()
      .post(urlString())
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "deflate");

    req.write(zlib.deflateSync('{ "query": "{ test }" }'));

    const response = await req;
    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
      },
    });
  });

  xit("allows for pre-parsed POST bodies", async () => {
    // Note: this is not the only way to handle file uploads with GraphQL,
    // but it is terse and illustrative of using express-graphql and multer
    // together.

    // A simple schema which includes a mutation.
    const UploadedFileType = new GraphQLObjectType({
      name: "UploadedFile",
      fields: {
        originalname: { type: GraphQLString },
        mimetype: { type: GraphQLString },
      },
    });

    const TestMutationSchema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "QueryRoot",
        fields: {
          test: { type: GraphQLString },
        },
      }),
      mutation: new GraphQLObjectType({
        name: "MutationRoot",
        fields: {
          uploadFile: {
            type: UploadedFileType,
            resolve(rootValue) {
              // For this test demo, we're just returning the uploaded
              // file directly, but presumably you might return a Promise
              // to go store the file somewhere first.
              return rootValue.request.file;
            },
          },
        },
      }),
    });

    const app = server();

    // Multer provides multipart form data parsing.
    const storage = multer.memoryStorage();
    app.use(multer({ storage }).single("file"));

    // Providing the request as part of `rootValue` allows it to
    // be accessible from within Schema resolve functions.
    app.post(
      urlString(),
      graphqlHTTP((req) => ({
        schema: TestMutationSchema,
        rootValue: { request: req },
      }))
    );

    const response = await app
      .request()
      .post(urlString())
      .field(
        "query",
        `mutation TestMutation {
          uploadFile { originalname, mimetype }
        }`
      )
      .attach("file", Buffer.from("test"), "test.txt");

    expect(JSON.parse(await response.text())).toEqual({
      data: {
        uploadFile: {
          originalname: "test.txt",
          mimetype: "text/plain",
        },
      },
    });
  });

  xit("allows for pre-parsed POST using application/graphql", async () => {
    const app = server();
    app.use(bodyParser.text({ type: "application/graphql" }));

    app.post(urlString(), graphqlHTTP({ schema: TestSchema }));

    const req = app
      .request()
      .post(urlString())
      .set("Content-Type", "application/graphql");
    req.write(Buffer.from('{ test(who: "World") }'));
    const response = await req;

    expect(JSON.parse(await response.text())).toEqual({
      data: {
        test: "Hello World",
      },
    });
  });

  xit("does not accept unknown pre-parsed POST string", async () => {
    const app = server();
    app.use(bodyParser.text({ type: "*/*" }));

    app.post(urlString(), graphqlHTTP({ schema: TestSchema }));

    const req = app.request().post(urlString());
    req.write(Buffer.from('{ test(who: "World") }'));
    const response = await req;

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Must provide query string." }],
    });
  });

  xit("does not accept unknown pre-parsed POST raw Buffer", async () => {
    const app = server();
    app.use(bodyParser.raw({ type: "*/*" }));

    app.post(urlString(), graphqlHTTP({ schema: TestSchema }));

    const req = app
      .request()
      .post(urlString())
      .set("Content-Type", "application/graphql");
    req.write(Buffer.from('{ test(who: "World") }'));
    const response = await req;

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Must provide query string." }],
    });
  });
});

describe("Pretty printing", () => {
  it("supports pretty printing", async () => {
    const prettyHandler = createRequestHandler(TestSchema, { pretty: true });
    const response = await prettyHandler(
      new Request(
        urlString({
          query: "{test}",
        })
      )
    );

    expect(await response.text()).toEqual(
      [
        // Pretty printed JSON
        "{",
        '  "data": {',
        '    "test": "Hello World"',
        "  }",
        "}",
      ].join("\n")
    );
  });

  xit("supports pretty printing configured by request", async () => {});
});

xit("will send request and response when using thunk", async () => {
  const app = server();

  let seenRequest;
  let seenResponse;

  app.get(
    urlString(),
    graphqlHTTP((req, res) => {
      seenRequest = req;
      seenResponse = res;
      return { schema: TestSchema };
    })
  );

  await app.request().get(urlString({ query: "{test}" }));

  expect(seenRequest).to.not.equal(undefined);
  expect(seenResponse).to.not.equal(undefined);
});

describe("Error handling functionality", () => {
  it("handles field errors caught by GraphQL", async () => {
    const response = await handler(
      new Request(urlString({ query: "{thrower}" }))
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: { thrower: null },
      errors: [
        {
          message: "Throws!",
          locations: [{ line: 1, column: 2 }],
          path: ["thrower"],
        },
      ],
    });
  });

  it("handles query errors from non-null top field errors", async () => {
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          test: {
            type: new GraphQLNonNull(GraphQLString),
            resolve() {
              throw new Error("Throws!");
            },
          },
        },
      }),
    });
    const localHandler = createRequestHandler(schema);
    const response = await localHandler(
      new Request(
        urlString({
          query: "{ test }",
        })
      )
    );

    expect(response.status).toEqual(500);
    expect(JSON.parse(await response.text())).toEqual({
      data: null,
      errors: [
        {
          message: "Throws!",
          locations: [{ line: 1, column: 3 }],
          path: ["test"],
        },
      ],
    });
  });

  it("allows for custom error formatting to sanitize", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customFormatErrorFn: (error) => ({
        message: "Custom error format: " + error.message,
      }),
    });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{thrower}",
        })
      )
    );
    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: { thrower: null },
      errors: [
        {
          message: "Custom error format: Throws!",
        },
      ],
    });
  });

  it("allows for custom error formatting to elaborate", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customFormatErrorFn: (error) => ({
        message: error.message,
        locations: error.locations,
        stack: "Stack trace",
      }),
    });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{thrower}",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: { thrower: null },
      errors: [
        {
          message: "Throws!",
          locations: [{ line: 1, column: 2 }],
          stack: "Stack trace",
        },
      ],
    });
  });

  it("handles syntax errors caught by GraphQL", async () => {
    const response = await handler(
      new Request(
        urlString({
          query: "syntax_error",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: 'Syntax Error: Unexpected Name "syntax_error".',
          locations: [{ line: 1, column: 1 }],
        },
      ],
    });
  });

  it("handles errors caused by a lack of query", async () => {
    const response = await handler(new Request(urlString()));

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Must provide query string." }],
    });
  });

  it("handles invalid JSON bodies", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: "[]",
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Must provide query string." }],
    });
  });

  it("handles incomplete JSON bodies", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: '{"query":',
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text()).errors[0].message).toContain(
      "invalid json response body"
    );
  });

  it("handles plain POST text", async () => {
    const response = await handler(
      new Request(
        urlString({
          variables: JSON.stringify({ who: "Dolly" }),
        }),
        {
          method: "POST",
          body: "query helloWho($who: String){ test(who: $who) }",
          headers: { "Content-Type": "text/plain" },
        }
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Must provide query string." }],
    });
  });

  xit("handles unsupported charset", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: '{ test(who: "World") }',
        headers: { "Content-Type": "application/graphql; charset=ascii" },
      })
    );

    expect(response.status).toEqual(415);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: 'Unsupported charset "ASCII".' }],
    });
  });

  xit("handles unsupported utf charset", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: '{ test(who: "World") }',
        headers: { "Content-Type": "application/graphql; charset=utf-53" },
      })
    );

    expect(response.status).toEqual(415);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: 'Unsupported charset "UTF-53".' }],
    });
  });

  xit("handles unknown encoding", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: "!@#$%^*(&^$%#@",
        headers: { "Content-Encoding": "garbage" },
      })
    );

    expect(response.status).toEqual(415);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: 'Unsupported content-encoding "garbage".' }],
    });
  });

  xit("handles invalid body", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: `{ "query": "{ ${new Array(102400).fill("test").join("")} }" }`,
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Invalid body: request entity too large." }],
    });
  });

  xit("handles poorly formed variables", async () => {
    const response = await handler(
      new Request(
        urlString({
          variables: "who:You",
          query: "query helloWho($who: String){ test(who: $who) }",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "Variables are invalid JSON." }],
    });
  });

  it("allows for custom error formatting of poorly formed requests", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customFormatErrorFn: (error) => ({
        message: "Custom error format: " + error.message,
      }),
    });
    const response = await localHandler(
      new Request(
        urlString({
          variables: "who:You",
          query: "query helloWho($who: String){ test(who: $who) }",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text()).errors[0].message).toContain(
      "Custom error format: "
    );
  });

  it("allows disabling prettifying poorly formed requests", async () => {
    const localHandler = createRequestHandler(TestSchema, { pretty: false });
    const response = await localHandler(
      new Request(
        urlString({
          variables: "who:You",
          query: "query helloWho($who: String){ test(who: $who) }",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(await response.text()).toEqual(
      '{"errors":[{"message":"Unexpected token w in JSON at position 0"}]}'
    );
  });

  it("handles invalid variables", async () => {
    const response = await handler(
      new Request(urlString(), {
        method: "POST",
        body: JSON.stringify({
          query: "query helloWho($who: String){ test(who: $who) }",
          variables: { who: ["John", "Jane"] },
        }),
        headers,
      })
    );

    expect(response.status).toEqual(500);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          locations: [{ column: 16, line: 1 }],
          message:
            'Variable "$who" got invalid value ["John", "Jane"]; String cannot represent a non string value: ["John", "Jane"]',
        },
      ],
    });
  });

  it("handles unsupported HTTP methods", async () => {
    const response = await handler(
      new Request(urlString({ query: "{test}" }), {
        method: "PUT",
      })
    );

    expect(response.status).toEqual(405);
    expect(response.headers.get("allow")).toEqual("OPTIONS, GET, POST");
    expect(JSON.parse(await response.text())).toEqual({
      errors: [{ message: "GraphQL only supports GET and POST requests." }],
    });
  });
});

describe("Custom validate function", () => {
  it("returns data", async () => {
    const validatingHandler = createRequestHandler(TestSchema, {
      validationRules: specifiedRules,
      customValidateFn: (schema, documentAST, validationRules) => {
        return validate(schema, documentAST, validationRules);
      },
    });
    const response = await validatingHandler(
      new Request(urlString({ query: "{test}", raw: "" }), {
        headers: { Accept: "text/html" },
      })
    );

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });

  it("returns validation errors", async () => {
    const validatingHandler = createRequestHandler(TestSchema, {
      validationRules: specifiedRules,
      customValidateFn: (schema, documentAST, validationRules) => {
        const errors = validate(schema, documentAST, validationRules);

        return [new GraphQLError(`custom error ${errors.length}`)];
      },
    });
    const response = await validatingHandler(
      new Request(
        urlString({
          query: "{thrower}",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: "custom error 0",
        },
      ],
    });
  });
});

describe("Custom validation rules", () => {
  const AlwaysInvalidRule = function (context) {
    return {
      Document() {
        context.reportError(
          new GraphQLError("AlwaysInvalidRule was really invalid!")
        );
      },
    };
  };

  it("Do not execute a query if it do not pass the custom validation.", async () => {
    const validatingHandler = createRequestHandler(TestSchema, {
      validationRules: [...specifiedRules, AlwaysInvalidRule],
      customValidateFn: validate,
    });
    const response = await validatingHandler(
      new Request(
        urlString({
          query: "{thrower}",
        })
      )
    );

    expect(response.status).toEqual(400);
    expect(JSON.parse(await response.text())).toEqual({
      errors: [
        {
          message: "AlwaysInvalidRule was really invalid!",
        },
      ],
    });
  });
});

describe("Custom execute", () => {
  it("allow to replace default execute", async () => {
    let seenExecuteArgs;
    const localHandler = createRequestHandler(TestSchema, {
      customExecuteFn: async (args) => {
        seenExecuteArgs = args;
        const result = await Promise.resolve(execute(args));
        return {
          ...result,
          data: {
            ...result.data,
            test2: "Modification",
          },
        };
      },
    });
    const response = await localHandler(
      new Request(urlString({ query: "{test}" }))
    );

    expect(await response.text()).toEqual(
      '{"data":{"test":"Hello World","test2":"Modification"}}'
    );
    expect(seenExecuteArgs).not.toEqual(null);
  });

  it("catches errors thrown from custom execute function", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customExecuteFn: () => {
        throw new Error("I did something wrong");
      },
    });
    const response = await localHandler(
      new Request(urlString({ query: "{test}" }))
    );

    expect(response.status).toEqual(500);
    expect(await response.text()).toEqual(
      '{"errors":[{"message":"I did something wrong"}]}'
    );
  });
});

describe("Custom parse function", () => {
  it("can replace default parse functionality", async () => {
    let seenParseArgs;
    const localHandler = createRequestHandler(TestSchema, {
      customParseFn: (args) => {
        seenParseArgs = args;
        return parse(new Source("{test}", "Custom parse function"));
      },
    });
    const response = await localHandler(
      new Request(urlString({ query: "----" }))
    );

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
    expect(seenParseArgs).toEqual("----");
  });

  it("can throw errors", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customParseFn: (args) => {
        throw new GraphQLError("my custom parse error");
      },
    });

    const response = await localHandler(
      new Request(urlString({ query: "----" }))
    );

    expect(response.status).toEqual(400);
    expect(await response.text()).toEqual(
      '{"errors":[{"message":"my custom parse error"}]}'
    );
  });
});

describe("Custom result extensions", () => {
  it("allows for adding extensions", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      context: { foo: "bar" },
      extensions: function ({ context }) {
        return { contextValue: JSON.stringify(context) };
      },
    });
    const response = await localHandler(
      new Request(urlString({ query: "{test}", raw: "" }), {
        headers: { Accept: "text/html" },
      })
    );

    expect(response.status).toEqual(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.text()).toEqual(
      '{"data":{"test":"Hello World"},"extensions":{"contextValue":"{\\"foo\\":\\"bar\\"}"}}'
    );
  });

  it("extensions have access to initial GraphQL result", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      customFormatErrorFn: () => ({
        message: "Some generic error message.",
      }),
      extensions: function ({ result }) {
        return { preservedResult: { ...result } };
      },
    });
    const response = await localHandler(
      new Request(
        urlString({
          query: "{thrower}",
        })
      )
    );

    expect(response.status).toEqual(200);
    expect(JSON.parse(await response.text())).toEqual({
      data: { thrower: null },
      errors: [{ message: "Some generic error message." }],
      extensions: {
        preservedResult: {
          data: { thrower: null },
          errors: [
            {
              message: "Throws!",
              locations: [{ line: 1, column: 2 }],
              path: ["thrower"],
            },
          ],
        },
      },
    });
  });

  it("extension function may be async", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      extensions: function () {
        return Promise.resolve({ eventually: 42 });
      },
    });
    const response = await localHandler(
      new Request(urlString({ query: "{test}", raw: "" }), {
        headers: { Accept: "text/html" },
      })
    );

    expect(response.status).toEqual(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.text()).toEqual(
      '{"data":{"test":"Hello World"},"extensions":{"eventually":42}}'
    );
  });

  it("does nothing if extensions function does not return an object", async () => {
    const localHandler = createRequestHandler(TestSchema, {
      context: { foo: "bar" },
      extensions: () => undefined,
    });
    const response = await localHandler(
      new Request(urlString({ query: "{test}", raw: "" }), {
        headers: { Accept: "text/html" },
      })
    );

    expect(response.status).toEqual(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.text()).toEqual('{"data":{"test":"Hello World"}}');
  });
});
