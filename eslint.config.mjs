import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Local-time `Date` getters read the *server's* timezone, which is never what this
 * app means. Every calendar question here is a question about Asia/Dhaka, and the
 * only module allowed to answer it is src/lib/due-cycle.ts, which does the offset
 * arithmetic explicitly. Banning the getters everywhere else keeps a stray
 * `.getMonth()` from silently reintroducing an off-by-one that unit tests on a
 * UTC machine would never catch.
 */
const LOCAL_TIME_GETTERS =
  "getDate|getMonth|getFullYear|getHours|getMinutes|getSeconds|getDay";

const dateDiscipline = {
  "no-restricted-syntax": [
    "error",
    {
      selector: `CallExpression > MemberExpression[property.name=/^(${LOCAL_TIME_GETTERS})$/]`,
      message:
        "Local-time Date getters depend on the server timezone. Use the helpers in src/lib/due-cycle.ts (instantToDhakaCivil, dbDateToCivil) instead.",
    },
    {
      selector: 'NewExpression[callee.name="Date"] > Literal[value=/^\\d{4}-\\d{2}/]',
      message:
        "new Date('YYYY-MM-DD') parses as UTC midnight and shifts the day in most timezones. Use parseCivilDate() from src/lib/due-cycle.ts.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "prisma/**/*.ts", "scripts/**/*.ts"],
    rules: dateDiscipline,
  },
  {
    // The one module that is *supposed* to do raw date arithmetic.
    files: ["src/lib/due-cycle.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    /**
     * The calendars are the boundary where a date-picker library's local-time
     * Dates meet the app's CivilDate and DueMonth. They build those Dates
     * themselves at local noon and read them back with the matching local
     * getters, so each pair is internally consistent. Routing them through the
     * Dhaka helpers would be wrong: these widgets pick a calendar day or a
     * month, not an instant.
     */
    files: [
      "src/components/shared/month-picker.tsx",
      "src/components/shared/date-picker.tsx",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Underscore-prefixed names mark values deliberately discarded, such as a
    // prop being swallowed so it cannot reach the DOM.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
