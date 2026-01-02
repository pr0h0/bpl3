import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    ignores: [
      "node_modules/**",
      "bpl_modules/**",
      "grammar/**",
      "tests/**",
      "playground/**",
      "benchmark/**",
      "fuzz/**",
      "*.js",
      "*.mjs",
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // TypeScript-specific rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off", // Too many legitimate uses in compiler/AST code
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off", // Pervasive in compiler code, would require major refactoring

      // General code quality
      "no-console": "off", // CLI tool needs console
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-unused-expressions": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],

      // Complexity rules - relaxed for compiler code
      complexity: "off", // Compiler functions are naturally complex, disable for now
      "max-depth": ["warn", { max: 8 }], // Compiler needs deep nesting for AST traversal
      "max-lines-per-function": "off", // TODO: Re-enable after splitting large functions
      "max-params": ["error", { max: 6 }], // Limit function parameters
      "max-lines": "off", // TODO: Re-enable after splitting large files

      // Additional strict rules
      "no-var": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error", // Variable shadowing fixed
      "@typescript-eslint/consistent-type-assertions": [
        "warn",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
      ],
      "no-nested-ternary": "error", // No nested ternaries for readability
      "no-else-return": "error", // Early returns preferred
      "no-lonely-if": "error", // Combine with parent if
      "no-unneeded-ternary": "error",
    },
  },
];
