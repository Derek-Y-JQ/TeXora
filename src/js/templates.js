/** Built-in template catalogue (all use classes shipped with TeX Live / MiKTeX). */

const BIB = `@article{knuth1984tex,
  author  = {Knuth, Donald E.},
  title   = {Literate Programming},
  journal = {The Computer Journal},
  volume  = {27},
  number  = {2},
  pages   = {97--111},
  year    = {1984}
}

@book{lamport1994latex,
  author    = {Lamport, Leslie},
  title     = {LaTeX: A Document Preparation System},
  publisher = {Addison-Wesley},
  year      = {1994},
  edition   = {2nd}
}
`;

export const TEMPLATES = [
  {
    id: 'ctex-article',
    name: '中文论文 / 课程报告',
    desc: 'ctexart 文档类，含中英文摘要、定理环境、公式与参考文献的完整骨架。',
    tags: ['中文', 'ctexart', '学术'],
    accent: 'violet',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[11pt, a4paper]{ctexart}

\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{geometry}
\\usepackage[colorlinks=true, linkcolor=teal, citecolor=teal]{hyperref}

\\geometry{margin=2.6cm}

\\newtheorem{theorem}{定理}[section]
\\newtheorem{lemma}[theorem]{引理}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{定义}
\\newtheorem{example}[theorem]{例}

\\title{基于谱方法的对流扩散方程数值研究}
\\author{作者姓名\\\\\\small 某某大学 \\quad 数学科学学院}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
\\noindent 本文研究一类非定常对流扩散方程的数值求解方法。我们构造了基于 Legendre 谱离散的\\dots
\\textbf{关键词：} 谱方法；对流扩散方程；误差估计
\\end{abstract}

\\tableofcontents
\\newpage

\\section{引言}
\\label{sec:intro}

对流扩散方程广泛应用于流体力学与传热学\\cite{knuth1984tex}。考虑如下初边值问题：
\\begin{equation}
  \\label{eq:model}
  \\begin{cases}
    \\dfrac{\\partial u}{\\partial t} - \\varepsilon \\Delta u + \\mathbf{b}\\cdot\\nabla u = f, & (x,t)\\in\\Omega\\times(0,T],\\\\[4pt]
    u(x,0) = u_0(x), & x\\in\\Omega,\\\\
    u(x,t) = 0, & (x,t)\\in\\partial\\Omega\\times[0,T].
  \\end{cases}
\\end{equation}

\\section{预备知识}
\\label{sec:prelim}

\\begin{definition}[Sobolev 空间]
对整数 $m\\ge 0$ 与 $1\\le p<\\infty$，定义
\\[
  W^{m,p}(\\Omega) = \\left\\{ v\\in L^p(\\Omega) : D^{\\alpha}v \\in L^p(\\Omega),\\ |\\alpha|\\le m \\right\\}.
\\]
\\end{definition}

\\begin{lemma}[Poincaré 不等式]
\\label{lem:poincare}
存在常数 $C>0$，使得对任意 $v\\in H_0^1(\\Omega)$ 有 $\\|v\\|_{L^2}\\le C\\|\\nabla v\\|_{L^2}$。
\\end{lemma}

\\begin{proof}
由引理假设与分部积分可得，详见文献~\\cite{lamport1994latex}。
\\end{proof}

\\section{数值格式}
\\label{sec:scheme}

设 $\\{\\phi_k\\}_{k=0}^{N}$ 为 Legendre 基函数。将解展开为
\\[
  u_N(x,t) = \\sum_{k=0}^{N} \\hat{u}_k(t)\\,\\phi_k(x),
\\]
代入 \\eqref{eq:model} 并取 Galerkin 投影，得到半离散系统
\\begin{align}
  \\mathbf{M}\\frac{\\mathrm{d}\\hat{\\mathbf{u}}}{\\mathrm{d}t} + \\varepsilon \\mathbf{K}\\hat{\\mathbf{u}} + \\mathbf{C}\\hat{\\mathbf{u}} &= \\mathbf{f}(t), \\label{eq:semidiscrete}\\\\
  \\hat{\\mathbf{u}}(0) &= \\hat{\\mathbf{u}}_0. \\label{eq:ic}
\\end{align}

\\begin{table}[htbp]
  \\centering
  \\caption{不同网格下的 $L^2$ 误差与收敛阶}
  \\label{tab:error}
  \\begin{tabular}{lccc}
    \\toprule
    $N$ & $L^2$ 误差 & 收敛阶 & 耗时 (ms) \\\\
    \\midrule
    16 & $3.21\\times 10^{-3}$ & --   & 12 \\\\
    32 & $8.02\\times 10^{-4}$ & 2.00 & 31 \\\\
    64 & $2.01\\times 10^{-4}$ & 2.00 & 96 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}

\\section{结论}
本文给出了\\dots 数值实验见表~\\ref{tab:error}。

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`
      },
      { name: 'references.bib', content: BIB }
    ]
  },
  {
    id: 'article-en',
    name: 'English Academic Paper',
    desc: 'Clean `article` skeleton for English papers: abstract, theorem, figure and table placeholders.',
    tags: ['English', 'article', 'paper'],
    accent: 'blue',
    files: [
      {
        name: 'main.tex',
        content: `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue]{hyperref}

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}

