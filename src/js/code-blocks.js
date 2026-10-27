export const LANGUAGES = [
  ['python','Python','Python'],['cpp','C++','C++'],['c','C','C'],['java','Java','Java'],['javascript','JavaScript',null],['typescript','TypeScript',null],['rust','Rust',null],['go','Go',null],['julia','Julia',null],['r','R','R'],['matlab','MATLAB','Matlab'],['sql','SQL','SQL'],['bash','Bash','bash'],['latex','LaTeX','[LaTeX]TeX'],['text','纯文本',null]
];
export const ALGORITHM_PARTS = [
  ['输入',String.raw`\Require Input data $X$`], ['输出',String.raw`\Ensure Result $y$`],
  ['执行步骤',String.raw`\State $y \gets f(x)$`], ['For 循环',String.raw`\For{$i=1,\ldots,n$}
  \State $s \gets s+x_i$
\EndFor`], ['For Each',String.raw`\ForAll{$x \in X$}
  \State Process $x$
\EndFor`], ['While 循环',String.raw`\While{condition}
  \State Update state
\EndWhile`], ['If / Else',String.raw`\If{condition}
  \State First branch
\Else
  \State Second branch
\EndIf`], ['Else If',String.raw`\ElsIf{other condition}
  \State Another branch`], ['Repeat / Until',String.raw`\Repeat
  \State Update state
\Until{condition}`], ['函数',String.raw`\Function{Solve}{$X$}
  \State \Return $y$
\EndFunction`], ['过程',String.raw`\Procedure{Update}{$x$}
  \State Update $x$
\EndProcedure`], ['返回',String.raw`\State \Return $y$`], ['注释',String.raw`\Comment{Explain this step}`]
];
const escaped = value => String(value || '').replace(/[\\{}%&#_$~^]/g, c => ({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c] || '\\'+c));
export function blockSource({ kind='code', backend='listings', language='python', code='', caption='', label='', numbers=true }) {
  if (!code.trim()) throw Error('请先输入内容');
  if (!/^[\w:./-]*$/.test(label)) throw Error('标签仅支持字母、数字、下划线、冒号、点、斜杠与短横线');
  const lang = LANGUAGES.find(l => l[0] === language);
  if (!lang) throw Error('请选择支持的代码语言');
  const env = kind === 'algorithm' ? 'algorithmic' : backend === 'minted' ? 'minted' : 'lstlisting';
  if (code.includes('\\end{'+env+'}')) throw Error('正文不能包含当前环境的结束命令');
  const content = code.replace(/\r\n/g,'\n').replace(/^\n|\n$/g,'');
  const title = escaped(caption), lab = label ? `\\label{${label}}\n` : '';
  if (kind === 'algorithm') return { packages:['algorithm','algpseudocode'], source:`\\begin{algorithm}[htbp]\n${title ? '\\caption{'+title+'}\n' : ''}${lab}\\begin{algorithmic}${numbers ? '[1]' : ''}\n${content}\n\\end{algorithmic}\n\\end{algorithm}\n` };
  if (backend === 'minted') {
    const block = `\\begin{minted}[breaklines,fontsize=\\small${numbers ? ',linenos' : ''}]{${language}}\n${content}\n\\end{minted}\n`;
    return { packages:['minted'], source:title || label ? `\\begin{listing}[htbp]\n\\caption{${title || 'Code'}}\n${lab}${block}\\end{listing}\n` : block };
  }
  const options = ['basicstyle=\\ttfamily\\small','breaklines=true','columns=fullflexible','keepspaces=true','showstringspaces=false',...(lang[2] ? ['language='+lang[2]] : []),...(numbers ? ['numbers=left'] : []),...(title ? ['caption={'+title+'}'] : []),...(label ? ['label={'+label+'}'] : [])];
  return { packages:['listings'], source:`\\begin{lstlisting}[${options.join(',')}]\n${content}\n\\end{lstlisting}\n`, plainLanguage:!lang[2] && language !== 'text' };
}
export function packageInsertion(rootText, packages, included = '') {
  const clean = text => text.replace(/(?<!\\)(?:\\\\)*%[^\n]*/g,'');
  const root = clean(rootText), masked = rootText.replace(/(?<!\\)(?:\\\\)*%[^\n]*/g, match => ' '.repeat(match.length));
  const index = masked.indexOf('\\begin{document}');
  if (!/\\documentclass(?:\[[^\]]*\])?\{/.test(root) || index < 0) throw Error('主文档缺少 documentclass 或 begin{document}，请先选择正确主文档');
  const loaded = new Set();
  for (const m of clean(rootText.slice(0,index)+'\n'+included).matchAll(/\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g)) for (const name of m[1].split(',')) loaded.add(name.trim());
  if (packages.includes('algpseudocode') && (loaded.has('algorithm2e') || loaded.has('algorithmic'))) throw Error('导言区已有 algorithm2e / algorithmic，与 algpseudocode 冲突。请先选择统一的算法宏包。');
  const missing = [...new Set(packages)].filter(p => !loaded.has(p));
  return { offset:index, text:missing.length ? missing.map(p=>'\\usepackage{'+p+'}').join('\n')+'\n' : '' };
}
