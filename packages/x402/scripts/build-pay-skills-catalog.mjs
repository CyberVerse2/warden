import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = process.argv[2];
const outRoot = process.argv[3] ?? path.resolve("packages/x402/catalog");

if (!sourceRoot) {
  console.error(
    "usage: node packages/x402/scripts/build-pay-skills-catalog.mjs <pay-skills-repo> [out-dir]",
  );
  process.exit(1);
}

const providersRoot = path.join(sourceRoot, "providers");

function parseScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return numeric;
  }
  return trimmed;
}

function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { frontmatter: {}, body: markdown };

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};
  for (let i = 0; i < lines.length; i += 1) {
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i] ?? "");
    if (!top) continue;
    const [, key, rawValue] = top;
    if (rawValue.trim()) {
      frontmatter[key] = parseScalar(rawValue);
      continue;
    }

    const nested = {};
    while (lines[i + 1]?.startsWith("  ")) {
      i += 1;
      const child = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i] ?? "");
      if (child) nested[child[1]] = parseScalar(child[2] ?? "");
    }
    frontmatter[key] = nested;
  }

  return {
    frontmatter,
    body: markdown.slice(match[0].length).trim(),
  };
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkPayFiles(dir = providersRoot) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkPayFiles(fullPath)));
    if (entry.isFile() && entry.name === "PAY.md") files.push(fullPath);
  }
  return files;
}

function normalizePath(value) {
  if (!value || value === "/") return "";
  return String(value).replace(/^\/+/, "");
}

