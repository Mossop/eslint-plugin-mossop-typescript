# eslint-plugin-mossop-typescript

A rule for ESLint that logs type errors from TypeScript.

The chief motivation for this plugin is to remove a build step where compilation through `tsc` is not required. This could be because you're checking for types on pure JavaScript code already or because you're using [Babel to compile your TypeScript code](https://devblogs.microsoft.com/typescript/typescript-and-babel-7/).

Currently this should be considered experimental as I just knocked it together in a few hours. It may reduce ESLint's performance and not quite configure TypeScript correctly, I've seen a few oddities with module resolution.

It also outputs all TypeScript diagnostics. ESLint doesn't support a rule outputting at different levels and so if you have configured this rule for errors then even TypeScript suggestions will cause a build failure. I have plans to fix that.

## Usage

Install this module in your project and make sure that the `typescript` module is installed too. Then add to your ESLint configuration:
```
{
  "plugins": [
    "mossop-typescript"
  ],
  "rules":
    "mossop-typescript/check-types": "error"
  ]
}
```

It relies on a `tsconfig.json` to configure TypeScript and will use the closest one above the file being linted. Also this file must be valid JSON, no comments or trailing commas.
