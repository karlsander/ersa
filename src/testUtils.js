import { GraphQLString, GraphQLObjectType, GraphQLSchema } from "graphql";

const QueryRootType = new GraphQLObjectType({
  name: "QueryRoot",
  fields: {
    test: {
      type: GraphQLString,
      args: {
        who: { type: GraphQLString },
      },
      resolve: (_root, args) => "Hello " + (args.who ?? "World"),
    },
    thrower: {
      type: GraphQLString,
      resolve() {
        throw new Error("Throws!");
      },
    },
  },
});

const TestSchema = new GraphQLSchema({
  query: QueryRootType,
  mutation: new GraphQLObjectType({
    name: "MutationRoot",
    fields: {
      writeTest: {
        type: QueryRootType,
        resolve: () => ({}),
      },
    },
  }),
});

function stringifyURLParams(urlParams) {
  return new URLSearchParams(urlParams).toString();
}
function urlString(queryParams = undefined) {
  return `http://localhost/graphql${
    queryParams ? "?" + stringifyURLParams(queryParams) : ""
  }`;
}

export { TestSchema, urlString, stringifyURLParams };
