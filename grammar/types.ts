export interface GrammarRule {
  name: string;
  definition: string;
}

export interface Grammar {
  rules: Map<string, GrammarRule>;
  startRule: string;
}
