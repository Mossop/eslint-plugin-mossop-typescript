import path from "path";
import fs from "fs";
import {
  NewLineKind, Extension, LanguageService, LanguageServiceHost, Diagnostic,
  IScriptSnapshot, TextChangeRange, DiagnosticWithLocation, CompilerOptions,
  ResolvedModuleWithFailedLookupLocations, getDefaultLibFileName,
  createLanguageService } from "typescript";
import { Rule } from "eslint";
import { Node } from "estree";

import { Config, decodeConfig } from "./utils";

const languageServiceMap = new Map<string, LanguageService>();

const TS_SCRIPTS = [
  ".ts",
  ".tsx",
  ".d.ts",
];

const DEFINITIONS = [
  ".d.ts",
];

const JS_SCRIPTS = [
  ".js",
  ".jsx",
];

const SCRIPTS = TS_SCRIPTS.concat(DEFINITIONS, JS_SCRIPTS);

function exists(name: string): boolean {
  try {
    return fs.statSync(name).isFile();
  } catch (e) {
    return false;
  }
}

function findAllScripts(directory: string, scriptNames: string[]): void {
  let entries = fs.readdirSync(directory, { withFileTypes: true });
  for (let entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.name == "node_modules") {
      continue;
    }

    let full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      findAllScripts(full, scriptNames);
    } else if (entry.isFile() && SCRIPTS.includes(path.extname(entry.name))) {
      scriptNames.push(full);
    }
  }
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
  private projectRoot: string;
  private config: Config;
  public snapshots: Map<string, ScriptSnapshot>;
  private scripts: null | string[];
  private modulePaths: string[];

  public constructor(projectRoot: string, config: Config) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.snapshots = new Map();
    this.scripts = null;

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
    console.log(`Global lookup paths: ${this.modulePaths}`);
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

  public getScriptFileNames(): string[] {
    if (this.scripts == null) {
      this.scripts = [];
      // ICK
      findAllScripts(this.projectRoot, this.scripts);
    }

    return this.scripts;
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

  private resolveModule(name: string, containingFile: string, paths: string[]): ResolvedModuleWithFailedLookupLocations | undefined {
    if (name.startsWith(".")) {
      let target = path.resolve(path.dirname(containingFile), name);
      try {
        let stat = fs.statSync(target);
        if (stat.isFile()) {
          return {
            resolvedModule: {
              resolvedFileName: target,
              isExternalLibraryImport: false,
              extension: Extension[path.extname(target)],
            }
          };
        } else if (stat.isDirectory()) {
          target = path.join(target, "index");
        }
      } catch (e) {
        // Just means the file does not exist.
      }

      for (let extension of SCRIPTS) {
        try {
          let check = `${target}${extension}`;
          let stat = fs.statSync(check);
          if (stat.isFile()) {
            return {
              resolvedModule: {
                resolvedFileName: check,
                isExternalLibraryImport: false,
                extension: Extension[extension],
              }
            };
          }
        } catch (e) {
        // Just means the file does not exist.
        }
      }

      return undefined;
    }

    try {
      let module = require.resolve(name, { paths });
      if (path.extname(module) == "") {
        return undefined;
      }
      return {
        resolvedModule: {
          resolvedFileName: module,
          isExternalLibraryImport: true,
          extension: Extension[path.extname(module)],
        }
      };
    } catch (e) {
      // Just means the file does not exist.
    }

    return undefined;
  }

  public getResolvedModuleWithFailedLookupLocationsFromCache(modulename: string, containingFile: string): ResolvedModuleWithFailedLookupLocations | undefined {
    console.log(`Asked for module ${modulename}`);
    let lookupPaths: string[] = [];
    let dir = path.dirname(containingFile);
    while (dir != this.projectRoot) {
      lookupPaths.push(path.join(dir, "node_modules"));
      dir = path.dirname(dir);
    }

    lookupPaths = lookupPaths.concat(this.modulePaths);

    return this.resolveModule(modulename, containingFile, lookupPaths);
  }
}

function findAbove(directory: string, filename: string): string | null {
  for (let current of parents(directory)) {
    if (exists(path.join(current, filename))) {
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
    config = decodeConfig(fs.readFileSync(configFile, { encoding: "utf8" }));
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

  let host = new ESLintServiceHost(path.dirname(configFile), config);
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
