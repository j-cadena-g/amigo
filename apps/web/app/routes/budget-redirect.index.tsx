import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/financial${url.search}`);
}

export default function BudgetTransactionsRedirect() {
  return null;
}