\\title{A Modern Treatment of Spectral Methods\\thanks{Corresponding author.}}
\\author{First Author\\\\Affiliation\\and Second Author\\\\Affiliation}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
We study the convergence of a spectral Galerkin method for convection--diffusion
equations. Optimal error estimates are derived and validated numerically.
\\end{abstract}

\\section{Introduction}
\\label{sec:intro}
Consider the model problem
\\begin{equation}
  \\label{eq:model}
  \\partial_t u - \\varepsilon \\Delta u + b\\cdot\\nabla u = f \\quad \\text{in } \\Omega\\times(0,T].
\\end{equation}

\\section{Main result}
\\begin{theorem}[Optimal convergence]
\\label{thm:main}
Assume $u\\in H^{s}(\\Omega)$ with $s\\ge 1$. Then there exists $C>0$ independent of $N$ such that
\\[
  \\|u-u_N\\|_{H^1} \\le C N^{1-s}\\|u\\|_{H^s}.
\\]
\\end{theorem}

\\begin{proof}
The proof follows from the projection estimate and the stability of the bilinear form; see \\cite{knuth1984tex}.
\\end{proof}

\\section{Numerical experiments}
Results are collected in Table~\\ref{tab:results}.

\\begin{table}[htbp]
  \\centering
  \\caption{Convergence history.}
  \\label{tab:results}
  \\begin{tabular}{lcc}
    \\toprule
    $N$ & Error & Order \\\\
    \\midrule
    16 & $3.2\\times10^{-3}$ & -- \\\\
    32 & $8.0\\times10^{-4}$ & 2.00 \\\\
    64 & $2.0\\times10^{-4}$ & 2.00 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}

\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}
`
      },
      { name: 'references.bib', content: BIB }
    ]
  },
  {
    id: 'ieee',
    name: 'IEEE 会议论文',
    desc: 'IEEEtran 双栏格式，适合会议与期刊投稿（需安装 IEEEtran 宏包）。',
    tags: ['IEEE', '双栏', '英文'],
    accent: 'blue',
    files: [
      {
        name: 'main.tex',
        content: `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{cite}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}

\\begin{document}

\\title{A Compact Spectral Solver for Convection--Diffusion Systems}

\\author{\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{School of Mathematics\\\\University\\\\City, Country\\\\first@example.edu}
\\and
\\IEEEauthorblockN{Second Author}
\\IEEEauthorblockA{School of Mathematics\\\\University\\\\City, Country\\\\second@example.edu}}

\\maketitle

\\begin{abstract}
This paper presents a compact spectral solver for convection--diffusion systems. Numerical experiments confirm the theoretical convergence rate.
\\end{abstract}

\\begin{IEEEkeywords}
Spectral method, convection--diffusion, convergence
\\end{IEEEkeywords}

\\section{Introduction}
\\IEEEPARstart{T}{he} numerical solution of convection--diffusion equations is central to many engineering applications~\\cite{knuth1984tex}.

\\section{Method}
\\begin{equation}
  \\label{eq:model}
  \\partial_t u - \\varepsilon \\Delta u + b\\cdot\\nabla u = f.
\\end{equation}
Discretising \\eqref{eq:model} in space yields a semi-discrete system.

\\section{Results}
\\begin{table}[htbp]
  \\caption{Errors and convergence orders.}
  \\label{tab:res}
  \\centering
  \\begin{tabular}{lcc}
    \\toprule
    $N$ & Error & Order \\\\
    \\midrule
    32 & $8.0\\times10^{-4}$ & -- \\\\
    64 & $2.0\\times10^{-4}$ & 2.00 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}

