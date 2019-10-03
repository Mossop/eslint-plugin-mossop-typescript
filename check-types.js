const path = require("path");
const fs = require("fs");
const {
  ScriptTarget, NewLineKind, ModuleKind, JsxEmit, ModuleResolutionKind, Extension,
  getDefaultLibFileName, createLanguageService, getDefaultCompilerOptions } = require("typescript");

const languageServiceMap = new Map();

const TS_SCRIPTS = [
  ".ts",
  ".tsx",
  ".d.ts",
];

const JS_SCRIPTS = [
  ".js",
  ".jsx",
];

const SCRIPTS = TS_SCRIPTS.concat(JS_SCRIPTS);

function findAllScripts(directory, scriptNames) {
  let entries = fs.readdirSync(directory, { withFileTypes: true });
  for (entry of entries) {
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

class ScriptSnapshot {
  constructor(host, filename) {
    this._content = null
    this.host = host;
    this.filename = filename;
  }

  getContent() {
    if (this._content) {
      return this._content;
    }

    this._content = fs.readFileSync(this.filename, { encoding: "utf8" });
    return this._content;
  }

  /** Gets a portion of the script snapshot specified by [start, end). */
  getText(start, end) {
    return this.getContent().substr(start, end - start);
  }

  /** Gets the length of this script snapshot. */
  getLength() {
    return this.getContent().length;
  }

  /**
   * Gets the TextChangeRange that describe how the text changed between this text and
   * an older version.  This information is used by the incremental parser to determine
   * what sections of the script need to be re-parsed.  'undefined' can be returned if the
   * change range cannot be determined.  However, in that case, incremental parsing will
   * not happen and the entire document will be re - parsed.
   */
  getChangeRange(oldSnapshot) {
    return undefined;
  }

  /** Releases all resources held by this script snapshot */
  dispose() {
    this.script = null;
    this.host.snapshots.delete(this.filename);
  }
}

class LanguageServiceHost {
  constructor(projectRoot, compilerOptions) {
    this.projectRoot = projectRoot;
    this.compilerOptions = compilerOptions;
    this.snapshots = new Map();
    this._scripts = null;

    // Can't get the correct paths for the actual root for some reason so do this dance.
    let paths = require.resolve.paths(__filename);

    let count = 0;
    let dir = path.dirname(__filename);
    while (true) {
      count++;
      let parent = path.dirname(dir);
      if (parent == dir) {
        break;
      }
      dir = parent;
    }

    // This gives us the global paths.
    paths = paths.slice(count);

    let parents = [];
    dir = projectRoot;
    while (true) {
      parents.push(path.join(dir, "node_modules"));
      let parent = path.dirname(dir);
      if (parent == dir) {
        break;
      }
      dir = parent;
    }

    while (parents.length) {
      paths.unshift(parents.pop());
    }

    this.modulePaths = paths;
  }

  getCompilationSettings() {
    return this.compilerOptions;
  }

  getNewLine() {
    if (NewLineKind[this.compilerOptions.newLine] == "CarriageReturnLineFeed") {
      return "\r\n";
    }
    return "\n";
  }

  getScriptFileNames() {
    if (this._scripts == null) {
      this._scripts = [];
      // ICK
      findAllScripts(this.projectRoot, this._scripts);
    }

    return this._scripts;
  }

  getScriptVersion(fileName) {
    return "1";
  }

  getScriptSnapshot(fileName) {
    if (!this.snapshots.has(fileName)) {
      this.snapshots.set(fileName, new ScriptSnapshot(this, fileName));
    }
    return this.snapshots.get(fileName);
  }

  getCurrentDirectory() {
    return process.cwd();
  }

  getDefaultLibFileName(options) {
    let name = getDefaultLibFileName(options);
    let module = require.resolve("typescript");
    return path.join(path.dirname(module), name);
  }

  resolveModule(name, containingFile, paths) {
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
          isExternalLibraryImport: module.indexOf(external) >= 0,
          extension: Extension[path.extname(module)],
        }
      };
    } catch (e) {
    }
    return undefined;
  }

  resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options) {
    let paths = [];
    let dir = path.dirname(containingFile);
    while (dir != this.projectRoot) {
      paths.push(path.join(dir, "node_modules"));
      dir = path.dirname(dir);
    }

    for (let dir of this.modulePaths) {
      paths.push(dir);
    }

    return moduleNames.map((name) => {
      let resolved = this.resolveModule(name, containingFile, paths);
      return resolved ? resolved.resolvedModule : undefined;
    })
  }

  getResolvedModuleWithFailedLookupLocationsFromCache(name, containingFile) {
    let paths = [];
    let dir = path.dirname(containingFile);
    while (dir != this.projectRoot) {
      paths.push(path.join(dir, "node_modules"));
      dir = path.dirname(dir);
    }

    for (let dir of this.modulePaths) {
      paths.push(dir);
    }

    return this.resolveModule(name, containingFile, paths);
  }
}

