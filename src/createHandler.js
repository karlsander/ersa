import { execute as gqlExecute } from "graphql/execution/execute";
import { parse as gqlParse } from "graphql/language/parser";
import { getOperationAST } from "graphql/utilities/getOperationAST";
import { formatError as gqlFormatError } from "graphql/error/formatError";
import { parseParams } from "./parseParams";

function createRequestHandler(
  schema,
  {
    allowOrigins = undefined,
    context = undefined,
    pretty = false,
    validationRules = [],
    rootValue = undefined,
    fieldResolver = undefined,
    typeResolver = undefined,
    extensions = undefined,
    customExecuteFn: execute = gqlExecute,
    customParseFn: parse = gqlParse,
    customFormatErrorFn: formatError = gqlFormatError,
    customValidateFn: validate = undefined,
  } = {
    allowOrigins: undefined,
    context: undefined,
    pretty: false,
    validationRules: [],
    rootValue: undefined,
    fieldResolver: undefined,
    typeResolver: undefined,
    extensions: undefined,
    customExecuteFn: gqlExecute,
    customParseFn: gqlParse,
    customFormatErrorFn: gqlFormatError,
    customValidateFn: undefined,
  }
) {
  const baseHeaders = {
    "Content-Type": "application/json",
  };
  if (allowOrigins) {
    baseHeaders["Access-Control-Allow-Origin"] = allowOrigins;
  }
  return async (request = new Request(""), localContext = undefined) => {
    if (request.method === "OPTIONS" && allowOrigins) {
      return new Response("", {
        status: 204,
        headers: {
          Allow: "OPTIONS, GET, POST",
          "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
          "Access-Control-Allow-Origin": allowOrigins,
        },
      });
    }
    try {
      if (!(request.method === "POST" || request.method === "GET")) {
        throw {
          headers: { Allow: "OPTIONS, GET, POST" },
          status: 405,
          error: "GraphQL only supports GET and POST requests.",
        };
      }
      const { query, variables, operationName } = await parseParams(request);
      if (!query) {
        throw { status: 400, error: "Must provide query string." };
      }
      let document;
      try {
        document = parse(query);
      } catch (syntaxError) {
        throw { status: 400, error: [syntaxError] };
      }
      if (request.method === "GET") {
        const doc = getOperationAST(document, operationName);
        if (doc && doc.operation && doc.operation !== "query") {
          throw {
            status: 405,
            error: "Can only perform a mutation operation from a POST request.",
            headers: { Allow: "POST" },
          };
        }
      }

      if (validate) {
        const validationErrors = validate(schema, document, validationRules);
        if (validationErrors.length > 0) {
          throw {
            status: 400,
            error: validationErrors,
          };
        }
      }
      const result = await execute({
        schema,
        document,
        variableValues: variables,
        operationName,
        rootValue,
        contextValue: localContext || context || request,
        fieldResolver,
        typeResolver,
      });
      let extensionsResult;
      if (extensions) {
        extensionsResult = await extensions({
          document,
          variables,
          operationName,
          result,
          context,
        });
      }
      return new Response(
        JSON.stringify(
          {
            errors: result.errors && result.errors.map(formatError),
            data: result.data,
            extensions: extensionsResult,
          },
          null,
          pretty ? 2 : 0
        ),
        {
          status: result.data ? 200 : 500,
          headers: baseHeaders,
        }
      );
    } catch (e) {
      const { status, error, headers } = e;
      const reason = error || e;
      return new Response(
        JSON.stringify(
          {
            errors: (Array.isArray(reason)
              ? reason
              : [typeof reason === "object" ? reason : { message: reason }]
            ).map(formatError),
          },
          null,
          pretty ? 2 : 0
        ),
        {
          status: status || 500,
          headers: { ...baseHeaders, ...headers },
        }
      );
    }
  };
}

export { createRequestHandler };
