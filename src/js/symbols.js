/** Math symbol palette catalogue. Each item: [insertText, displayGlyph] */

export const SYMBOL_GROUPS = [
  {
    id: 'greek',
    title: '希腊字母',
    items: [
      ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\delta', 'δ'], ['\\epsilon', 'ϵ'], ['\\varepsilon', 'ε'],
      ['\\zeta', 'ζ'], ['\\eta', 'η'], ['\\theta', 'θ'], ['\\vartheta', 'ϑ'], ['\\iota', 'ι'], ['\\kappa', 'κ'],
      ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\nu', 'ν'], ['\\xi', 'ξ'], ['\\pi', 'π'], ['\\rho', 'ρ'],
      ['\\sigma', 'σ'], ['\\tau', 'τ'], ['\\upsilon', 'υ'], ['\\phi', 'ϕ'], ['\\varphi', 'φ'], ['\\chi', 'χ'],
      ['\\psi', 'ψ'], ['\\omega', 'ω'], ['\\Gamma', 'Γ'], ['\\Delta', 'Δ'], ['\\Theta', 'Θ'], ['\\Lambda', 'Λ'],
      ['\\Xi', 'Ξ'], ['\\Pi', 'Π'], ['\\Sigma', 'Σ'], ['\\Phi', 'Φ'], ['\\Psi', 'Ψ'], ['\\Omega', 'Ω']
    ]
  },
  {
    id: 'operators',
    title: '运算符',
    items: [
      ['\\times', '×'], ['\\div', '÷'], ['\\pm', '±'], ['\\mp', '∓'], ['\\cdot', '·'], ['\\ast', '∗'],
      ['\\star', '⋆'], ['\\circ', '∘'], ['\\bullet', '∙'], ['\\oplus', '⊕'], ['\\ominus', '⊖'], ['\\otimes', '⊗'],
      ['\\oslash', '⊘'], ['\\odot', '⊙'], ['\\cup', '∪'], ['\\cap', '∩'], ['\\setminus', '∖'], ['\\wedge', '∧'],
      ['\\vee', '∨'], ['\\neg', '¬'], ['\\sum', '∑'], ['\\prod', '∏'], ['\\coprod', '∐'], ['\\bigcup', '⋃'],
      ['\\bigcap', '⋂'], ['\\bigoplus', '⨁'], ['\\bigotimes', '⨂'], ['\\int', '∫'], ['\\iint', '∬'], ['\\iiint', '∭'],
      ['\\oint', '∮'], ['\\nabla', '∇'], ['\\partial', '∂'], ['\\infty', '∞'], ['\\prime', '′'], ['\\forall', '∀'],
      ['\\exists', '∃'], ['\\nexists', '∄'], ['\\emptyset', '∅'], ['\\angle', '∠'], ['\\triangle', '△'], ['\\square', '□']
    ]
  },
  {
    id: 'relations',
    title: '关系符',
    items: [
      ['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\approx', '≈'], ['\\equiv', '≡'], ['\\sim', '∼'],
      ['\\simeq', '≃'], ['\\cong', '≅'], ['\\propto', '∝'], ['\\ll', '≪'], ['\\gg', '≫'], ['\\in', '∈'],
      ['\\notin', '∉'], ['\\ni', '∋'], ['\\subset', '⊂'], ['\\supset', '⊃'], ['\\subseteq', '⊆'], ['\\supseteq', '⊇'],
      ['\\sqsubseteq', '⊑'], ['\\preceq', '⪯'], ['\\succeq', '⪰'], ['\\perp', '⊥'], ['\\parallel', '∥'], ['\\mid', '∣'],
      ['\\models', '⊨'], ['\\vdash', '⊢'], ['\\dashv', '⊣'], ['\\smile', '⌣'], ['\\frown', '⌢'], ['\\asymp', '≍']
    ]
  },
  {
    id: 'arrows',
    title: '箭头',
    items: [
      ['\\rightarrow', '→'], ['\\leftarrow', '←'], ['\\leftrightarrow', '↔'], ['\\Rightarrow', '⇒'], ['\\Leftarrow', '⇐'],
      ['\\Leftrightarrow', '⇔'], ['\\longrightarrow', '⟶'], ['\\longleftarrow', '⟵'], ['\\Longrightarrow', '⟹'],
      ['\\mapsfrom', '↤'], ['\\mapsto', '↦'], ['\\uparrow', '↑'], ['\\downarrow', '↓'], ['\\updownarrow', '↕'],
      ['\\nearrow', '↗'], ['\\searrow', '↘'], ['\\swarrow', '↙'], ['\\nwarrow', '↖'], ['\\rightsquigarrow', '⇝'],
      ['\\rightleftharpoons', '⇌'], ['\\hookrightarrow', '↪'], ['\\hookleftarrow', '↩'], ['\\twoheadrightarrow', '↠'],
      ['\\xrightarrow{}', '→ᵗ'], ['\\xleftarrow{}', '←ᵗ']
    ]
  },
  {
    id: 'calculus',
    title: '微积分与集合',
    items: [
      ['\\lim_{x \\to 0}', 'lim'], ['\\limsup', 'lim sup'], ['\\liminf', 'lim inf'], ['\\sup', 'sup'], ['\\inf', 'inf'],
      ['\\max', 'max'], ['\\min', 'min'], ['\\argmax', 'arg max'], ['\\argmin', 'arg min'], ['\\log', 'log'],
      ['\\ln', 'ln'], ['\\exp', 'exp'], ['\\sin', 'sin'], ['\\cos', 'cos'], ['\\tan', 'tan'], ['\\cot', 'cot'],
      ['\\arcsin', 'arcsin'], ['\\sinh', 'sinh'], ['\\cosh', 'cosh'], ['\\det', 'det'], ['\\dim', 'dim'],
      ['\\ker', 'ker'], ['\\deg', 'deg'], ['\\gcd', 'gcd'], ['\\mathbb{R}', 'ℝ'], ['\\mathbb{N}', 'ℕ'],
      ['\\mathbb{Z}', 'ℤ'], ['\\mathbb{Q}', 'ℚ'], ['\\mathbb{C}', 'ℂ'], ['\\mathcal{P}', '𝒫'], ['\\varnothing', '∅']
    ]
  },
  {
    id: 'structures',
    title: '结构与定界符',
    items: [
      ['\\frac{$1}{$2}', 'a/b'], ['\\dfrac{$1}{$2}', 'a/b'], ['\\sqrt{$1}', '√'], ['\\sqrt[$1]{$2}', 'ⁿ√'],
      ['$1^{$2}', 'xⁿ'], ['$1_{$2}', 'xₙ'], ['\\binom{$1}{$2}', 'C'], ['\\left($1\\right)', '( )'],
      ['\\left[$1\\right]', '[ ]'], ['\\left\\{$1\\right\\}', '{ }'], ['\\left|$1\\right|', '| |'],
      ['\\left\\|$1\\right\\|', '‖ ‖'], ['\\langle $1 \\rangle', '⟨ ⟩'], ['\\lfloor $1 \\rfloor', '⌊ ⌋'],
      ['\\lceil $1 \\rceil', '⌈ ⌉'], ['\\overline{$1}', 'x̄'], ['\\underline{$1}', 'x̲'], ['\\vec{$1}', 'x⃗'],
      ['\\hat{$1}', 'x̂'], ['\\tilde{$1}', 'x̃'], ['\\dot{$1}', 'ẋ'], ['\\ddot{$1}', 'ẍ'], ['\\bar{$1}', 'x̄'],
      ['\\begin{pmatrix} $1 & $2 \\\\ $3 & $4 \\end{pmatrix}', 'matrix'], ['\\begin{cases} $1 \\\\ $2 \\end{cases}', 'cases'],
      ['\\begin{aligned} $1 \\end{aligned}', 'aligned'], ['\\begin{array}{cc} $1 & $2 \\\\ $3 & $4 \\end{array}', 'array']
    ]
  },
  {
    id: 'spacing',
    title: '间距与文本',
    items: [
      ['\\quad', '␣␣'], ['\\qquad', '␣␣␣␣'], ['\\,', '␣'], ['\\;', '␣'], ['\\!', '␣'], ['\\ ', '␣'],
      ['\\text{$1}', 'text'], ['\\operatorname{$1}', 'op'], ['\\mathbf{$1}', '𝐱'], ['\\mathrm{$1}', 'x'],
      ['\\mathit{$1}', '𝑥'], ['\\mathcal{$1}', '𝒳'], ['\\mathbb{$1}', '𝕏'], ['\\mathfrak{$1}', '𝔵'],
      ['\\displaystyle', 'D'], ['\\textstyle', 'T'], ['\\begin{matrix} $1 \\end{matrix}', 'matrix']
    ]
  }
];

export const SIZE_OPTIONS = [
  ['tiny', '极小'], ['scriptsize', '很小'], ['footnotesize', '小'], ['small', '较小'], ['normalsize', '正文'],
  ['large', '大'], ['Large', '较大'], ['LARGE', '很大'], ['huge', '巨大'], ['Huge', '最大']
];

/** Convert "$1"-style body into a Monaco snippet. */
export function toSnippet(body) {
  return String(body || '').replace(/\$(\d+)/g, (m, n) => '${' + n + '}');
}
