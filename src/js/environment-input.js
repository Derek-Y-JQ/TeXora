import { stripComment } from './latex.js';

export function definedEnvironmentNames(text) {
  const clean = String(text || '').split(/\r?\n/).map(stripComment).join('\n');
  return [...new Set([...clean.matchAll(/\\(?:newtheorem|newsiamremark|(?:re)?newenvironment|provideenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment)\*?\s*\{\s*([^{}\s]+)\s*\}/g)].map(m => m[1]))];
}

/** A complete environment opening, with the caret at/after its closing brace. */
export function environmentOpening(line, column = Infinity) {
  const clean = stripComment(line);
  const m = clean.match(/^(\s*)\\begin\s*\{([^{}\s]+)\}(?:\s*(?:\[[^\]]*\]|\{[^{}]*\}))*\s*$/);
  if (!m || column - 1 < clean.indexOf('}')) return null;
  return { indent: m[1], env: m[2] };
}

/** Ignore a nested same-name pair when looking for the opening's own end. */
export function matchingEnvironmentEnd(lines, fromLine, env) {
  let depth = 0;
  for (let i = fromLine; i < lines.length; i++) {
    for (const m of stripComment(lines[i]).matchAll(/\\(begin|end)\s*\{([^{}]+)\}/g)) {
      if (m[2] !== env) continue;
      if (m[1] === 'begin') depth++;
      else if (depth === 0) return i + 1;
      else depth--;
    }
  }
  return 0;
}
