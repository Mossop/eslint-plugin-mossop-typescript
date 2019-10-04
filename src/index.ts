import { Rule } from "eslint";

import { buildRule } from "./check-types";

interface PluginRules {
  [s: string]: Rule.RuleModule;
}

interface Plugin {
  rules: PluginRules;
}

const rules: Plugin = {
  rules: {
    "check-types": buildRule(),
    "type-errors": buildRule({ categories: ["errors"] }),
    "type-warnings": buildRule({ categories: ["warnings"] }),
    "type-suggestions": buildRule({ categories: ["suggestions"] }),
    "type-messages": buildRule({ categories: ["messages"] }),
  },
};

module.exports = rules;
