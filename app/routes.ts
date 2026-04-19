import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("setup", "routes/setup.tsx"),
  route("no-access", "routes/no-access.tsx"),
  route("api/health", "routes/api.health.ts"),
  route("api/setup", "routes/api.setup.ts"),
  route("api/groceries", "routes/api.groceries.ts", { id: "api-groceries" }),
  route("api/groceries/*", "routes/api.groceries.ts", {
    id: "api-groceries-splat",
  }),
  route("api/tags", "routes/api.tags.ts", { id: "api-tags" }),
  route("api/tags/*", "routes/api.tags.ts", { id: "api-tags-splat" }),
  route("api/transactions", "routes/api.transactions.ts", {
    id: "api-transactions",
  }),
  route("api/transactions/*", "routes/api.transactions.ts", {
    id: "api-transactions-splat",
  }),
  route("api/budgets", "routes/api.budgets.ts", { id: "api-budgets" }),
  route("api/budgets/*", "routes/api.budgets.ts", { id: "api-budgets-splat" }),
  route("api/recurring", "routes/api.recurring.ts", { id: "api-recurring" }),
  route("api/recurring/*", "routes/api.recurring.ts", {
    id: "api-recurring-splat",
  }),
  route("api/assets", "routes/api.assets.ts", { id: "api-assets" }),
  route("api/assets/*", "routes/api.assets.ts", { id: "api-assets-splat" }),
  route("api/debts", "routes/api.debts.ts", { id: "api-debts" }),
  route("api/debts/*", "routes/api.debts.ts", { id: "api-debts-splat" }),
  route("api/members", "routes/api.members.ts", { id: "api-members" }),
  route("api/members/*", "routes/api.members.ts", { id: "api-members-splat" }),
  route("api/settings", "routes/api.settings.ts"),
  route("api/sync", "routes/api.sync.ts"),
  route("api/calendar", "routes/api.calendar.ts"),
  route("api/restore", "routes/api.restore.ts", { id: "api-restore" }),
  route("api/restore/*", "routes/api.restore.ts", { id: "api-restore-splat" }),
  route("api/audit/*", "routes/api.audit.ts"),
  // Authenticated routes with app shell layout
  layout("routes/_app.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("groceries", "routes/groceries.tsx"),
    route("budget", "routes/budget.tsx", [
      index("routes/budget.transactions.tsx"),
      route("budgets", "routes/budget.budgets.tsx"),
      route("recurring", "routes/budget.recurring.tsx"),
    ]),
    route("debts", "routes/debts.tsx"),
    route("assets", "routes/assets.tsx"),
    route("calendar", "routes/calendar.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
  route("restore-account", "routes/restore-account.tsx"),
] satisfies RouteConfig;
