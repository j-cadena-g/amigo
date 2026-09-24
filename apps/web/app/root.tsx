import { ClerkProvider } from "@clerk/react-router";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import type { Route } from "./+types/root";
import "./app.css";
import { getCspNonce } from "@/app/lib/session.server";
import { appContextMiddleware } from "@/server/middleware/app-context";
import { ToastProvider } from "@/app/components/toast-provider";

export const middleware: Route.MiddlewareFunction[] = [
  clerkMiddleware(),
  appContextMiddleware,
];

export const loader = (args: Route.LoaderArgs) =>
  rootAuthLoader(args, () => ({
    cspNonce: getCspNonce(args.context) ?? "",
  }));

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData("root") as { cspNonce?: string } | undefined;
  const cspNonce = rootData?.cspNonce || undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#161615"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="icon" href="/icon-1024.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links nonce={cspNonce} />
      </head>
      <body className="font-sans antialiased">
        <script
          nonce={cspNonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("amigo-theme")||"system";var d=t==="system"?window.matchMedia("(prefers-color-scheme:dark)").matches:t==="dark";if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
        {children}
        <ScrollRestoration nonce={cspNonce} />
        <Scripts nonce={cspNonce} />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="type-display mb-2 text-title">{message}</h1>
        <p className="text-muted-foreground">{details}</p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
        {stack && (
          <pre className="mt-6 w-full p-4 overflow-x-auto rounded-xl bg-secondary text-left text-xs">
            <code className="font-mono">{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