function findAbove(directory, filename) {
  const exists = (name) => {
    try {
      return fs.statSync(name).isFile();
    } catch (e) {
      return false;
    }
  }

  while (!exists(path.join(directory, filename))) {
    let above = path.dirname(directory);
    if (above == directory) {
      return null;
    }
    directory = above;
  }

  return path.join(directory, filename);
}

function translate(current, kinds) {
  for (let kind of Object.keys(kinds)) {
    if (kind.toLowerCase() == current.toLowerCase()) {
      return kinds[kind];
    }
  }
  return undefined;
}

function getLanguageService(context, node) {
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

  let compilerOptions;
  try {
    compilerOptions = JSON.parse(fs.readFileSync(configFile, { encoding: "utf8" })).compilerOptions;
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

  if ("module" in compilerOptions) {
    compilerOptions.module = translate(compilerOptions.module, ModuleKind);
  }

  if ("jsx" in compilerOptions) {
    compilerOptions.jsx = translate(compilerOptions.jsx, JsxEmit);
  }

  if ("moduleResolution" in compilerOptions) {
    compilerOptions.moduleResolution = translate(compilerOptions.moduleResolution, ModuleResolutionKind);
  }

  if ("newLine" in compilerOptions) {
    compilerOptions.newLine = translate(compilerOptions.newLine, NewLineKind);
  }

  if ("target" in compilerOptions) {
    compilerOptions.target = translate(compilerOptions.target, ScriptTarget);
  }

  let host = new LanguageServiceHost(path.dirname(configFile), compilerOptions);
  languageService = createLanguageService(host);
  languageServiceMap.set(configFile, languageService);
  return languageService;
}

function reportDiagnostic(context, node, diagnostic) {
  let report = {
    node,
  };

  if (diagnostic.file && diagnostic.start !== undefined) {
    delete report.node;
    report.loc = {
      start: {
        line: 1,
        column: 0,
      },
      end: {
        line: 1,
        column: 0,
      }
    };

    let start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    report.loc.start.line = start.line + 1;
    report.loc.start.column = start.character;

    let end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length);
    report.loc.end.line = end.line + 1;
    report.loc.end.column = end.character;
  }

  if (typeof diagnostic.messageText == "object") {
    report.message = "TS{{ code }}: {{ message }}";
    report.data = {
      code: diagnostic.messageText.code,
      message: diagnostic.messageText.messageText,
    };
  } else {
    report.message = "TS{{ code }}: {{ message }}";
    report.data = {
      code: diagnostic.code,
      message: diagnostic.messageText,
    };
  }

  context.report(report);
}

function checkTypes(context, node) {
  let languageService = getLanguageService(context, node);
  if (!languageService) {
    return;
  }

  let diags = languageService.getSyntacticDiagnostics(context.getFilename());
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

module.exports = {
  meta: {
    type: "problem",
  },
  create: function(context) {
    // declare the state of the rule
    return {
      Program: (node) => checkTypes(context, node),
    };
  }
};
