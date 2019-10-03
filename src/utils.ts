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

const CompilerOptionsDecoder = JsonDecoder.object<CompilerOptions>(
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
    declarationDir: OptionalDecoder(JsonDecoder.string, "declarationDir?"),
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
    lib: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "lib[]?"),
    locale: OptionalDecoder(JsonDecoder.string, "locale?"),
    mapRoot: OptionalDecoder(JsonDecoder.string, "mapRoot?"),
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
    out: OptionalDecoder(JsonDecoder.string, "out?"),
    outDir: OptionalDecoder(JsonDecoder.string, "outDir?"),
    outFile: OptionalDecoder(JsonDecoder.string, "outFile?"),
    paths: OptionalDecoder(JsonDecoder.dictionary(JsonDecoder.array(JsonDecoder.string, "string"), "string[]"), "Map<string, string[]>?"),
    preserveConstEnums: OptionalDecoder(JsonDecoder.boolean, "preserveConstEnums?"),
    preserveSymlinks: OptionalDecoder(JsonDecoder.boolean, "preserveSymlinks?"),
    project: OptionalDecoder(JsonDecoder.string, "project?"),
    reactNamespace: OptionalDecoder(JsonDecoder.string, "reactNamespace?"),
    jsxFactory: OptionalDecoder(JsonDecoder.string, "jsxFactory?"),
    composite: OptionalDecoder(JsonDecoder.boolean, "composite?"),
    incremental: OptionalDecoder(JsonDecoder.boolean, "incremental?"),
    tsBuildInfoFile: OptionalDecoder(JsonDecoder.string, "tsBuildInfoFile?"),
    removeComments: OptionalDecoder(JsonDecoder.boolean, "removeComments?"),
    rootDir: OptionalDecoder(JsonDecoder.string, "rootDir?"),
    rootDirs: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "rootDirs[]?"),
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
    types: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "types[]?"),
    /** Paths used to compute primary types search locations */
    typeRoots: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "typeRoots[]?"),
    esModuleInterop: OptionalDecoder(JsonDecoder.boolean, "esModuleInterop?"),
  },
  "CompilerOptions"
);

export interface Config {
  compilerOptions: CompilerOptions;
  files?: string[];
  include?: string[];
  exclude?: string[];
}

const ConfigDecoder = JsonDecoder.object<Config>(
  {
    compilerOptions: CompilerOptionsDecoder,
    files: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "files[]?"),
    include: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "include[]?"),
    exclude: OptionalDecoder(JsonDecoder.array(JsonDecoder.string, "string[]"), "exclude[]?"),
  },
  "Config"
);

export function decodeConfig(str: string): Config {
  return decode(ConfigDecoder, JSON.parse(str));
}
