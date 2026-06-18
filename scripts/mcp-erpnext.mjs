/**
 * ERPNext MCP server — exposes ERPNext REST API tools to Cursor via stdio.
 *
 * Credentials from .env (or Cursor mcp.json envFile):
 *   ERPNEXT_BASE_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
// Cursor MCP uses envFile in .cursor/mcp.json; manual runs load .env.mcp.erp1 then .env.
loadEnv({ path: resolve(repoRoot, ".env.mcp.erp1") });
loadEnv({ path: resolve(repoRoot, ".env") });

function getConfig() {
  const baseUrl = (process.env.ERPNEXT_BASE_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = (process.env.ERPNEXT_API_KEY ?? "").trim();
  const apiSecret = (process.env.ERPNEXT_API_SECRET ?? "").trim();
  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error(
      "Missing ERPNext credentials. Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY, and ERPNEXT_API_SECRET in .env",
    );
  }
  return { baseUrl, apiKey, apiSecret };
}

function authHeaders(cfg) {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
  };
}

function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function erpFetch(cfg, method, path, body) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: authHeaders(cfg),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw };
  }
  if (!res.ok) {
    const detail =
      typeof json?.message === "string"
        ? json.message
        : typeof json?.exc === "string"
          ? json.exc
          : raw.slice(0, 500);
    throw new Error(`ERPNext ${method} ${path} [${res.status}]: ${detail}`);
  }
  return json?.data ?? json;
}

const filterSchema = z.union([
  z.string().describe("JSON-encoded filter array, e.g. [[\"company\",\"=\",\"Acme\"]]"),
  z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
]);

function parseFilters(filters) {
  if (filters === undefined) return undefined;
  if (Array.isArray(filters)) return filters;
  const parsed = JSON.parse(filters);
  if (!Array.isArray(parsed)) {
    throw new Error("filters must be a JSON array of filter tuples");
  }
  return parsed;
}

const server = new McpServer(
  { name: "erpnext", version: "1.0.0" },
  {
    instructions:
      "ERPNext MCP server for cosmo-os. Use erpnext_test_connection first. " +
      "Doctypes use spaces (e.g. 'Sales Invoice', 'Customer', 'Item'). " +
      "list_documents filters follow ERPNext format: [[field, operator, value], ...]. " +
      "Prefer read tools (get/list) before create or update.",
  },
);

server.registerTool(
  "erpnext_test_connection",
  {
    title: "Test ERPNext connection",
    description: "Verify ERPNext credentials and return the logged-in API user.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const cfg = getConfig();
      const user = await erpFetch(cfg, "GET", "/api/method/frappe.auth.get_logged_user");
      return textResult({
        ok: true,
        baseUrl: cfg.baseUrl,
        user,
      });
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "erpnext_get_document",
  {
    title: "Get ERPNext document",
    description: "Fetch a single document by doctype and name.",
    inputSchema: z.object({
      doctype: z.string().min(1).describe("ERPNext doctype, e.g. Sales Invoice"),
      name: z.string().min(1).describe("Document name / ID"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Optional field list; omit for full document"),
    }),
  },
  async ({ doctype, name, fields }) => {
    try {
      const cfg = getConfig();
      const encodedDoctype = encodeURIComponent(doctype);
      const encodedName = encodeURIComponent(name);
      const query =
        fields && fields.length > 0
          ? `?fields=${encodeURIComponent(JSON.stringify(fields))}`
          : "";
      const data = await erpFetch(
        cfg,
        "GET",
        `/api/resource/${encodedDoctype}/${encodedName}${query}`,
      );
      return textResult(data);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "erpnext_list_documents",
  {
    title: "List ERPNext documents",
    description: "List documents for a doctype with optional filters, fields, limit, and order.",
    inputSchema: z.object({
      doctype: z.string().min(1).describe("ERPNext doctype, e.g. Customer"),
      filters: filterSchema.optional().describe("ERPNext filter tuples"),
      fields: z.array(z.string()).optional().describe("Fields to return"),
      limit: z.number().int().min(1).max(500).optional().default(20),
      order_by: z.string().optional().describe("e.g. modified desc"),
    }),
  },
  async ({ doctype, filters, fields, limit, order_by }) => {
    try {
      const cfg = getConfig();
      const params = new URLSearchParams();
      if (filters !== undefined) {
        params.set("filters", JSON.stringify(parseFilters(filters)));
      }
      if (fields && fields.length > 0) {
        params.set("fields", JSON.stringify(fields));
      }
      params.set("limit_page_length", String(limit ?? 20));
      if (order_by) {
        params.set("order_by", order_by);
      }
      const encodedDoctype = encodeURIComponent(doctype);
      const data = await erpFetch(cfg, "GET", `/api/resource/${encodedDoctype}?${params}`);
      return textResult(data);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "erpnext_create_document",
  {
    title: "Create ERPNext document",
    description: "Create a new document in the given doctype.",
    inputSchema: z.object({
      doctype: z.string().min(1),
      data: z.record(z.string(), z.unknown()).describe("Document fields as key/value pairs"),
    }),
  },
  async ({ doctype, data }) => {
    try {
      const cfg = getConfig();
      const encodedDoctype = encodeURIComponent(doctype);
      const created = await erpFetch(cfg, "POST", `/api/resource/${encodedDoctype}`, data);
      return textResult(created);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "erpnext_update_document",
  {
    title: "Update ERPNext document",
    description: "Update fields on an existing document.",
    inputSchema: z.object({
      doctype: z.string().min(1),
      name: z.string().min(1),
      data: z.record(z.string(), z.unknown()).describe("Fields to update"),
    }),
  },
  async ({ doctype, name, data }) => {
    try {
      const cfg = getConfig();
      const encodedDoctype = encodeURIComponent(doctype);
      const encodedName = encodeURIComponent(name);
      const updated = await erpFetch(
        cfg,
        "PUT",
        `/api/resource/${encodedDoctype}/${encodedName}`,
        data,
      );
      return textResult(updated);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

server.registerTool(
  "erpnext_run_method",
  {
    title: "Run ERPNext method",
    description:
      "Call a Frappe/ERPNext whitelisted method, e.g. frappe.client.get_count or erpnext.stock.get_item_details.",
    inputSchema: z.object({
      method: z
        .string()
        .min(1)
        .describe("Method path without /api/method/ prefix"),
      args: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional keyword arguments passed as JSON body"),
    }),
  },
  async ({ method, args }) => {
    try {
      const cfg = getConfig();
      const path = `/api/method/${method.replace(/^\//, "")}`;
      const result = await erpFetch(cfg, "POST", path, args ?? {});
      return textResult(result);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[erpnext-mcp] Server running on stdio");
}

main().catch((err) => {
  console.error("[erpnext-mcp] Fatal error:", err);
  process.exit(1);
});
