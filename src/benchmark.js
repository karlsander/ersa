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
import { performance } from "perf_hooks";

global.Request = Request;
global.Response = Response;

const headers = {
  "Content-Type": "application/json",
};

/** @type {(request: Request) => Promise<Response>} */
const handler = createRequestHandler(TestSchema);

/** @type {(request: Request) => Promise<Response>} */
const validatingHandler = createRequestHandler(TestSchema, {
  customValidateFn: validate,
  validationRules: specifiedRules,
});

async function exec() {
  console.log("start 1", performance.now());
  await handler(new Request(urlString({ query: "{test}" })));
  console.log("end 1", performance.now());
  console.log("start 2", performance.now());
  await handler(
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
  console.log("end 2", performance.now());
  console.log("start 3", performance.now());
  await handler(
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
  console.log("end 3", performance.now());
  console.log("validating start 1", performance.now());
  await validatingHandler(new Request(urlString({ query: "{test}" })));
  console.log("validating end 1", performance.now());
  console.log("validating start 2", performance.now());
  await validatingHandler(
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
  console.log("validating end 2", performance.now());
  console.log("validating start 3", performance.now());
  await validatingHandler(
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
  console.log("validating end 3", performance.now());
}

exec();
