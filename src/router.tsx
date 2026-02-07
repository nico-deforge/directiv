import {
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";
import { RootLayout } from "./components/Layout/RootLayout";
import { HomePage } from "./pages/HomePage";
import { ConfigPage } from "./pages/ConfigPage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/config",
  component: ConfigPage,
});

const routeTree = rootRoute.addChildren([indexRoute, configRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