\\section{Conclusion}
We derived optimal estimates and confirmed them numerically.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`
      },
      { name: 'references.bib', content: BIB }
    ]
  },
  {
    id: 'beamer',
    name: 'Beamer 学术报告',
    desc: '中文 Beamer 幻灯片，包含目录页、数学公式、分栏与区块样式。',
    tags: ['Beamer', '幻灯片', '中文'],
    accent: 'amber',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[aspectratio=169, 11pt]{beamer}
\\usepackage{ctex}
\\usetheme{default}
\\usecolortheme{seahorse}

\\setbeamertemplate{navigation symbols}{}
\\setbeamertemplate{blocks}[rounded][shadow=false]

\\title[谱方法数值分析]{对流扩散方程的谱方法数值分析}
\\subtitle{数值分析与误差估计}
\\author{汇报人：作者姓名}
\\institute{某某大学 数学科学学院}
\\date{\\today}

\\begin{document}

\\begin{frame}[plain]
  \\titlepage
\\end{frame}

\\begin{frame}{目录}
  \\tableofcontents
\\end{frame}

\\section{研究背景}

\\begin{frame}{问题的提出}
  \\begin{columns}[T]
    \\begin{column}{0.55\\textwidth}
      对流扩散方程描述了物质在流动介质中的输运过程：
      \\begin{equation}
        \\partial_t u - \\varepsilon\\Delta u + \\mathbf{b}\\cdot\\nabla u = f.
      \\end{equation}
    \\end{column}
    \\begin{column}{0.42\\textwidth}
      \\begin{block}{研究目标}
        \\begin{itemize}
          \\item 高阶精度
          \\item 稳定可证
          \\item 计算高效
        \\end{itemize}
      \\end{block}
    \\end{column}
  \\end{columns}
\\end{frame}

\\section{数值格式}

\\begin{frame}{谱 Galerkin 格式}
  \\begin{block}{半离散系统}
    \\[
      \\mathbf{M}\\frac{\\mathrm{d}\\hat{\\mathbf{u}}}{\\mathrm{d}t} + \\varepsilon \\mathbf{K}\\hat{\\mathbf{u}} + \\mathbf{C}\\hat{\\mathbf{u}} = \\mathbf{f}(t).
    \\]
  \\end{block}
  \\begin{alertblock}{注意事项}
    时间离散需满足 CFL 条件。
  \\end{alertblock}
\\end{frame}

\\section{结论}

\\begin{frame}{总结与展望}
  \\begin{itemize}
    \\item 证明了 $H^1$ 最优收敛阶；
    \\item 数值实验验证了理论结果；
    \\item 后续工作：自适应网格与并行实现。
  \\end{itemize}
  \\vspace{1em}
  \\centering
  \\Large 谢谢！
\\end{frame}

\\end{document}
`
      }
    ]
  },
  {
    id: 'cv',
    name: '个人简历 CV',
    desc: '简洁的学术简历排版，含教育、科研、发表与技能模块。',
    tags: ['CV', '简历'],
    accent: 'emerald',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[11pt]{article}
\\usepackage[margin=1.6cm]{geometry}
\\usepackage{ctex}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage[hidelinks]{hyperref}

\\titleformat{\\section}{\\large\\bfseries\\color{teal}}{}{0em}{}[\\vspace{-0.6em}\\rule{\\linewidth}{0.4pt}]
\\titlespacing*{\\section}{0pt}{1.2em}{0.6em}
\\setlist[itemize]{leftmargin=1.2em, itemsep=2pt, topsep=2pt}

\\newcommand{\\entry}[3]{\\noindent\\textbf{#1}\\hfill #2\\\\[-0.2em]\\textit{#3}\\par\\vspace{0.4em}}

\\begin{document}

\\begin{center}
  {\\huge\\bfseries 张 三}\\\\[4pt]
  数值分析 · 科学计算\\\\[2pt]
  \\small 邮箱：\\href{mailto:zhangsan@example.com}{zhangsan@example.com} \\quad 主页：example.com \\quad 电话：138-0000-0000
\\end{center}

\\section{教育经历}
\\entry{某某大学\\quad 计算数学}{2021.09 -- 2026.06}{博士研究生，导师：某某教授}
\\entry{某某大学\\quad 数学与应用数学}{2017.09 -- 2021.06}{理学学士，GPA 3.9/4.0}

\\section{研究方向}
谱方法、有限元误差分析、科学计算可视化、机器学习与偏微分方程数值解。

\\section{代表论文}
\\begin{enumerate}[label={[\\arabic*]}, leftmargin=2.2em, itemsep=2pt]
  \\item \\textbf{Zhang, S.}, et al. A compact spectral solver for convection--diffusion systems. \\textit{Journal of Scientific Computing}, 2026, 78(3): 1123--1145.
  \\item \\textbf{Zhang, S.}, Li, M. Adaptive time stepping for nonlinear parabolic equations. \\textit{SIAM J. Numer. Anal.}, 2025, 63(2): 501--528.
\\end{enumerate}

\\section{科研经历}
\\entry{国家自然科学基金项目 · 参与者}{2023 -- 2025}{负责高阶谱离散格式的构造与程序实现，成果发表于 JSC。}

\\section{技能}
\\textbf{编程：} Python, C++, MATLAB, Julia \\quad \\textbf{工具：} LaTeX, Git, ParaView

\\end{document}
`
      }
    ]
  },
  {
    id: 'exam',
    name: '数学试卷 / 讲义',
    desc: '带密封线说明、题目环境与参考答案的试卷模板。',
    tags: ['试卷', '教学', '中文'],
    accent: 'rose',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[11pt, a4paper]{ctexart}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage[margin=2.2cm]{geometry}
\\usepackage{enumitem}
\\usepackage{fancyhdr}

\\newtheorem{problem}{题目}
\\newtheorem*{solution}{解}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[C]{\\small 某某大学 2026 学年《数学分析》期中试卷}
\\fancyfoot[C]{\\small 第 \\thepage 页}

\\newcommand{\\scorebox}[1]{\\hfill\\fbox{\\small #1 分}}

\\begin{document}

\\begin{center}
  {\\Large\\bfseries 2026 学年第一学期期中考试}\\\\[6pt]
  {\\large 数学分析（A 卷）}\\\\[4pt]
  \\small 考试时间：120 分钟 \\quad 满分：100 分 \\quad 闭卷
\\end{center}

\\noindent\\textbf{姓名：}\\underline{\\hspace{4cm}}\\quad \\textbf{学号：}\\underline{\\hspace{4cm}}\\quad \\textbf{班级：}\\underline{\\hspace{3cm}}

\\vspace{1em}\\hrule\\vspace{1em}

\\section*{一、计算题（每题 10 分，共 40 分）}

\\begin{problem}
求极限 \\[ \\lim_{x\\to 0}\\frac{\\sin x - x}{x^3}. \\]
\\end{problem}

\\begin{problem}
计算定积分 $\\displaystyle \\int_0^{\\pi/2} \\sin^3 x\\,\\mathrm{d}x$。
\\end{problem}

\\section*{二、证明题（每题 20 分，共 40 分）}

\\begin{problem}
设 $f$ 在 $[a,b]$ 上连续，在 $(a,b)$ 内可导。证明存在 $\\xi\\in(a,b)$，使得
\\[ f(b)-f(a) = f'(\\xi)(b-a). \\]
\\end{problem}

\\section*{三、综合题（20 分）}

\\begin{problem}
讨论级数 $\\displaystyle\\sum_{n=1}^{\\infty}\\frac{(-1)^n}{\\sqrt{n}}$ 的敛散性。
\\end{problem}

\\newpage
\\section*{参考答案}

\\begin{solution}
由泰勒展开 $\\sin x = x - x^3/6 + o(x^3)$，故极限为 $-1/6$。
\\end{solution}

\\begin{solution}
利用换元 $u=\\cos x$，得积分为 $2/3$。
\\end{solution}

\\end{document}
`
      }
    ]
  },
  {
    id: 'book',
    name: '书籍 / 学位论文',
    desc: 'ctexbook 结构：封面、前言、章节、图表目录与参考文献。',
    tags: ['学位论文', '书籍', '中文'],
    accent: 'violet',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[12pt, oneside]{ctexbook}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[margin=2.8cm]{geometry}
\\usepackage[colorlinks=true,linkcolor=teal]{hyperref}

\\newtheorem{theorem}{定理}[chapter]
\\newtheorem{lemma}[theorem]{引理}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{定义}

\\title{谱方法的理论与应用}
\\author{作者姓名}
\\date{2026 年 10 月}

\\begin{document}
\\frontmatter
\\maketitle

\\chapter*{前言}
\\addcontentsline{toc}{chapter}{前言}
本书系统介绍\\dots

\\tableofcontents
\\listoffigures
\\listoftables

\\mainmatter
\\chapter{绪论}
\\label{chap:intro}

\\section{研究背景}
\\label{sec:background}
谱方法是求解偏微分方程的高精度数值方法\\dots

\\chapter{理论基础}
\\label{chap:theory}

\\begin{definition}[正交多项式]
若 $\\int_a^b w(x)p_m(x)p_n(x)\\,\\mathrm{d}x = 0\\ (m\\ne n)$，则称 $\\{p_n\\}$ 关于权 $w$ 正交。
\\end{definition}

\\begin{theorem}[投影误差]
\\label{thm:projection}
设 $u\\in H^s(\\Omega)$，则 $\\|u-\\Pi_N u\\|_{H^1}\\le C N^{1-s}\\|u\\|_{H^s}$。
\\end{theorem}

\\begin{proof}
由逼近性质与稳定性可得。
\\end{proof}

\\chapter{数值实验}
\\label{chap:numerics}

表格与图片示例见下表。

\\begin{table}[htbp]
  \\centering
  \\caption{误差与收敛阶}
  \\label{tab:conv}
  \\begin{tabular}{lcc}
    \\toprule
    $N$ & 误差 & 阶 \\\\
    \\midrule
    32 & $8.0\\times10^{-4}$ & -- \\\\
    64 & $2.0\\times10^{-4}$ & 2.00 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}

