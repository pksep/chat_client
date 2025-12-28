import { reactive } from 'vue';
import type { IUserProps } from '../components/interfaces/interfaces';

export interface Route {
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface NavigationOptions {
  replace?: boolean;
  state?: any;
}

export interface CustomRouterState {
  currentRoute: Route;
  previousRoute: Route | null;
}

export type RouteHandler = () => void;
export type DynamicRouteHandler = (params?: Record<string, string>) => void;

class CustomRouter {
  private state = reactive<CustomRouterState>({
    currentRoute: { path: '/', params: {}, query: {} },
    previousRoute: null
  });

  private listeners: Array<(to: Route, from: Route | null) => void> = [];
  private routes: Map<string, RouteHandler> = new Map();
  private dynamicRoutes: Array<{
    pattern: RegExp;
    handler: DynamicRouteHandler;
    pathTemplate: string;
  }> = [];

  constructor() {
    // Initialize from current URL
    this.parseCurrentRoute();

    // Listen for browser back/forward events
    window.addEventListener('popstate', () => {
      this.parseCurrentRoute();
      this.notifyListeners();
      this.executeRouteHandler();
    });
  }

  private parseCurrentRoute(): void {
    const url = new URL(window.location.href);
    let path = url.pathname;

    // Ensure path always starts with '/' and normalize it
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Extract params and query from the URL
    const params: Record<string, string> = {};
    const query: Record<string, string> = {};

    // Extract query parameters
    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }

    this.state.previousRoute = { ...this.state.currentRoute };
    this.state.currentRoute = { path, params, query };
  }

  private updateUrl(route: Route, options?: NavigationOptions): void {
    const url = new URL(window.location.origin + route.path);

    // Add query parameters
    if (route.query) {
      for (const [key, value] of Object.entries(route.query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }

    if (options?.replace) {
      window.history.replaceState(
        options?.state || {},
        document.title,
        url.toString()
      );
    } else {
      window.history.pushState(
        options?.state || {},
        document.title,
        url.toString()
      );
    }
  }

  public navigate(path: string, options?: NavigationOptions): void {
    // Normalize the path to ensure it starts with '/'
    let normalizedPath = path;
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    const route: Route = {
      path: normalizedPath,
      params: {},
      query: this.parseQueryFromPath(normalizedPath)
    };

    this.state.previousRoute = { ...this.state.currentRoute };
    this.state.currentRoute = route;

    this.updateUrl(route, options);
    this.notifyListeners();
    this.executeRouteHandler();
  }

  private parseQueryFromPath(path: string): Record<string, string> {
    const url = new URL(path, window.location.origin);
    const query: Record<string, string> = {};

    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }

    return query;
  }

  public back(): void {
    window.history.back();
  }

  public forward(): void {
    window.history.forward();
  }

  public getCurrentRoute(): Route {
    return { ...this.state.currentRoute };
  }

  public getPreviousRoute(): Route | null {
    return this.state.previousRoute ? { ...this.state.previousRoute } : null;
  }

  public watchRoute(
    callback: (to: Route, from: Route | null) => void
  ): () => void {
    this.listeners.push(callback);

    // Call callback immediately with current route
    callback(this.state.currentRoute, this.state.previousRoute);

    // Return unwatch function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state.currentRoute, this.state.previousRoute);
    }
  }

  public navigateToChapter(
    chapter: string | null,
    contact: IUserProps | null = null
  ): void {
    if (!chapter) {
      this.navigate('/');
      return;
    }

    // Handle special views
    if (['ai', 'assistant', 'channels', 'dialogs'].includes(chapter)) {
      this.navigate(`/${chapter}`);
      return;
    }

    // For other chapters, navigate based on contact type
    if (contact?.groupId) {
      this.navigate(`/group/${contact.groupId}`);
    } else if (contact?.id) {
      this.navigate(`/contact/${contact.id}`);
    } else {
      this.navigate(`/${chapter}`);
    }
  }

  public getChapterFromRoute(): string | null {
    const pathParts = this.state.currentRoute.path
      .split('/')
      .filter(part => part);
    return pathParts.length > 0 ? pathParts[0] : null;
  }

  public getContactIdFromRoute(): string | null {
    const pathParts = this.state.currentRoute.path
      .split('/')
      .filter(part => part);
    if (pathParts.length > 1) {
      return pathParts[1];
    }
    return null;
  }

  // Register a static route
  public registerRoute(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler);
  }

  // Register a dynamic route with parameters (e.g., /contact/:id)
  public registerDynamicRoute(
    pathTemplate: string,
    handler: DynamicRouteHandler
  ): void {
    // Convert path template to regex
    // Replace :paramName with ([^/]+) to capture any characters except /
    const regexPattern = pathTemplate.replace(/:[^/]+/g, '([^/]+)'); // Replace :paramName with capture group

    const pattern = new RegExp(`^${regexPattern}$`);

    this.dynamicRoutes.push({
      pattern,
      handler,
      pathTemplate
    });
  }

  // Execute the appropriate route handler based on the current route
  private executeRouteHandler(): void {
    const currentPath = this.state.currentRoute.path;

    // Check for exact match first
    if (this.routes.has(currentPath)) {
      const handler = this.routes.get(currentPath);
      if (handler) {
        handler();
        return;
      }
    }

    // Check for dynamic route matches
    for (const { pattern, handler, pathTemplate } of this.dynamicRoutes) {
      const match = currentPath.match(pattern);

      if (match) {
        // Extract parameter names from the path template
        const paramNames = pathTemplate.match(/:[^/]+/g) || [];

        // Create params object from matched values
        const params: Record<string, string> = {};
        for (let i = 0; i < paramNames.length && i < match.length - 1; i++) {
          const paramName = paramNames[i].substring(1); // Remove the ':' prefix
          params[paramName] = match[i + 1]; // First capture group is at index 1
        }

        handler(params);
        return;
      }
    }

    // If no route matches, execute the root handler if it exists
    if (this.routes.has('/')) {
      const handler = this.routes.get('/');
      if (handler) {
        handler();
      }
    }
  }
}

export const customRouter = new CustomRouter();
