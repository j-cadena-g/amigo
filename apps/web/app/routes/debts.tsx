import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return redirect("/financial/debts");
}

export default function DebtsRedirect() {
  return null;
}
