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
import { buttonVariants } from "@/app/components/ui/button";

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
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
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

/** Clerk reads these through its own CSS variables, so sign-in follows the theme. */
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-primary)",
    colorPrimaryForeground: "var(--color-primary-foreground)",
    colorBackground: "var(--color-card)",
    colorForeground: "var(--color-foreground)",
    colorMuted: "var(--color-muted)",
    colorMutedForeground: "var(--color-muted-foreground)",
    colorNeutral: "var(--color-foreground)",
    colorInput: "var(--color-background)",
    colorInputForeground: "var(--color-foreground)",
    colorBorder: "var(--color-border)",
    colorRing: "var(--color-ring)",
    colorDanger: "var(--color-destructive)",
    colorSuccess: "var(--color-success)",
    colorWarning: "var(--color-warning)",
    colorModalBackdrop: "rgb(0 0 0 / 0.5)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontFamilyMono: "var(--font-mono)",
    fontSize: "0.9375rem",
    borderRadius: "0.375rem",
  },
  elements: {
    cardBox: { boxShadow: "none", border: "1px solid var(--color-border)" },
    logoBox: { display: "none" },
  },
};

const clerkLocalization = {
  signIn: {
    start: { subtitle: "Use the email you signed up with." },
  },
};

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider
      loaderData={loaderData}
      appearance={clerkAppearance}
      localization={clerkLocalization}
    >
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "This page didn't load";
  let details = "Reload the page to try again.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      message = "Page not found";
      details = "This page doesn't exist or has moved.";
    } else if (error.statusText) {
      details = `${error.statusText}. Reload the page to try again.`;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <h1 className="type-display text-title-sm md:text-title">{message}</h1>
        <p className="mt-2 text-muted-foreground">{details}</p>
        <div className="mt-6">
          <Link to="/dashboard" className={buttonVariants()}>
            Go to Home
          </Link>
        </div>
        {stack && (
          <pre className="mt-6 w-full overflow-x-auto rounded-xl bg-secondary p-4 text-left text-xs">
            <code className="font-mono">{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
