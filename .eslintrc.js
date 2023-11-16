module.exports = {
  // This is required, or else ESLint will throw errors as it tries to parse TypeScript code as if it were regular JavaScript
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  root: true,
  plugins: ["@typescript-eslint", "unused-imports"], // Plugins allow you to use rules, but don't enforce anything
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked", // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    "plugin:prettier/recommended", // Enables eslint-plugin-prettier and eslint-config-prettier
  ],
  parserOptions: {
    project: "./tsconfig*.json",
    tsconfigRootDir: __dirname,
    ecmaVersion: "latest", // Allows for the parsing of modern ECMAScript features
    sourceType: "module", // Allows for the use of imports
  },
  ignorePatterns: ['/*.js', '/*.ts'],
  rules: {
    // Ignores unused vars when in the context of destructuring or names preceded with _
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "warn",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        ignoreRestSiblings: true,
        argsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-unsafe-assignment": "off",
    // Some style for comments
    "spaced-comment": [
      "warn",
      "always",
      {
        line: {
          markers: ["/"],
          exceptions: ["-", "+"],
        },
        block: {
          markers: ["!"],
          exceptions: ["*"],
          balanced: true,
        },
      },
    ],
    // Makes all prettier problems warnings instead of errors
    "prettier/prettier": "warn",
  },
  // File specific overrides
  overrides: [
    // Test files...
    {
      files: ["tests/*.test.ts"], // glob pattern for all test files
      rules: {
        "@typescript-eslint/no-explicit-any": 0,
      },
    },
  ],
};
