import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("setup", "routes/setup.tsx"),
  route("no-access", "routes/no-access.tsx"),
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
