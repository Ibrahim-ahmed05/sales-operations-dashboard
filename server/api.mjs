import { authenticate, login, logout, one, all } from "./db.mjs";
import * as m from "./metrics.mjs";
const cache = new Map(),
  attempts = new Map();
const response = (body, status = 200, headers = {}) =>
  new Response(
    JSON.stringify({
      ...body,
      generatedAt: body.generatedAt || new Date().toISOString(),
      recordCount: body.recordCount ?? 0,
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...headers,
      },
    },
  );
export async function handleApi(request) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/")) return null;
  try {
    if (request.method !== "GET" && request.headers.get("origin") !== url.origin)
      return response({ error: "Request origin is not allowed" }, 403);
    if (path === "/api/auth/login" && request.method === "POST") {
      if (Number(request.headers.get("content-length") || 0) > 4096)
        return response({ error: "Request too large" }, 413);
      const body = await request.json();
      if (
        typeof body.email !== "string" ||
        typeof body.password !== "string" ||
        body.password.length > 512
      )
        return response({ error: "Invalid credentials" }, 400);
      const key = body.email.toLowerCase(),
        a = attempts.get(key);
      if (a && a.count >= 5 && a.until > Date.now())
        return response({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      const token = login(body.email, body.password);
      if (!token) {
        attempts.set(key, {
          count: (a?.until > Date.now() ? a.count : 0) + 1,
          until: Date.now() + 900000,
        });
        return response({ error: "Email or password is incorrect." }, 401);
      }
      attempts.delete(key);
      return response({ ok: true }, 200, {
        "set-cookie": `meridian_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    const authenticatedUser = authenticate(request);
    if (path === "/api/auth/session") return response({ user: authenticatedUser });
    // The dashboard is intentionally open for the local demo. Authenticated
    // sessions still work for deployments that want to enforce the PDF's role
    // matrix, while the demo uses Manager-level aggregate access by default.
    const user = authenticatedUser || {
      id: 0,
      email: "demo@meridian.local",
      name: "Demo User",
      role: "Manager",
    };
    if (path === "/api/auth/logout" && request.method === "POST") {
      logout(request);
      return response({ ok: true }, 200, {
        "set-cookie": "meridian_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    }
    if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
    const aggregatePaths = [
      "/api/dashboard/kpis/sales",
      "/api/dashboard/trends/sales",
      "/api/dashboard/kpis/orders",
      "/api/dashboard/kpis/inventory/counts",
      "/api/dashboard/inventory/lowstock",
      "/api/dashboard/context",
    ];
    if (user.role === "Viewer" && !aggregatePaths.includes(path))
      return response({ error: "Your Viewer role does not have access to this information." }, 403);
    const range = m.parseRange(url);
    if (path === "/api/dashboard/context")
      return response({
        role: user.role,
        today: m.today(),
        sourceLastOrderDate: m.metadata("sourceLastOrderDate"),
        sourceFirstOrderDate: one("SELECT MIN(order_date) d FROM orders").d,
        inventoryUpdatedAt: m.metadata("inventoryUpdatedAt"),
        currency: "PKR",
        ...(user.role === "Admin" ? { importSummary: m.metadata("importReport") } : {}),
      });
    const key = user.role + "|" + path + "|" + url.search;
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return response(hit.body);
    let body;
    if (path === "/api/dashboard/kpis/sales") body = m.sales(range);
    else if (path === "/api/dashboard/trends/sales")
      body = m.salesTrend(range, url.searchParams.get("granularity") || "month");
    else if (path === "/api/dashboard/kpis/orders") body = m.orders(range);
    else if (path === "/api/dashboard/kpis/inventory/counts") body = m.inventoryCounts(range);
    else if (path === "/api/dashboard/kpis/inventory/value") body = m.inventoryValue();
    else if (path === "/api/dashboard/kpis/receivables") body = m.receivables(range);
    else if (path === "/api/dashboard/receivables/aging") body = m.aging();
    else if (path === "/api/dashboard/kpis/operational") body = m.operational(range);
    else if (
      path === "/api/dashboard/rankings/products" ||
      path === "/api/dashboard/rankings/customers"
    ) {
      const limit = Number(url.searchParams.get("limit") || 5);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("Limit must be 1–100");
      body = m.rankings(range, path.endsWith("products") ? "products" : "customers", limit);
    } else if (path === "/api/dashboard/rankings/segments") body = m.segments(range);
    else if (path === "/api/dashboard/inventory/lowstock")
      body = m.details(range, "lowstock", url.searchParams);
    else if (path === "/api/dashboard/orders")
      body = m.details(range, "all-orders", url.searchParams);
    else if (path === "/api/dashboard/details") {
      const kind = url.searchParams.get("kind") || "sales";
      const allowed = [
        "sales",
        "sales-growth",
        "sales-previous",
        "pending",
        "delivered",
        "cancelled",
        "returned",
        "fulfillment",
        "all-orders",
        "inventory",
        "lowstock",
        "outofstock",
        "movements",
        "outstanding",
        "overdue",
        "paid",
        "invoices",
        "products",
        "customers",
        "repeat",
        "turnover",
      ];
      if (!allowed.includes(kind) && !/^(product|customer):[A-Za-z0-9-]+$/.test(kind))
        throw Error("Unknown drill-down");
      body = m.details(range, kind, url.searchParams);
      if (kind === "turnover") body.basis = m.operational(range).basis;
    } else if (/^\/api\/dashboard\/orders\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/").at(-1));
      const order = one(
        "SELECT o.*,c.name customer FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?",
        id,
      );
      if (!order) return response({ error: "Order not found" }, 404);
      body = {
        recordCount: 1,
        order,
        lines: all(
          "SELECT l.*,p.name product FROM lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=?",
          id,
        ),
      };
    } else if (/^\/api\/dashboard\/receivables\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/").at(-1));
      const invoice = one(
        "SELECT r.*,c.name customer FROM receivables r JOIN customers c ON c.id=r.customer_id WHERE r.id=?",
        id,
      );
      if (!invoice) return response({ error: "Invoice not found" }, 404);
      body = {
        recordCount: 1,
        invoice,
        payments: all("SELECT * FROM payments WHERE invoice_id=?", id),
      };
    } else return response({ error: "Endpoint not found" }, 404);
    body = { ...body, range, asOf: m.today(), generatedAt: new Date().toISOString() };
    if (!path.includes("/details") && !path.endsWith("/orders")) {
      if (cache.size > 300) cache.clear();
      cache.set(key, { body, until: Date.now() + 60000 });
    }
    return response(body);
  } catch (error) {
    console.error("Dashboard API:", error.message);
    return response({ error: "Unable to process request: " + error.message }, 400);
  }
}