function joinUrl(base, route) {
  if (!route) return base;
  if (/^https?:\/\//i.test(route)) return route;
  return `${String(base).replace(/\/$/, "")}/${normalizePath(route)}`;
}

function schemaFromContent(content) {
  if (!content || typeof content !== "object") return undefined;
  const json =
    content["application/json"] ??
    content["application/*+json"] ??
    Object.entries(content).find(([key]) => key.includes("json"))?.[1];
  return json && typeof json === "object" ? json.schema : undefined;
}

function successResponseSchema(responses) {
  if (!responses || typeof responses !== "object") return undefined;
  for (const code of ["200", "201", "202", "default"]) {
    const response = responses[code];
    if (response && typeof response === "object") {
      const schema = schemaFromContent(response.content);
      if (schema) return schema;
    }
  }
  return undefined;
}

function operationsFromOpenApi(openapi, serviceUrl) {
  const paths = openapi?.paths;
  if (!paths || typeof paths !== "object") return [];
  const serverUrl = Array.isArray(openapi?.servers)
    ? openapi.servers.find((server) => /^https?:\/\//i.test(server?.url ?? ""))?.url
    : undefined;
  const baseUrl = serverUrl ?? serviceUrl;
  const operations = [];
  for (const [route, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;
      operations.push({
        method: method.toUpperCase(),
        path: normalizePath(route),
        url: joinUrl(baseUrl, route),
        operationId: operation.operationId,
        summary:
          operation.summary ??
          operation.description ??
          operation.operationId ??
          `${method.toUpperCase()} ${route}`,
        description: operation.description,
        tags: Array.isArray(operation.tags) ? operation.tags : undefined,
        parameters: Array.isArray(operation.parameters)
          ? operation.parameters
          : undefined,
        requestSchema: schemaFromContent(operation.requestBody?.content),
        responseSchema: successResponseSchema(operation.responses),
        responses: operation.responses,
        x402: Object.fromEntries(
          Object.entries(operation).filter(([key]) => key.startsWith("x-")),
        ),
      });
    }
  }
  return operations;
}

function discoverySchema(refOrSchema, schemas) {
  if (!refOrSchema || typeof refOrSchema !== "object") return undefined;
  if (typeof refOrSchema.$ref === "string" && schemas?.[refOrSchema.$ref]) {
    return schemas[refOrSchema.$ref];
  }
  return refOrSchema;
}

function operationsFromGoogleDiscovery(discovery, serviceUrl) {
  if (!discovery || typeof discovery !== "object") return [];
  const operations = [];
  const schemas = discovery.schemas;

  function visitResources(resources) {
    if (!resources || typeof resources !== "object") return;
    for (const resource of Object.values(resources)) {
      if (!resource || typeof resource !== "object") continue;
      visitMethods(resource.methods);
      visitResources(resource.resources);
    }
  }

  function visitMethods(methods) {
    if (!methods || typeof methods !== "object") return;
    for (const method of Object.values(methods)) {
      if (!method || typeof method !== "object") continue;
      const httpMethod = String(method.httpMethod ?? "GET").toUpperCase();
      const route = method.path ?? method.restPath ?? method.flatPath;
      if (!route) continue;
      operations.push({
        method: httpMethod,
        path: normalizePath(route),
        url: joinUrl(serviceUrl, route),
        operationId: method.id,
        summary: method.description ?? method.id ?? `${httpMethod} ${route}`,
        description: method.description,
        parameters:
          method.parameters && typeof method.parameters === "object"
            ? method.parameters
            : undefined,
        requestSchema: discoverySchema(method.request, schemas),
        responseSchema: discoverySchema(method.response, schemas),
        scopes: Array.isArray(method.scopes) ? method.scopes : undefined,
      });
    }
  }

  visitMethods(discovery.methods);
  visitResources(discovery.resources);
  return operations;
}

function operationsFromInlineEndpoints(endpoints, serviceUrl) {
  if (!Array.isArray(endpoints)) return [];
  return endpoints
    .map((endpoint) => {
      if (!endpoint || typeof endpoint !== "object") return undefined;
      const method = String(endpoint.method ?? "GET").toUpperCase();
      const route = endpoint.path ?? endpoint.url;
      if (!route) return undefined;
      return {
        method,
        path: normalizePath(route),
        url: joinUrl(serviceUrl, route),
        operationId: endpoint.operationId,
        summary:
          endpoint.summary ??
          endpoint.description ??
          `${method} ${String(route)}`,
        description: endpoint.description,
        requestSchema: endpoint.requestSchema,
        responseSchema: endpoint.responseSchema,
        x402: Object.fromEntries(
          Object.entries(endpoint).filter(([key]) => key.startsWith("x-")),
        ),
      };
    })
    .filter(Boolean);
}

async function loadOpenApi({ providerDir, openapi }) {
  if (!openapi || typeof openapi !== "object") return undefined;
  if (typeof openapi.path === "string") {
    const filePath = path.join(providerDir, openapi.path);
    if (!(await exists(filePath))) {
      return { source: { type: "local", path: openapi.path, resolved: false } };
    }
    return {
      source: { type: "local", path: openapi.path, resolved: true },
      spec: JSON.parse(await readFile(filePath, "utf8")),
    };
  }
  if (typeof openapi.url === "string") {
    try {
      const response = await fetch(openapi.url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        return {
          source: {
            type: "remote",
            url: openapi.url,
            resolved: false,
            status: response.status,
          },
        };
      }
      return {
        source: { type: "remote", url: openapi.url, resolved: true },
        spec: await response.json(),
      };
    } catch (error) {
      return {
        source: {
          type: "remote",
          url: openapi.url,
          resolved: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
  return undefined;
}

async function fetchOriginDiscovery(openapiResult) {
  const origins = openapiResult?.spec?.info?.["x-origin"];
  if (!Array.isArray(origins)) return openapiResult;
  const discoveryOrigin = origins.find(
    (origin) =>
      origin &&
      typeof origin === "object" &&
      typeof origin.url === "string" &&
      origin.url.includes("$discovery/rest"),
  );
  if (!discoveryOrigin) return openapiResult;
  try {
    const response = await fetch(discoveryOrigin.url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return openapiResult;
    return {
      source: {
        ...openapiResult.source,
        originUrl: discoveryOrigin.url,
        originResolved: true,
      },
      spec: openapiResult.spec,
      originSpec: await response.json(),
    };
  } catch (error) {
    return {
      ...openapiResult,
      source: {
        ...openapiResult.source,
        originUrl: discoveryOrigin.url,
        originResolved: false,
        originError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compact(item)]),
  );
}

const payFiles = (await walkPayFiles()).sort();
const providers = [];

for (const payFile of payFiles) {
  const providerDir = path.dirname(payFile);
  const fqn = path.relative(providersRoot, providerDir).split(path.sep).join("/");
  const markdown = await readFile(payFile, "utf8");
  const { frontmatter, body } = parseFrontmatter(markdown);
  const openapiResult = await fetchOriginDiscovery(await loadOpenApi({
    providerDir,
    openapi: frontmatter.openapi,
  }));
  const operations =
    operationsFromInlineEndpoints(frontmatter.endpoints, frontmatter.service_url) ??
    [];
  const openApiOperations = openapiResult?.spec
    ? operationsFromOpenApi(openapiResult.spec, frontmatter.service_url)
    : [];
  const discoveryOperations =
    openapiResult?.spec && openApiOperations.length === 0
      ? operationsFromGoogleDiscovery(openapiResult.spec, frontmatter.service_url)
      : [];
  const originDiscoveryOperations =
    openapiResult?.originSpec && openApiOperations.length === 0
      ? operationsFromGoogleDiscovery(
          openapiResult.originSpec,
          frontmatter.service_url,
        )
      : [];
  const service = compact({
    fqn,
    name: frontmatter.name,
    title: frontmatter.title,
    description: frontmatter.description,
    useCase: frontmatter.use_case,
    category: frontmatter.category,
    serviceUrl: frontmatter.service_url,
    sandboxServiceUrl: frontmatter.sandbox_service_url,
    version: frontmatter.version,
    pageUrl: `https://pay.sh/services/${fqn}`,
    source: {
      repository: "https://github.com/solana-foundation/pay-skills",
      payMdPath: path.relative(sourceRoot, payFile).split(path.sep).join("/"),
      openapi: openapiResult?.source,
    },
    documentation: {
      markdown: body,
      frontmatter,
    },
    endpoints:
      openApiOperations.length > 0
        ? openApiOperations
        : originDiscoveryOperations.length > 0
          ? originDiscoveryOperations
          : discoveryOperations.length > 0
          ? discoveryOperations
          : operations,
    openapi: openapiResult?.spec,
  });
  providers.push(service);
}

const providersDir = path.join(outRoot, "providers");
await mkdir(providersDir, { recursive: true });

for (const provider of providers) {
  const filePath = path.join(providersDir, `${provider.fqn.replace(/\//g, "__")}.json`);
  await writeFile(filePath, `${JSON.stringify(provider, null, 2)}\n`);
}

const index = compact({
  generatedAt: new Date().toISOString(),
  source: {
    repository: "https://github.com/solana-foundation/pay-skills",
    commit: process.env.PAY_SKILLS_COMMIT,
  },
  serviceCount: providers.length,
  endpointCount: providers.reduce(
    (total, provider) => total + provider.endpoints.length,
    0,
  ),
  services: providers.map((provider) =>
    compact({
      fqn: provider.fqn,
      title: provider.title,
      description: provider.description,
      useCase: provider.useCase,
      category: provider.category,
      serviceUrl: provider.serviceUrl,
      pageUrl: provider.pageUrl,
      endpointCount: provider.endpoints.length,
      providerFile: `providers/${provider.fqn.replace(/\//g, "__")}.json`,
      openapiResolved: provider.source.openapi?.resolved,
    }),
  ),
});

await writeFile(path.join(outRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
await writeFile(
  path.join(outRoot, "README.md"),
  `# x402 service catalog\n\nStatic JSON catalog generated from https://github.com/solana-foundation/pay-skills.\n\n- \`index.json\` lists every service and points to provider detail files.\n- \`providers/*.json\` preserves PAY.md metadata, markdown documentation, endpoint URLs, request/response schemas, x402 metadata, and the resolved OpenAPI spec when available.\n\nRegenerate with:\n\n\`\`\`bash\nPAY_SKILLS_COMMIT=$(git -C /path/to/pay-skills rev-parse HEAD) node packages/x402/scripts/build-pay-skills-catalog.mjs /path/to/pay-skills\n\`\`\`\n`,
);

console.log(
  `wrote ${providers.length} services and ${index.endpointCount} endpoints to ${outRoot}`,
);
