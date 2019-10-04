import path from "path";
import fs from "fs";
import {
  NewLineKind, LanguageService, LanguageServiceHost, Diagnostic,
  IScriptSnapshot, TextChangeRange, DiagnosticWithLocation, CompilerOptions,
  ResolvedProjectReference, ResolvedModule, ResolvedModuleFull, getDefaultLibFileName,
  createLanguageService, Extension, flattenDiagnosticMessageText, DiagnosticCategory } from "typescript";
import { Rule } from "eslint";
import { Node } from "estree";
import globby from "globby";

import { Config, decodeConfig, loadPackage } from "./utils";

const diagnosticsMap = new Map<string, Diagnostic[] | undefined>();
const projectMap = new Map<string, ESLintProject | undefined>();

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

function findIncludedFiles(config: Config, root: string): string[] {
  let allowedExtensions: Extension[] = [
    Extension.Ts,
    Extension.Tsx,
    Extension.Dts,
  ];

  if (config.compilerOptions.allowJs) {
    allowedExtensions.push(Extension.Js);
    allowedExtensions.push(Extension.Jsx);
  }

  let extensionGlobs = allowedExtensions.map((ext: Extension) => "*" + ext);

  let files: string[];
  if (config.include) {
    let include: string[] = [];
    for (let glob of config.include) {
      if (glob.endsWith("*") || glob.endsWith(".*")) {
        if (glob.endsWith(".*")) {
          glob = glob.substr(0, glob.length - 2);
        } else {
          glob = glob.substr(0, glob.length - 1);
        }

        for (let extension of extensionGlobs) {
          include.push(glob + extension);
        }
      } else {
        include.push(glob);
      }
    }

    files = globby.sync(include, {
      ignore: config.exclude,
      cwd: root,
      onlyFiles: true,
      unique: true,
      expandDirectories: extensionGlobs,
    });
  } else if (!config.files) {
    files = globby.sync(extensionGlobs.map((glob: string) => "**/" + glob), {
      ignore: config.exclude,
      cwd: root,
      onlyFiles: true,
      unique: true,
    });
  } else {
    files = [];
  }

  if (config.files) {
    for (let file of config.files) {
      if (!files.includes(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

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

function getExtensionFromFileName(name: string): Extension | undefined {
  for (let key of Object.keys(Extension)) {
    if (!name.startsWith(".")) {
      continue;
    }

    if (name.endsWith(key)) {
      return Extension[Extension[key]];
    }
  }

  return undefined;
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
      extension: getExtensionFromFileName(pkg.typings) || Extension.Dts,
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
      extension: getExtensionFromFileName(pkg.typings) || Extension.Dts,
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
      extension: getExtensionFromFileName(pkg.index) || Extension.Js,
    };
  }

  return findAny(index, JS_EXTENSIONS, isGlobal);
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

interface ESLintProject {
  host: ESLintServiceHost;
  language: LanguageService;
}

class ESLintServiceHost implements LanguageServiceHost {
  private config: Config;
  public snapshots: Map<string, ScriptSnapshot>;
  private modulePaths: string[];
  private moduleCache: Map<string, ResolvedModuleFull | undefined>;
  private files: string[];

  public constructor(projectRoot: string, config: Config) {
    this.config = config;
    this.snapshots = new Map();
    this.moduleCache = new Map();
    this.files = findIncludedFiles(config, projectRoot);

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
    return this.files;
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

  private moduleLookup(directory: string, name: string, options: CompilerOptions, globals: string[]): ResolvedModuleFull | undefined {
    if (name.startsWith(".")) {
      // Simple relative case.
      let target = path.resolve(directory, name);

      if (this.moduleCache.has(target)) {
        return this.moduleCache.get(target);
      }

      let result = findModule(path.dirname(target), path.basename(target));
      this.moduleCache.set(target, result);
      return result;
    }

    if (this.moduleCache.has(name)) {
      return this.moduleCache.get(name);
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
        this.moduleCache.set(name, found);
        return found;
      }
    }

    this.moduleCache.set(name, undefined);
    return undefined;
  }

  public resolveModuleNames(moduleNames: string[], containingFile: string, _reusedNames: string[] | undefined, _redirectedReference: ResolvedProjectReference | undefined, options: CompilerOptions): (ResolvedModule | undefined)[] {
    let directory = path.dirname(containingFile);
    return moduleNames.map((name: string) => {
      return this.moduleLookup(directory, name, options, this.modulePaths);
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

function getProject(context: Rule.RuleContext, node: Node): ESLintProject | undefined {
  let filename = context.getFilename();

  let configFile = findAbove(path.dirname(filename), "tsconfig.json");
  if (!configFile) {
    // Not in a typescript project.
    return undefined;
  }

  if (projectMap.has(configFile)) {
    return projectMap.get(configFile);
  }

  let config: Config;
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
    return undefined;
  }

  let host = new ESLintServiceHost(path.dirname(configFile), config);
  let language = createLanguageService(host);

  let project: ESLintProject = {
    host,
    language,
  };

  projectMap.set(configFile, project);
  return project;
}

function isDiagnosticWithLocation(diagnostic: Diagnostic): diagnostic is DiagnosticWithLocation {
  if (diagnostic.file && diagnostic.start && diagnostic.length) {
    return true;
  }
  return false;
}

function reportDiagnostic(context: Rule.RuleContext, node: Node, diagnostic: Diagnostic): void {
  let category = "";
  switch (diagnostic.category) {
    case DiagnosticCategory.Warning: {
      category = "warning";
      break;
    }
    case DiagnosticCategory.Error: {
      category = "error";
      break;
    }
    case DiagnosticCategory.Suggestion: {
      category = "suggestion";
      break;
    }
    case DiagnosticCategory.Message: {
      category = "message";
      break;
    }
  }

  let data = {
    category,
    code: String(diagnostic.code),
    text: flattenDiagnosticMessageText(diagnostic.messageText, "\n", 2),
  };

  if (isDiagnosticWithLocation(diagnostic)) {
    let start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    let end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);

    context.report({
      messageId: "tserror",
      loc: {
        start: {
          line: start.line + 1,
          column: start.character,
        },
        end: {
          line: end.line + 1,
          column: end.character,
        }
      },
      data,
    });
  } else {
    context.report({
      node,
      messageId: "tserror",
      data,
    });
  }
}

function checkTypes(context: Rule.RuleContext, node: Node): void {
  if (!diagnosticsMap.has(context.getFilename())) {
    let project = getProject(context, node);
    if (!project) {
      // No TypeScript project found.
      diagnosticsMap.set(context.getFilename(), undefined);
      return;
    }

    if (!project.host.getScriptFileNames().includes(context.getFilename())) {
      // Not part of the TypeScript project.
      diagnosticsMap.set(context.getFilename(), undefined);
      return;
    }

    let diags = project.language.getSemanticDiagnostics(context.getFilename())
      .concat(
        project.language.getSyntacticDiagnostics(context.getFilename()),
        project.language.getSuggestionDiagnostics(context.getFilename())
      );

    diagnosticsMap.set(context.getFilename(), diags);
  }

  let diagnostics = diagnosticsMap.get(context.getFilename());
  if (diagnostics) {
    for (let diag of diagnostics) {
      reportDiagnostic(context, node, diag);
    }
  }
}

const rules: Rule.RuleModule = {
  meta: {
    type: "problem",
    messages: {
      tserror: "{{ text }} ts({{ code }}) {{ category }}"
    }
  },
  create: function(context: Rule.RuleContext): Rule.RuleListener {
    // declare the state of the rule
    return {
      Program: (node: Node): void => checkTypes(context, node),
    };
  }
};

export default rules;
