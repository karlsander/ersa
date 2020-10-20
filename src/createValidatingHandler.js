import { validate as gqlValidate } from "graphql/validation/validate";
import { specifiedRules } from "graphql/validation/specifiedRules";
import { createRequestHandler as createLeanRequestHandler } from "./createHandler";

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
    customExecuteFn = undefined,
    customParseFn = undefined,
    customFormatErrorFn = undefined,
    customValidateFn = gqlValidate,
  } = {
    allowOrigins: undefined,
    context: undefined,
    pretty: false,
    validationRules: [],
    rootValue: undefined,
    fieldResolver: undefined,
    typeResolver: undefined,
    extensions: undefined,
    customExecuteFn: undefined,
    customParseFn: undefined,
    customFormatErrorFn: undefined,
    customValidateFn: gqlValidate,
  }
) {
  return createLeanRequestHandler(schema, {
    allowOrigins,
    context,
    pretty,
    validationRules: [...specifiedRules, ...validationRules],
    rootValue,
    fieldResolver,
    typeResolver,
    extensions,
    customExecuteFn,
    customParseFn,
    customFormatErrorFn,
    customValidateFn,
  });
}

export { createRequestHandler };
