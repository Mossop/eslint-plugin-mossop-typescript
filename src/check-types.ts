import path from "path";
import fs from "fs";
import {
  NewLineKind, LanguageService, LanguageServiceHost, Diagnostic,
  IScriptSnapshot, TextChangeRange, DiagnosticWithLocation, CompilerOptions,
  ResolvedProjectReference, ResolvedModule, ResolvedModuleFull, getDefaultLibFileName,
  createLanguageService, Extension } from "typescript";
import { Rule } from "eslint";
import { Node } from "estree";

import { Config, decodeConfig, loadPackage } from "./utils";

const languageServiceMap = new Map<string, LanguageService>();

const TS_EXTENSIONS = [
  Extension.Ts,
  Extension.Tsx,
  Extension.Dts,
];

const JS_EXTENSIONS = [
  Extension.Js,
  Extension.Jsx,
  Extension.Json,
];

function isFile(name?: string): boolean {
  if (!name) {
    return false;
  }

  try {
    return fs.statSync(name).isFile();
  } catch (e) {
    return false;
  }
}

function findAny(target: string, extensions: Extension[], isGlobal: boolean): ResolvedModuleFull | undefined {
  for (let extension of extensions) {
    if (isFile(target + extension)) {
      return {
        resolvedFileName: target + extension,
        isExternalLibraryImport: isGlobal,
        extension,
      };
    }
  }

  return undefined;
}

function getExtensionFromFileName(name: string, guess: Extension): Extension {
  for (let key of Object.keys(Extension)) {
    if (name.endsWith(key)) {
      return Extension[key];
    }
  }

  return guess;
}

// Special lookup for a types package. Only find definitions or a package.json
// with typings.
function findTypes(target: string): ResolvedModuleFull | undefined {
  if (isFile(target + ".d.ts")) {
    return {
      resolvedFileName: target + ".d.ts",
      isExternalLibraryImport: true,
      extension: Extension.Dts,
    };
  }

  let pkg = loadPackage(target);
  if (pkg && pkg.typings && isFile(pkg.typings)) {
    return {
      resolvedFileName: pkg.typings,
      isExternalLibraryImport: true,
      extension: getExtensionFromFileName(pkg.typings, Extension.Dts),
    };
  }

  if (isFile(path.join(target, "index.d.ts"))) {
    return {
      resolvedFileName: path.join(target, "index.d.ts"),
      isExternalLibraryImport: true,
      extension: Extension.Dts,
    };
  }

  return undefined;
}

function findModule(directory: string, name: string, typeRoots?: string[]): ResolvedModuleFull | undefined {
  let target = path.join(directory, name);
  let isGlobal = !!typeRoots;

  // Look for types first.
  let found = findAny(target, TS_EXTENSIONS, isGlobal);
  if (found) {
    return found;
  }

  let pkg = loadPackage(target);
  if (pkg && pkg.typings && isFile(pkg.typings)) {
    return {
      resolvedFileName: pkg.typings,
      isExternalLibraryImport: isGlobal,
      extension: getExtensionFromFileName(pkg.typings, Extension.Dts),
    };
  }

  // Typing packages?
  if (typeRoots) {
    for (let dir of typeRoots) {
      let typesPackage = path.join(dir, name);
      let found = findTypes(typesPackage);
      if (found) {
        return found;
      }
    }
  }

  let index = path.join(target, "index");
  found = findAny(index, TS_EXTENSIONS, isGlobal);
  if (found) {
    return found;
  }

  // No types. Try looking for js modules then.
  found = findAny(target, JS_EXTENSIONS, isGlobal);
  if (found) {
    return found;
  }

  if (pkg && pkg.index && isFile(pkg.index)) {
    return {
      resolvedFileName: pkg.index,
      isExternalLibraryImport: isGlobal,
      extension: getExtensionFromFileName(pkg.index, Extension.Js),
    };
  }

  return findAny(index, JS_EXTENSIONS, isGlobal);
}

function moduleLookup(directory: string, name: string, options: CompilerOptions, globals: string[]): ResolvedModuleFull | undefined {
  if (name.startsWith(".")) {
    // Simple relative case.
    let target = path.resolve(directory, name);
    return findModule(path.dirname(target), path.basename(target));
  }

  let checkTypesPackages = !options.types || options.types.includes(name);

  // Now look through the global directories.
  for (let global of globals) {
    let typePackages: string[] = [];
    if (checkTypesPackages) {
      typePackages = options.typeRoots || [path.join(global, "@types")];
    }

    let found = findModule(global, name, typePackages);
    if (found) {
      return found;
    }
  }

  return undefined;
}

class ScriptSnapshot implements IScriptSnapshot {
  private script: null | string;
  private host: ESLintServiceHost;
  private filename: string;

  public constructor(host: ESLintServiceHost, filename: string) {
    this.script = null;
    this.host = host;
    this.filename = filename;
  }

  private getContent(): string {
    if (this.script) {
      return this.script;
    }

    this.script = fs.readFileSync(this.filename, { encoding: "utf8" });
    return this.script;
  }

  /** Gets a portion of the script snapshot specified by [start, end). */
  public getText(start: number, end: number): string {
    return this.getContent().substr(start, end - start);
  }

  /** Gets the length of this script snapshot. */
  public getLength(): number {
    return this.getContent().length;
  }

  /**
   * Gets the TextChangeRange that describe how the text changed between this text and
   * an older version.  This information is used by the incremental parser to determine
   * what sections of the script need to be re-parsed.  'undefined' can be returned if the
   * change range cannot be determined.  However, in that case, incremental parsing will
   * not happen and the entire document will be re - parsed.
   */
  public getChangeRange(): TextChangeRange | undefined {
    return undefined;
  }

