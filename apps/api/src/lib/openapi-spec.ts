/**
 * OpenAPI 3.1 specification for the amigo API
 * This is a static specification that documents the existing API routes
 */
export const openAPISpec = {
  openapi: "3.1.0",
  info: {
    title: "amigo API",
    version: "1.0.0",
    description:
      "API for the amigo household management application. Provides endpoints for groceries sync, transactions, and health checks.",
    contact: {
      name: "amigo",
      url: "https://amigo.cadenalabs.net",
    },
  },
  servers: [
    {
      url: "https://amigo.cadenalabs.net",
      description: "Production",
    },
    {
      url: "https://dev-amigo.cadenalabs.net",
      description: "Development",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "Health check endpoints for monitoring service status",
    },
    {
      name: "Groceries",
      description:
        "Grocery list management with delta sync support for real-time updates",
    },
    {
      name: "Transactions",
      description: "Financial transaction management with pagination and filtering",
    },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Check the health status of the API and its dependencies (PostgreSQL and Valkey/Redis). Returns latency metrics for each service.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "All services are healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  timestamp: "2026-01-09T12:00:00.000Z",
                  services: {
                    postgres: { status: "ok", latencyMs: 5 },
                    valkey: { status: "ok", latencyMs: 2 },
                  },
                },
              },
            },
          },
          "503": {
            description: "One or more services are unhealthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "error",
                  timestamp: "2026-01-09T12:00:00.000Z",
                  services: {
                    postgres: { status: "error", error: "Connection refused" },
                    valkey: { status: "ok", latencyMs: 2 },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/groceries": {
      get: {
        tags: ["Groceries"],
        summary: "Get grocery items",
        description:
          "Fetch grocery items for the authenticated user's household. Supports delta sync by providing a lastSync timestamp to only fetch items updated after that time. For initial sync, omit the lastSync parameter to get all active items. Delta sync includes soft-deleted items so clients can remove them from local state.",
        operationId: "getGroceries",
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: "lastSync",
            in: "query",
            required: false,
            description:
              "Unix timestamp (milliseconds) of the last sync. If provided, only items updated after this time are returned (delta sync). If omitted, returns all active items (initial sync).",
            schema: {
              type: "integer",
              format: "int64",
              example: 1736424000000,
            },
          },
        ],
        responses: {
          "200": {
            description: "Grocery items retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GroceriesResponse" },
                example: {
                  data: [
                    {
                      id: "550e8400-e29b-41d4-a716-446655440000",
                      householdId: "660e8400-e29b-41d4-a716-446655440001",
                      createdByUserId: "770e8400-e29b-41d4-a716-446655440002",
                      itemName: "Milk",
                      category: "Dairy",
                      isPurchased: false,
                      purchasedAt: null,
                      createdAt: "2026-01-09T10:00:00.000Z",
                      updatedAt: "2026-01-09T10:00:00.000Z",
                      deletedAt: null,
                    },
                  ],
                  syncTimestamp: 1736424000000,
                  isDelta: false,
                },
              },
            },
          },
          "401": {
            description: "Unauthorized - missing or invalid session cookie",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Unauthorized" },
              },
            },
          },
        },
      },
    },
    "/api/transactions": {
      get: {
        tags: ["Transactions"],
        summary: "Get transactions",
        description:
          "Fetch paginated transactions for the authenticated user. Returns transactions the user owns or transactions linked to shared budgets (where budget.userId is NULL). Results are ordered by date descending. Maximum limit is 100 items per page.",
        operationId: "getTransactions",
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number (1-indexed). Defaults to 1.",
            schema: {
              type: "integer",
              minimum: 1,
              default: 1,
              example: 1,
            },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Number of items per page. Maximum 100. Defaults to 20.",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
              example: 20,
            },
          },
          {
            name: "category",
            in: "query",
            required: false,
            description: "Filter transactions by category.",
            schema: {
              type: "string",
              example: "Food",
            },
          },
        ],
        responses: {
          "200": {
            description: "Transactions retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TransactionsResponse" },
                example: {
                  data: [
                    {
                      id: "550e8400-e29b-41d4-a716-446655440000",
                      householdId: "660e8400-e29b-41d4-a716-446655440001",
                      userId: "770e8400-e29b-41d4-a716-446655440002",
                      budgetId: "880e8400-e29b-41d4-a716-446655440003",
                      budgetName: "Groceries Budget",
                      amount: "49.99",
                      currency: "USD",
                      exchangeRateToHome: "1.0",
                      category: "Food",
                      description: "Weekly groceries",
                      type: "expense",
                      date: "2026-01-09",
                      createdAt: "2026-01-09T10:00:00.000Z",
                      updatedAt: "2026-01-09T10:00:00.000Z",
                      deletedAt: null,
                    },
                  ],
                  pagination: {
                    page: 1,
                    limit: 20,
                    hasMore: false,
                  },
                },
              },
            },
          },
          "400": {
            description:
              "Invalid request parameters (e.g., limit > 100, invalid page number)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    details: { type: "object" },
                  },
                },
                example: {
                  error: "Validation error",
                  details: {
                    formErrors: [],
                    fieldErrors: { limit: ["Number must be less than or equal to 100"] },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized - missing or invalid session cookie",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Unauthorized" },
              },
            },
          },
        },
      },
    },
    "/ws": {
      get: {
        tags: ["WebSocket"],
        summary: "WebSocket connection",
        description:
          "Establish a WebSocket connection for real-time updates. Requires authentication via session cookie. The server broadcasts updates when grocery items or other household data changes. Clients should implement ping/pong keepalive (send `{\"type\":\"ping\"}` to receive `{\"type\":\"pong\"}`).",
        operationId: "websocket",
        security: [{ cookieAuth: [] }],
        responses: {
          "101": {
            description: "WebSocket upgrade successful",
          },
          "401": {
            description: "Unauthorized - missing or invalid session cookie",
          },
          "500": {
            description: "WebSocket upgrade failed",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "amigo_session",
        description:
          "Session cookie for authentication. Set automatically after login via the web application.",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "string",
            description: "Error message",
            example: "Unauthorized",
          },
        },
      },
      ServiceStatus: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["ok", "error"],
            description: "Service health status",
          },
          latencyMs: {
            type: "integer",
            description: "Latency in milliseconds (only present when status is ok)",
            example: 5,
          },
          error: {
            type: "string",
            description: "Error message (only present when status is error)",
          },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["status", "timestamp", "services"],
        properties: {
          status: {
            type: "string",
            enum: ["ok", "error"],
            description:
              "Overall health status. Error if any service is unhealthy.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "ISO 8601 timestamp of the health check",
          },
          services: {
            type: "object",
            properties: {
              postgres: { $ref: "#/components/schemas/ServiceStatus" },
              valkey: { $ref: "#/components/schemas/ServiceStatus" },
            },
          },
        },
      },
      GroceryItem: {
        type: "object",
        required: [
          "id",
          "householdId",
          "createdByUserId",
          "itemName",
          "isPurchased",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier",
          },
          householdId: {
            type: "string",
            format: "uuid",
            description: "Household this item belongs to",
          },
          createdByUserId: {
            type: "string",
            format: "uuid",
            description: "User who created this item",
          },
          itemName: {
            type: "string",
            description: "Name of the grocery item",
            example: "Milk",
          },
          category: {
            type: "string",
            nullable: true,
            description: "Category for organizing items",
            example: "Dairy",
          },
          isPurchased: {
            type: "boolean",
            description: "Whether the item has been purchased",
          },
          purchasedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Timestamp when item was marked as purchased",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "Last update timestamp (used for delta sync)",
          },
          deletedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Soft delete timestamp (null if not deleted)",
          },
        },
      },
      GroceriesResponse: {
        type: "object",
        required: ["data", "syncTimestamp", "isDelta"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/GroceryItem" },
            description: "Array of grocery items",
          },
          syncTimestamp: {
            type: "integer",
            format: "int64",
            description:
              "Unix timestamp (milliseconds) to use for the next delta sync request",
          },
          isDelta: {
            type: "boolean",
            description:
              "True if this is a delta sync response (may include deleted items)",
          },
        },
      },
      Transaction: {
        type: "object",
        required: [
          "id",
          "householdId",
          "userId",
          "amount",
          "currency",
          "category",
          "type",
          "date",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Unique identifier",
          },
          householdId: {
            type: "string",
            format: "uuid",
            description: "Household this transaction belongs to",
          },
          userId: {
            type: "string",
            format: "uuid",
            description: "User who owns this transaction",
          },
          budgetId: {
            type: "string",
            format: "uuid",
            nullable: true,
            description: "Associated budget (expenses only)",
          },
          budgetName: {
            type: "string",
            nullable: true,
            description: "Name of the associated budget (joined from budgets table)",
          },
          amount: {
            type: "string",
            description: "Transaction amount as decimal string",
            example: "49.99",
          },
          currency: {
            type: "string",
            description: "ISO 4217 currency code",
            example: "USD",
          },
          exchangeRateToHome: {
            type: "string",
            nullable: true,
            description: "Exchange rate to home currency (if different)",
          },
          category: {
            type: "string",
            description: "Transaction category",
            example: "Food",
          },
          description: {
            type: "string",
            nullable: true,
            description: "Optional description",
          },
          type: {
            type: "string",
            enum: ["expense", "income"],
            description: "Transaction type",
          },
          date: {
            type: "string",
            format: "date",
            description: "Transaction date (YYYY-MM-DD)",
            example: "2026-01-09",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "Last update timestamp",
          },
          deletedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Soft delete timestamp",
          },
        },
      },
      Pagination: {
        type: "object",
        required: ["page", "limit", "hasMore"],
        properties: {
          page: {
            type: "integer",
            description: "Current page number",
            example: 1,
          },
          limit: {
            type: "integer",
            description: "Items per page",
            example: 20,
          },
          hasMore: {
            type: "boolean",
            description:
              "True if more pages exist (when returned items equals limit)",
          },
        },
      },
      TransactionsResponse: {
        type: "object",
        required: ["data", "pagination"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Transaction" },
            description: "Array of transactions",
          },
          pagination: {
            $ref: "#/components/schemas/Pagination",
          },
        },
      },
    },
  },
};
