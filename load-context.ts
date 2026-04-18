import { createRouterLoadContext } from "./router-context";
import type { GetLoadContext } from "./react-router-worker";

export const getLoadContext: GetLoadContext = ({ context }) =>
  createRouterLoadContext(context);