\\backmatter
\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`
      },
      { name: 'references.bib', content: BIB }
    ]
  },
  {
    id: 'blank',
    name: '空白文档',
    desc: '仅包含最基础的导言区，适合从零开始写作。',
    tags: ['空白', '最小'],
    accent: 'blue',
    files: [
      {
        name: 'main.tex',
        content: `% !TeX program = xelatex
\\documentclass[11pt]{ctexart}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}

\\begin{document}

\\section{开始}

在这里开始写作。

\\end{document}
`
      }
    ]
  },
  {
    id: 'letter',
    name: '学术信函 / 投稿信',
    desc: '正式信函格式，可用于投稿 cover letter 或推荐信。',
    tags: ['信函', '英文'],
    accent: 'emerald',
    files: [
      {
        name: 'main.tex',
        content: `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{parskip}
\\usepackage{hyperref}

\\begin{document}

\\noindent
First Author\\\\
School of Mathematics\\\\
University\\\\
City, Country\\\\
\\href{mailto:first@example.edu}{first@example.edu}

\\vspace{1.5em}
\\noindent\\today

\\vspace{1.5em}
\\noindent Editor-in-Chief\\\\
\\textit{Journal of Scientific Computing}

\\vspace{1.5em}
\\noindent Dear Editor,

\\vspace{0.8em}
We are pleased to submit our manuscript entitled \`\`A Compact Spectral Solver for
Convection--Diffusion Systems'' for consideration for publication in
\\textit{Journal of Scientific Computing}.

The main contributions of this work are: (i) a compact spectral discretisation
with optimal error estimates; (ii) an efficient time-stepping strategy; and
(iii) extensive numerical validation.

We confirm that this manuscript has not been published elsewhere and is not under
consideration by another journal. All authors have approved the manuscript and
agree with its submission.

\\vspace{1em}
\\noindent Sincerely,

\\vspace{2em}
\\noindent First Author, on behalf of all authors

\\end{document}
`
      }
    ]
  }
];

