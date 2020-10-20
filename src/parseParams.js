async function parseParams(request = new Request("")) {
  try {
    const { searchParams: fromURL } = new URL(request.url);
    let fromBody = {};
    if (
      request.method === "POST" &&
      request.headers.get("Content-Type").includes("application/json")
    ) {
      fromBody = await request.json();
    } else if (
      request.method === "POST" &&
      request.headers
        .get("Content-Type")
        .includes("application/x-www-form-urlencoded")
    ) {
      let bodySearch = new URLSearchParams(await request.text());
      fromBody = {
        query: bodySearch.get("query"),
        variables:
          bodySearch.get("variables") &&
          JSON.parse(bodySearch.get("variables")),
        operationName: bodySearch.get("operationName"),
      };
    } else if (
      request.method === "POST" &&
      request.headers.get("Content-Type").includes("application/graphql")
    ) {
      fromBody = { query: await request.text() };
    }

    return {
      query: fromURL.get("query") || fromBody.query,
      variables: fromURL.get("variables")
        ? JSON.parse(fromURL.get("variables"))
        : typeof fromBody.variables === "string"
        ? JSON.parse(fromBody.variables)
        : fromBody.variables,
      operationName: fromURL.get("operationName") || fromBody.operationName,
    };
  } catch (parseError) {
    throw { status: 400, error: parseError };
  }
}

export { parseParams };
