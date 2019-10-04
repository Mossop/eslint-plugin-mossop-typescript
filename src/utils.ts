import path from "path";
import fs from "fs";

import { CompilerOptions, JsxEmit, ModuleKind, ModuleResolutionKind, NewLineKind, ScriptTarget } from "typescript";
import { JsonDecoder, Result, Ok, ok, err } from "ts.data.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decode<A>(decoder: JsonDecoder.Decoder<A>, data: any): A {
  let result = decoder.decode(data);
  if (result instanceof Ok) {
    return result.value;
  }
  throw new Error(result.error);
}

function OptionalDecoder<A>(decoder: JsonDecoder.Decoder<A>, name: string): JsonDecoder.Decoder<undefined | A> {
  return JsonDecoder.oneOf([JsonDecoder.isNull(undefined), JsonDecoder.isUndefined(undefined), decoder], `${name}?`);
}

function MapDecoder<A, B>(decoder: JsonDecoder.Decoder<A>, mapper: (data: A) => B, name: string): JsonDecoder.Decoder<B> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new JsonDecoder.Decoder<B>((json: any): Result<B> => {
    let result = decoder.decode(json);
    if (result instanceof Ok) {
      try {
        return ok<B>(mapper(result.value));
      } catch (e) {
        return err<B>(`Error decoding ${name}: ${e}`);
      }
    } else {
      return err<B>(result.error);
    }
  });
}