export const NEW_PROJECT_DEFAULTS = {
  docClass: 'ctexart',
  paper: 'a4paper',
  fontSize: '11pt',
  columns: 'one',
  language: 'zh',
  packages: ['amsmath', 'amssymb', 'graphicx', 'hyperref', 'booktabs'],
  title: '未命名文档',
  author: ''
};

export function buildWizardDocument(opts) {
  const { docClass, paper, fontSize, columns, language, packages, title, author } = { ...NEW_PROJECT_DEFAULTS, ...opts };
  const cls = columns === 'two' ? `${docClass}, twocolumn` : docClass;
  const pkgs = Array.from(new Set(['amsmath', 'amssymb', ...(packages || [])])).filter((p) => p && p !== 'ctex');
  const lines = [
    '% !TeX program = xelatex',
    `\\documentclass[${[fontSize, paper].filter(Boolean).join(', ')}]{${cls}}`,
    '',
    ...pkgs.map((p) => (p === 'geometry' ? '\\usepackage[margin=2.5cm]{geometry}' : `\\usepackage{${p}}`)),
    '',
    title ? `\\title{${title}}` : '',
    author ? `\\author{${author}}` : '',
    '\\date{\\today}',
    '',
    '\\begin{document}',
    title ? '\\maketitle' : '',
    '',
    language === 'zh' ? '\\section{引言}\n\n在此开始写作。\n' : '\\section{Introduction}\n\nStart writing here.\n',
    '\\end{document}',
    ''
  ];
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}
