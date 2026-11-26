import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react": reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-empty-object-type": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // A raw number <input> shows "0434" when the user types after a 0, and one bound to a number turns an
      // emptied field back into 0. Every number field uses NumberInput (components/forms/NumberInput.tsx).
      "no-restricted-syntax": [
        "error",
        ...[
          "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value='number'])",
          "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'] JSXExpressionContainer > Literal[value='number'])",
        ].map((selector) => ({
          selector,
          message:
            "Use NumberInput from @/components/forms/NumberInput for number fields. A raw number input shows '0434' after a 0 and can turn an emptied field into 0.",
        })),
      ],
    },
  },
  {
    files: ["tests/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
