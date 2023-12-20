/** @typedef {import('ts-jest')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ["js", "json", "jsx", "ts", "d.ts", "tsx", "node"],
  testPathIgnorePatterns: ["dist/"],
  globals: {
    "ts-jest": {
      diagnostics: {
        // Do not fail on TS compilation errors
        // https://kulshekhar.github.io/ts-jest/user/config/diagnostics#do-not-fail-on-first-error
        warnOnly: true
      }
    }
  },
  setupFilesAfterEnv: ['./jest.setup.js'],
  setupFiles: ['dotenv/config'],
  testRegex: "./__tests__/.*.test.ts$",
  rootDir: "."
};

