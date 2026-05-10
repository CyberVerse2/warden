interface CompactEndpoint {
  operationId?: string;
  method: string;
  path?: string;
  url: string;
  summary?: string;
  parameters?: string[];
  requiredBodyFields: string[];
  optionalBodyFields: string[];
  requestHint?: string;
  price?: string;
  paymentRequired?: boolean;
  responseKind?: string;
}

interface CompactSkillEndpoints {
  skill?: {
    fqn?: string;
    title?: string;
    description?: string;
    serviceUrl?: string;
    endpointCount?: number;
  };
  endpoints: CompactEndpoint[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function localRef(root: unknown, ref: string) {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((current, part) => {
      if (!isRecord(current)) return undefined;
      return current[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }, root);
}

function mergeSchemas(schemas: Record<string, unknown>[]) {
  const required = [...new Set(schemas.flatMap((schema) => stringArray(schema.required)))];
  const properties = Object.assign(
    {},
    ...schemas.map((schema) => (isRecord(schema.properties) ? schema.properties : {})),
  );
  return {
    ...schemas[0],
    ...(required.length > 0 ? { required } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
}

function resolveSchema(schema: unknown, root: unknown, seen = new Set<string>()): unknown {
  if (!isRecord(schema)) return schema;
  const ref = stringField(schema, "$ref");
  if (ref) {
    if (seen.has(ref)) return schema;
    const target = localRef(root, ref);
    return resolveSchema(target ?? schema, root, new Set([...seen, ref]));
  }
  if (Array.isArray(schema.allOf)) {
    return mergeSchemas(
      schema.allOf
        .map((item) => resolveSchema(item, root, seen))
        .filter((item): item is Record<string, unknown> => isRecord(item)),
    );
  }
  return schema;
}

function schemaProperties(schema: unknown) {
  const record = isRecord(schema) ? schema : undefined;
  const properties = isRecord(record?.properties) ? record.properties : undefined;
  return properties ? Object.keys(properties) : [];
}

function parameterNames(parameters: unknown) {
  if (!Array.isArray(parameters)) return [];
  return parameters
    .map((parameter) => stringField(isRecord(parameter) ? parameter : undefined, "name"))
    .filter((name): name is string => Boolean(name));
}

function requestHint(endpoint: Record<string, unknown>, requestSchema: unknown) {
  const required = stringArray(
    isRecord(requestSchema) ? requestSchema.required : undefined,
  );
  const properties = schemaProperties(requestSchema);
  const parameters = parameterNames(endpoint.parameters);
  if (required.length > 0) return `Requires body fields: ${required.join(", ")}`;
  if (properties.length > 0) return `Accepts body fields: ${properties.join(", ")}`;
  if (parameters.length > 0) return `Accepts parameters: ${parameters.join(", ")}`;
  return undefined;
}

function responseKind(schema: unknown): string | undefined {
  const record = isRecord(schema) ? schema : undefined;
  const type = stringField(record, "type");
  if (type) return type;
  if (Array.isArray(record?.oneOf)) return "oneOf";
  if (Array.isArray(record?.anyOf)) return "anyOf";
  if (Array.isArray(record?.allOf)) return "allOf";
  return undefined;
}

function endpointPrice(endpoint: Record<string, unknown>) {
  const x402 = isRecord(endpoint.x402) ? endpoint.x402 : undefined;
  const paymentInfo = isRecord(x402?.["x-payment-info"])
    ? x402["x-payment-info"]
    : undefined;
  return stringField(paymentInfo, "price");
}

function endpointPaymentRequired(endpoint: Record<string, unknown>) {
  const x402 = isRecord(endpoint.x402) ? endpoint.x402 : undefined;
  return booleanField(x402, "x-payment-required");
}

function compactEndpoint(endpoint: unknown, root: unknown): CompactEndpoint | undefined {
  if (!isRecord(endpoint)) return undefined;
  const method = stringField(endpoint, "method");
  const url = stringField(endpoint, "url");
  if (!method || !url) return undefined;

  const requestSchema = resolveSchema(endpoint.requestSchema, root);
  const responseSchema = resolveSchema(endpoint.responseSchema, root);
  const requiredBodyFields = stringArray(isRecord(requestSchema) ? requestSchema.required : undefined);
  const optionalBodyFields = schemaProperties(requestSchema).filter(
    (field) => !requiredBodyFields.includes(field),
  );

  return {
    ...(stringField(endpoint, "operationId")
      ? { operationId: stringField(endpoint, "operationId") }
      : {}),
    method,
    ...(stringField(endpoint, "path") ? { path: stringField(endpoint, "path") } : {}),
    url,
    ...(stringField(endpoint, "summary")
      ? { summary: stringField(endpoint, "summary") }
      : {}),
    ...(parameterNames(endpoint.parameters).length > 0
      ? { parameters: parameterNames(endpoint.parameters) }
      : {}),
    requiredBodyFields,
    optionalBodyFields,
    ...(requestHint(endpoint, requestSchema) ? { requestHint: requestHint(endpoint, requestSchema) } : {}),
    ...(endpointPrice(endpoint) ? { price: endpointPrice(endpoint) } : {}),
    ...(endpointPaymentRequired(endpoint) !== undefined
      ? { paymentRequired: endpointPaymentRequired(endpoint) }
      : {}),
    ...(responseKind(responseSchema)
      ? { responseKind: responseKind(responseSchema) }
      : {}),
  };
}

export function compactX402EndpointResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const data = isRecord(result.data) ? result.data : undefined;
  const skill = isRecord(data?.skill) ? data.skill : undefined;
  const directEndpoints = Array.isArray(data?.endpoints) ? data.endpoints : [];
  const skillOperations = Array.isArray(skill?.operations) ? skill.operations : [];
  const endpoints = directEndpoints.length > 0 ? directEndpoints : skillOperations;
  if (endpoints.length === 0) return result;

  const compact: CompactSkillEndpoints = {
    skill: {
      ...(stringField(skill, "fqn") ? { fqn: stringField(skill, "fqn") } : {}),
      ...(stringField(skill, "title") ? { title: stringField(skill, "title") } : {}),
      ...(stringField(skill, "description")
        ? { description: stringField(skill, "description") }
        : {}),
      ...(stringField(skill, "serviceUrl")
        ? { serviceUrl: stringField(skill, "serviceUrl") }
        : {}),
      ...(numberField(skill, "endpointCount") !== undefined
        ? { endpointCount: numberField(skill, "endpointCount") }
        : {}),
    },
    endpoints: endpoints
      .map((endpoint) => compactEndpoint(endpoint, result))
      .filter((endpoint): endpoint is CompactEndpoint => Boolean(endpoint)),
  };

  return {
    ...result,
    data: compact,
  };
}
