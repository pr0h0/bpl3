/**
 * Test Helper: LSP Utilities
 *
 * Provides utilities for testing LSP-related functionality.
 * Note: For full LSP testing, use the vscode-ext test infrastructure.
 */

/**
 * Mock document interface for testing
 */
export interface MockDocument {
  uri: string;
  languageId: string;
  version: number;
  content: string;
  getText(): string;
  positionAt(offset: number): { line: number; character: number };
  offsetAt(position: { line: number; character: number }): number;
}

/**
 * Create a mock TextDocument for testing
 *
 * @param content - Document content
 * @param uri - Optional document URI
 * @param languageId - Optional language ID (default: "bpl")
 * @returns MockDocument instance
 *
 * @example
 * ```typescript
 * const doc = createTestDocument(`
 *   frame main() {
 *     return 0;
 *   }
 * `);
 * const position = doc.positionAt(10);
 * ```
 */
export function createTestDocument(
  content: string,
  uri = "file:///test/test.bpl",
  languageId = "bpl",
): MockDocument {
  const lines = content.split("\n");

  return {
    uri,
    languageId,
    version: 1,
    content,

    getText() {
      return content;
    },

    positionAt(offset: number) {
      let remaining = offset;
      for (let line = 0; line < lines.length; line++) {
        const lineLength = lines[line]!.length + 1; // +1 for newline
        if (remaining < lineLength) {
          return { line, character: remaining };
        }
        remaining -= lineLength;
      }
      // Past end of document
      return {
        line: lines.length - 1,
        character: lines[lines.length - 1]?.length ?? 0,
      };
    },

    offsetAt(position: { line: number; character: number }) {
      let offset = 0;
      for (let i = 0; i < position.line && i < lines.length; i++) {
        offset += lines[i]!.length + 1; // +1 for newline
      }
      return offset + position.character;
    },
  };
}

/**
 * Create a mock LSP connection for testing
 *
 * This is a minimal mock that can be extended as needed.
 */
export function createMockConnection() {
  const handlers: Record<string, Function> = {};
  const notifications: Array<{ method: string; params: unknown }> = [];

  return {
    // Register handlers
    onRequest: (method: string, handler: Function) => {
      handlers[method] = handler;
    },
    onNotification: (method: string, handler: Function) => {
      handlers[method] = handler;
    },

    // Send notifications (captured for testing)
    sendNotification: (method: string, params: unknown) => {
      notifications.push({ method, params });
    },

    // Test utilities
    getHandler: (method: string) => handlers[method],
    getNotifications: () => notifications,
    clearNotifications: () => {
      notifications.length = 0;
    },

    // Simulate incoming request
    simulateRequest: async (method: string, params: unknown) => {
      const handler = handlers[method];
      if (!handler) {
        throw new Error(`No handler registered for ${method}`);
      }
      return handler(params);
    },
  };
}

/**
 * Helper to get position in document from line:column notation
 *
 * @param doc - MockDocument
 * @param line - 0-based line number
 * @param character - 0-based character offset
 * @returns Position object
 */
export function getPosition(
  _doc: MockDocument,
  line: number,
  character: number,
) {
  return { line, character };
}

/**
 * Helper to find the position of a string in document content
 *
 * @param doc - MockDocument
 * @param searchString - String to find
 * @param occurrence - Which occurrence (1-based, default: 1)
 * @returns Position or null if not found
 */
export function findStringPosition(
  doc: MockDocument,
  searchString: string,
  occurrence = 1,
): { line: number; character: number } | null {
  const lines = doc.content.split("\n");
  let count = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let startIndex = 0;

    while (true) {
      const index = line.indexOf(searchString, startIndex);
      if (index === -1) break;

      count++;
      if (count === occurrence) {
        return { line: lineNum, character: index };
      }

      startIndex = index + 1;
    }
  }

  return null;
}
