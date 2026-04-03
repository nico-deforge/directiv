import { getLinearClient } from "./linear";

export async function linearQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const client = getLinearClient();
  if (!client) throw new Error("Linear not connected");
  // rawRequest throws LinearError on any failure (network, auth, GraphQL errors).
  // On success, result.data is always present.
  const result = await client.client.rawRequest<T, Record<string, unknown>>(
    query,
    variables,
  );
  return result.data as T;
}
