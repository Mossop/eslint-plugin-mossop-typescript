const path = require("path");
const fs = require("fs");
const { getDefaultLibFileName, createLanguageService, getDefaultCompilerOptions } = require("typescript");

const languageServerMap = new Map();

const SCRIPTS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
];

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

class LanguageServerHost {
  constructor(projectRoot, compilerOptions) {
    this.projectRoot = projectRoot;
    this.compilerOptions = compilerOptions;
    this.snapshots = new Map();
    this._scripts = null;
  }

  getCompilationSettings() {
    return this.compilerOptions;
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

  let languageService = languageServerMap.get(configFile);
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
    const ModuleKind = {
      None: 0,
      CommonJS: 1,
      AMD: 2,
      UMD: 3,
      System: 4,
      ES2015: 5,
      ESNext: 99
    };

    compilerOptions.module = translate(compilerOptions.module, ModuleKind);
  }

  if ("jsx" in compilerOptions) {
    const JsxEmit = {
      None: 0,
      Preserve: 1,
      React: 2,
      ReactNative: 3,
    };

    compilerOptions.jsx = translate(compilerOptions.jsx, JsxEmit);
  }

  if ("moduleResolution" in compilerOptions) {
    const ModuleResolutionKind = {
      Classic: 1,
      NodeJs: 2
    };

    compilerOptions.moduleResolution = translate(compilerOptions.moduleResolution, ModuleResolutionKind);
  }

  if ("newLine" in compilerOptions) {
    const NewLineKind = {
      CarriageReturnLineFeed: 0,
      LineFeed: 1
    };

    compilerOptions.newLine = translate(compilerOptions.newLine, NewLineKind);
  }

  if ("target" in compilerOptions) {
    const ScriptTarget = {
      ES3: 0,
      ES5: 1,
      ES2015: 2,
      ES2016: 3,
      ES2017: 4,
      ES2018: 5,
      ES2019: 6,
      ES2020: 7,
      ESNext: 99,
      JSON: 100,
      Latest: 99
    };

    compilerOptions.target = translate(compilerOptions.target, ScriptTarget);
  }

  let host = new LanguageServerHost(path.dirname(configFile), compilerOptions);
  languageService = createLanguageService(host);
  languageServerMap.set(configFile, languageService);
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
