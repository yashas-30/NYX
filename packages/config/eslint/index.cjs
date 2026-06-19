const js = require("@eslint/js");
const ts = require("typescript-eslint");
const prettier = require("eslint-plugin-prettier");
const prettierConfig = require("eslint-config-prettier");

module.exports = ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  prettierConfig,
  {
    plugins: { prettier },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-useless-escape": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "preserve-caught-error": "off",
      "no-undef": "off",
      "no-useless-assignment": "off"
    }
  },
  {
    plugins: {
      "react-hooks": {
        rules: {
          "exhaustive-deps": {
            create() { return {}; }
          }
        }
      }
    }
  }
);
