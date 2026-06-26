import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return redirect("/dashboard");
}

export default function CalendarRedirect() {
  return null;
}