function PathDecoder(root: string, name: string): JsonDecoder.Decoder<string> {
  return MapDecoder(JsonDecoder.string, (str: string): string => {
    return path.resolve(root, str);
  }, name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConvertDecoder<A>(cast: (json: any) => A, name: string): JsonDecoder.Decoder<A> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new JsonDecoder.Decoder<A>((json: any): Result<A> => {
    try {
      return ok<A>(cast(json));
    } catch (e) {
      return err<A>(`Error parsing ${name}: ${e}`);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JsxEmitDecoder = ConvertDecoder<JsxEmit>((json: any) => {
  if (typeof json == "string") {
    for (let key of Object.keys(JsxEmit)) {
      if (key.toLowerCase() == json.toLowerCase()) {
        return JsxEmit[key];
      }
    }

    throw new Error(`'${json}' is not a valid option`);
  }
  throw new Error(`Type of '${json}' was not a string`);
}, "JsxEmit");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ModuleKindDecoder = ConvertDecoder<ModuleKind>((json: any) => {
  if (typeof json == "string") {
    for (let key of Object.keys(ModuleKind)) {
      if (key.toLowerCase() == json.toLowerCase()) {
        return ModuleKind[key];
      }
    }

    throw new Error(`'${json}' is not a valid option`);
  }
  throw new Error(`Type of '${json}' was not a string`);
}, "ModuleKind");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ModuleResolutionKindDecoder = ConvertDecoder<ModuleResolutionKind>((json: any) => {
  if (typeof json == "string") {
    let check = json.toLowerCase();
    if (check == "node") {
      check = "nodejs";
    }

    for (let key of Object.keys(ModuleResolutionKind)) {
      if (key.toLowerCase() == check) {
        return ModuleResolutionKind[key];
      }
    }

    throw new Error(`'${json}' is not a valid option`);
  }
  throw new Error(`Type of '${json}' was not a string`);
}, "ModuleResolutionKind");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NewLineKindDecoder = ConvertDecoder<NewLineKind>((json: any) => {
  if (typeof json == "string") {
    for (let key of Object.keys(NewLineKind)) {
      if (key.toLowerCase() == json.toLowerCase()) {
        return NewLineKind[key];
      }
    }

    throw new Error(`'${json}' is not a valid option`);
  }
  throw new Error(`Type of '${json}' was not a string`);
}, "NewLineKind");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ScriptTargetDecoder = ConvertDecoder<ScriptTarget>((json: any) => {
  if (typeof json == "string") {
    for (let key of Object.keys(ScriptTarget)) {
      if (key.toLowerCase() == json.toLowerCase()) {
        return ScriptTarget[key];
      }
    }

    throw new Error(`'${json}' is not a valid option`);
  }
  throw new Error(`Type of '${json}' was not a string`);
}, "ScriptTarget");

function CompilerOptionsDecoder(root: string): JsonDecoder.Decoder<CompilerOptions> {
  return JsonDecoder.object<CompilerOptions>(
    {
      allowJs: OptionalDecoder(JsonDecoder.boolean, "allowJs?"),
      allowSyntheticDefaultImports: OptionalDecoder(JsonDecoder.boolean, "allowSyntheticDefaultImports?"),
      allowUmdGlobalAccess: OptionalDecoder(JsonDecoder.boolean, "allowUmdGlobalAccess?"),
      allowUnreachableCode: OptionalDecoder(JsonDecoder.boolean, "allowUnreachableCode?"),
      allowUnusedLabels: OptionalDecoder(JsonDecoder.boolean, "allowUnusedLabels?"),
      alwaysStrict: OptionalDecoder(JsonDecoder.boolean, "alwaysStrict?"),
      baseUrl: OptionalDecoder(JsonDecoder.string, "baseUrl?"),
      charset: OptionalDecoder(JsonDecoder.string, "charset?"),
      checkJs: OptionalDecoder(JsonDecoder.boolean, "checkJs?"),
      declaration: OptionalDecoder(JsonDecoder.boolean, "declaration?"),
      declarationMap: OptionalDecoder(JsonDecoder.boolean, "declarationMap?"),
      emitDeclarationOnly: OptionalDecoder(JsonDecoder.boolean, "emitDeclarationOnly?"),
      declarationDir: OptionalDecoder(PathDecoder(root, "declarationDir"), "declarationDir?"),
      disableSizeLimit: OptionalDecoder(JsonDecoder.boolean, "disableSizeLimit?"),
      downlevelIteration: OptionalDecoder(JsonDecoder.boolean, "downlevelIteration?"),
      emitBOM: OptionalDecoder(JsonDecoder.boolean, "emitBOM?"),
      emitDecoratorMetadata: OptionalDecoder(JsonDecoder.boolean, "emitDecoratorMetadata?"),
      experimentalDecorators: OptionalDecoder(JsonDecoder.boolean, "experimentalDecorators?"),
      forceConsistentCasingInFileNames: OptionalDecoder(JsonDecoder.boolean, "forceConsistentCasingInFileNames?"),
      importHelpers: OptionalDecoder(JsonDecoder.boolean, "importHelpers?"),
      inlineSourceMap: OptionalDecoder(JsonDecoder.boolean, "inlineSourceMap?"),
      inlineSources: OptionalDecoder(JsonDecoder.boolean, "inlineSources?"),
      isolatedModules: OptionalDecoder(JsonDecoder.boolean, "isolatedModules?"),
      jsx: OptionalDecoder(JsxEmitDecoder, "JsxEmit?"),
      keyofStringsOnly: OptionalDecoder(JsonDecoder.boolean, "keyofStringsOnly?"),
      lib: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "lib[]"), "lib[]?"),
      locale: OptionalDecoder(JsonDecoder.string, "locale?"),
      mapRoot: OptionalDecoder(PathDecoder(root, "mapRoot"), "mapRoot?"),
      maxNodeModuleJsDepth: OptionalDecoder(JsonDecoder.number, "maxNodeModuleJsDepth?"),
      module: OptionalDecoder(ModuleKindDecoder, "ModuleKind?"),
      moduleResolution: OptionalDecoder(ModuleResolutionKindDecoder, "ModuleResolutionKind?"),
      newLine: OptionalDecoder(NewLineKindDecoder, "NewLine?"),
      noEmit: OptionalDecoder(JsonDecoder.boolean, "noEmit?"),
      noEmitHelpers: OptionalDecoder(JsonDecoder.boolean, "noEmitHelpers?"),
      noEmitOnError: OptionalDecoder(JsonDecoder.boolean, "noEmitOnError?"),
      noErrorTruncation: OptionalDecoder(JsonDecoder.boolean, "noErrorTruncation?"),
      noFallthroughCasesInSwitch: OptionalDecoder(JsonDecoder.boolean, "noFallthroughCasesInSwitch?"),
      noImplicitAny: OptionalDecoder(JsonDecoder.boolean, "noImplicitAny?"),
      noImplicitReturns: OptionalDecoder(JsonDecoder.boolean, "noImplicitReturns?"),
      noImplicitThis: OptionalDecoder(JsonDecoder.boolean, "noImplicitThis?"),
      noStrictGenericChecks: OptionalDecoder(JsonDecoder.boolean, "noStrictGenericChecks?"),
      noUnusedLocals: OptionalDecoder(JsonDecoder.boolean, "noUnusedLocals?"),
      noUnusedParameters: OptionalDecoder(JsonDecoder.boolean, "noUnusedParameters?"),
      noImplicitUseStrict: OptionalDecoder(JsonDecoder.boolean, "noImplicitUseStrict?"),
      noLib: OptionalDecoder(JsonDecoder.boolean, "noLib?"),
      noResolve: OptionalDecoder(JsonDecoder.boolean, "noResolve?"),
      out: OptionalDecoder(PathDecoder(root, "out"), "out?"),
      outDir: OptionalDecoder(PathDecoder(root, "outDir"), "outDir?"),
      outFile: OptionalDecoder(PathDecoder(root, "outFile"), "outFile?"),
      paths: OptionalDecoder(JsonDecoder.dictionary(JsonDecoder.array(JsonDecoder.string, "string"), "string[]"), "Map<string, string[]>?"),
      preserveConstEnums: OptionalDecoder(JsonDecoder.boolean, "preserveConstEnums?"),
      preserveSymlinks: OptionalDecoder(JsonDecoder.boolean, "preserveSymlinks?"),
      project: OptionalDecoder(PathDecoder(root, "project"), "project?"),
      reactNamespace: OptionalDecoder(JsonDecoder.string, "reactNamespace?"),
      jsxFactory: OptionalDecoder(JsonDecoder.string, "jsxFactory?"),
      composite: OptionalDecoder(JsonDecoder.boolean, "composite?"),
      incremental: OptionalDecoder(JsonDecoder.boolean, "incremental?"),
      tsBuildInfoFile: OptionalDecoder(PathDecoder(root, "tsBuildInfoFile"), "tsBuildInfoFile?"),
      removeComments: OptionalDecoder(JsonDecoder.boolean, "removeComments?"),
      rootDir: OptionalDecoder(PathDecoder(root, "rootDir"), "rootDir?"),
      rootDirs: OptionalDecoder(JsonDecoder.array(PathDecoder(root, "rootDirs"), "rootDir[]"), "rootDirs[]?"),
      skipLibCheck: OptionalDecoder(JsonDecoder.boolean, "skipLibCheck?"),
      skipDefaultLibCheck: OptionalDecoder(JsonDecoder.boolean, "skipDefaultLibCheck?"),
      sourceMap: OptionalDecoder(JsonDecoder.boolean, "sourceMap?"),
      sourceRoot: OptionalDecoder(JsonDecoder.string, "sourceRoot?"),
      strict: OptionalDecoder(JsonDecoder.boolean, "strict?"),
      strictFunctionTypes: OptionalDecoder(JsonDecoder.boolean, "strictFunctionTypes?"),
      strictBindCallApply: OptionalDecoder(JsonDecoder.boolean, "strictBindCallApply?"),
      strictNullChecks: OptionalDecoder(JsonDecoder.boolean, "strictNullChecks?"),
      strictPropertyInitialization: OptionalDecoder(JsonDecoder.boolean, "strictPropertyInitialization?"),
      stripInternal: OptionalDecoder(JsonDecoder.boolean, "stripInternal?"),
      suppressExcessPropertyErrors: OptionalDecoder(JsonDecoder.boolean, "suppressExcessPropertyErrors?"),
      suppressImplicitAnyIndexErrors: OptionalDecoder(JsonDecoder.boolean, "suppressImplicitAnyIndexErrors?"),
      target: OptionalDecoder(ScriptTargetDecoder, "ScriptTarget?"),
      traceResolution: OptionalDecoder(JsonDecoder.boolean, "traceResolution?"),
      resolveJsonModule: OptionalDecoder(JsonDecoder.boolean, "resolveJsonModule?"),
      types: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "types[]"), "types[]?"),
      /** Paths used to compute primary types search locations */
      typeRoots: OptionalDecoder(JsonDecoder.array(PathDecoder(root, "typeRoot"), "typeRoots[]"), "typeRoots[]?"),
      esModuleInterop: OptionalDecoder(JsonDecoder.boolean, "esModuleInterop?"),
    },
    "CompilerOptions"
  );
}

export interface Config {
  compilerOptions: CompilerOptions;
  files?: string[];
  include?: string[];
  exclude?: string[];
}

function ConfigDecoder(root: string): JsonDecoder.Decoder<Config> {
  return JsonDecoder.object<Config>(
    {
      compilerOptions: CompilerOptionsDecoder(root),
      files: OptionalDecoder(JsonDecoder.array(PathDecoder(root, "file"), "string[]"), "files[]?"),
      include: OptionalDecoder(JsonDecoder.array(PathDecoder(root, "include"), "string[]"), "include[]?"),
      exclude: OptionalDecoder(JsonDecoder.array(PathDecoder(root, "exclude"), "string[]"), "exclude[]?"),
    },
    "Config"
  );
}

export function decodeConfig(configFile: string): Config {
  let root = path.dirname(configFile);
  let config = decode(ConfigDecoder(root), JSON.parse(fs.readFileSync(configFile, { encoding: "utf8" })));

  if (!config.exclude) {
    config.exclude = [
      path.join(root, "node_modules"),
      path.join(root, "bower_components"),
      path.join(root, "jspm_packages"),
    ];

    if (config.compilerOptions.outDir) {
      config.exclude.push(config.compilerOptions.outDir);
    }
  }

  return config;
}

interface PackageInfo {
  index?: string;
  typings?: string;
}

function PackageInfoDecoder(root: string): JsonDecoder.Decoder<PackageInfo> {
  return JsonDecoder.object<PackageInfo>(
    {
      index: OptionalDecoder(PathDecoder(root, "index"), "index?"),
      typings: OptionalDecoder(PathDecoder(root, "typings"), "typings?"),
    },
    "PackageInfo"
  );
}

export function loadPackage(directory: string): PackageInfo | null {
  let decoder = PackageInfoDecoder(directory);
  try {
    return decode(decoder, JSON.parse(fs.readFileSync(path.join(directory, "package.json"), { encoding: "utf8" })));
  } catch (e) {
    return null;
  }
}