  /** Releases all resources held by this script snapshot */
  public dispose(): void {
    this.script = null;
    this.host.snapshots.delete(this.filename);
  }
}

function* parents(directory: string): Generator<string> {
  let parent = path.dirname(directory);
  while (parent != directory) {
    yield directory;
    directory = parent;
    parent = path.dirname(directory);
  }
  yield directory;
}

class ESLintServiceHost implements LanguageServiceHost {
  private config: Config;
  public snapshots: Map<string, ScriptSnapshot>;
  //private scripts: null | string[];
  private modulePaths: string[];
  private rootFile: string;

  public constructor(projectRoot: string, config: Config, rootFile: string) {
    this.config = config;
    this.snapshots = new Map();
    this.rootFile = rootFile;

    // This gives us the lookup path for this plugin. Need to strip off the
    // parent directories of this file to get the system lookup directories.
    let paths: string[] = require.resolve.paths(__filename) || [];
    // This gives us the global paths.
    let globalPaths = paths.slice(Array.from(parents(path.dirname(__filename))).length);

    // Now we add on the parents of the project.
    let projectPaths: string[] = [];
    for (let directory of parents(projectRoot)) {
      projectPaths.push(path.join(directory, "node_modules"));
    }

    this.modulePaths = projectPaths.concat(globalPaths);
  }

  public getCompilationSettings(): CompilerOptions {
    return this.config.compilerOptions;
  }

  public getNewLine(): string {
    if (this.config.compilerOptions.newLine == NewLineKind.CarriageReturnLineFeed) {
      return "\r\n";
    }
    return "\n";
  }

  public log(s: string): void {
    console.log(s);
  }

  public trace(s: string): void {
    console.trace(s);
  }

  public error(s: string): void {
    console.error(s);
  }

  public getScriptFileNames(): string[] {
    return [this.rootFile];
  }

  public getScriptVersion(): string {
    return "1";
  }

  public getScriptSnapshot(fileName: string): IScriptSnapshot | undefined {
    if (!this.snapshots.has(fileName)) {
      this.snapshots.set(fileName, new ScriptSnapshot(this, fileName));
    }
    return this.snapshots.get(fileName);
  }

  public getCurrentDirectory(): string {
    return process.cwd();
  }

  public getDefaultLibFileName(options: CompilerOptions): string {
    let name = getDefaultLibFileName(options);
    let module = require.resolve("typescript");
    return path.join(path.dirname(module), name);
  }

  public resolveModuleNames(moduleNames: string[], containingFile: string, _reusedNames: string[] | undefined, _redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions): (ResolvedModule | undefined)[] {
    let directory = path.dirname(containingFile);
    return moduleNames.map((name: string) => {
      return moduleLookup(directory, name, options, this.modulePaths);
    });
  }
}

function findAbove(directory: string, filename: string): string | null {
  for (let current of parents(directory)) {
    if (isFile(path.join(current, filename))) {
      return path.join(current, filename);
    }
  }

  return null;
}

function getLanguageService(context: Rule.RuleContext, node: Node): LanguageService | null {
  let filename = context.getFilename();

  let configFile = findAbove(path.dirname(filename), "tsconfig.json");
  if (!configFile) {
    context.report({
      message: "Could not find tsconfig.json.",
      node,
    });
    return null;
  }

  let languageService = languageServiceMap.get(configFile);
  if (languageService) {
    return languageService;
  }

  let config;
  try {
    config = decodeConfig(configFile);
  } catch (error) {
    context.report({
      message: "Could not parse tsconfig.json: {{ error }}",
      node,
      data: {
        error,
      }
    });
    return null;
  }

  let host = new ESLintServiceHost(path.dirname(configFile), config, filename);
  languageService = createLanguageService(host);
  languageServiceMap.set(configFile, languageService);
  return languageService;
}

function isDiagnosticWithLocation(diagnostic: Diagnostic): diagnostic is DiagnosticWithLocation {
  if (diagnostic.file && diagnostic.start && diagnostic.length) {
    return true;
  }
  return false;
}

function reportDiagnostic(context: Rule.RuleContext, node: Node, diagnostic: Diagnostic): void {
  let message: string;

  if (typeof diagnostic.messageText == "object") {
    message = `TS${diagnostic.messageText.code}: ${diagnostic.messageText.messageText}`;
  } else {
    message = `TS${diagnostic.code}: ${diagnostic.messageText}`;
  }

  if (isDiagnosticWithLocation(diagnostic)) {
    let start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    let end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);

    context.report({
      message,
      loc: {
        start: {
          line: start.line + 1,
          column: start.character,
        },
        end: {
          line: end.line + 1,
          column: end.character,
        }
      }
    });
  } else {
    context.report({
      node,
      message,
    });
  }
}

function checkTypes(context: Rule.RuleContext, node: Node): void {
  let languageService = getLanguageService(context, node);
  if (!languageService) {
    return;
  }

  let diags: Diagnostic[] = languageService.getSyntacticDiagnostics(context.getFilename());
  for (let diag of diags) {
    reportDiagnostic(context, node, diag);
  }

  diags = languageService.getSemanticDiagnostics(context.getFilename());
  for (let diag of diags) {
    reportDiagnostic(context, node, diag);
  }

  diags = languageService.getSuggestionDiagnostics(context.getFilename());
  for (let diag of diags) {
    reportDiagnostic(context, node, diag);
  }
}

const rules: Rule.RuleModule = {
  meta: {
    type: "problem",
  },
  create: function(context: Rule.RuleContext): Rule.RuleListener {
    // declare the state of the rule
    return {
      Program: (node: Node): void => checkTypes(context, node),
    };
  }
};

export default rules;
