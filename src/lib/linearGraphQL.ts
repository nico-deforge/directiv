import { getLinearClient } from "./linear";

export async function linearQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const client = getLinearClient();
  if (!client) throw new Error("Linear not connected");
  const result = await client.client.rawRequest<T, Record<string, unknown>>(
    query,
    variables,
  );
  if (!result.data) {
    const msg =
      result.errors?.map((e) => e.message).join("; ") ??
      result.error ??
      "No data returned";
    throw new Error(`Linear GraphQL error: ${msg}`);
  }
  return result.data;
}
