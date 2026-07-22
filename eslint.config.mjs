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
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
