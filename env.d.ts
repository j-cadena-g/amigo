import "react-router";
import type { Cloudflare } from "./router-context";
import type { AppSession, SessionStatus } from "./server/env";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: Cloudflare;
    app: {
      cspNonce: string;
      sessionStatus: SessionStatus;
      session?: AppSession;
    };
  }
}
