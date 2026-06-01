import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { initServiceWorkerRegistration } from "@/app/lib/pwa/register-sw";

initServiceWorkerRegistration();
hydrateRoot(document, <HydratedRouter />);
