import { createRequestHandler } from "../src/index";
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql/type";

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "RootQueryType",
    fields: {
      hello: {
        type: GraphQLString,
        resolve() {
          return "world";
        },
      },
    },
  }),
});

/*
sizes:
makeExecutableSchema: 25 kb
parse: 9 kb
execute: 20 kb

basic schema types: 14 kb (but adds nothing to parse and execute)

*/
/*
function gql(strings) {
  return strings[0];
}

const schema = makeExecutableSchema({
  typeDefs: gql`
    type Query {
      hello: String
      hi(name: String): String
    }
  `,
  resolvers: {
    Query: {
      hello: () => "world",
      hi: (_, { name }) => `Hi ${name}`,
    },
  },
});
*/
const gqlHandler = createRequestHandler(schema, { allowOrigins: "*" });

addEventListener("fetch", (event) => {
  event.respondWith(gqlHandler(event.request));
});
