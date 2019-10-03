import { Rule } from "eslint";
import checkTypesRule from "./check-types";

interface PluginRules {
  [s: string]: Rule.RuleModule;
}

interface Plugin {
  rules: PluginRules;
}

const rules: Plugin = {
  rules: {
    "check-types": checkTypesRule,
  },
};

export default rules;
