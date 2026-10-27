import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve('.capture/verify135-project');fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'main.tex'),String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\newcommand{\norm}[1]{\left\lVert #1\right\rVert}
`+'% spacer\n'.repeat(18)+String.raw`\begin{document}
Floating preview test.
\[
x^2+\frac{1}{2}
\]
\input{child}
\end{document}`);
fs.writeFileSync(path.join(root,'child.tex'),String.raw`\begin{enumerate}
  \item Outer target
  \begin{enumerate}
    \item Inner target
    \item Second inner
  \end{enumerate}
  \item Last outer
\end{enumerate}`);
const env={...process.env,TEXORA_USER_DATA:process.env.TEXORA_USER_DATA || path.resolve('.capture/profile135-'+Date.now())};
const child=spawn(process.execPath,['scripts/cdp.mjs','--script','scripts/verify-135.mjs','--','--project='+root],{env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>{process.exitCode=code||0;});
