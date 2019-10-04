# eslint-plugin-mossop-typescript

A rule for ESLint that logs type errors from TypeScript.

The chief motivation for this plugin is to remove a build step where compilation through `tsc` is not required. This could be because you're checking for types on pure JavaScript code already or because you're using [Babel to compile your TypeScript code](https://devblogs.microsoft.com/typescript/typescript-and-babel-7/).

Currently this should be considered experimental. It may reduce ESLint's performance and not quite configure TypeScript correctly, I've seen a few oddities with module resolution.

## Provided rules

All of these rules cache the results of running TypeScript over each file. That means turning on multiple rules costs about as much time as just turning on one.

### check-types

Reports all diagnostic errors from TypeScript.

### type-errors, type-warnings, type-messages, type-suggestions

Reports diagnostics from TypeScript filtered to just the given category.

## Usage

Install this module in your project and make sure that the `typescript` module is installed too. Then add to your ESLint configuration:
```
{
  "plugins": [
    "mossop-typescript"
  ],
  "rules":
    "mossop-typescript/type-errors": "error",
    "mossop-typescript/type-warnings": "warning"
  ]
}
```

It relies on a `tsconfig.json` to configure TypeScript and will use the closest one above the file being linted. Also this file must be valid JSON, no comments or trailing commas.
