import fs from 'node:fs';import path from 'node:path';import {spawn}from'node:child_process';
const root=path.resolve('.capture/preview-refresh-project');fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'main.tex'),String.raw`\documentclass{article}
\usepackage{mathtools,tikz,longtable}
\DeclarePairedDelimiter{\norm}{\lVert}{\rVert}
`+'% space\n'.repeat(15)+String.raw`\begin{document}
\[x^2+1\]
\[x+\norm{v}+y^2\]
\begin{tabular}{cc}
Cell target & Second \\
A & B
\end{tabular}
\begin{longtable}{cc}
Long target & Second \\
A & B
\end{longtable}
\begin{tikzpicture}
\node[draw] {Draw target};
\draw (0,0) -- (1,1);
\end{tikzpicture}
\end{document}`);
const env={...process.env,TEXORA_USER_DATA:process.env.TEXORA_USER_DATA||path.resolve('.capture/preview-refresh-profile-'+Date.now())};
const child=spawn(process.execPath,['scripts/cdp.mjs','--script','scripts/verify-preview-refresh.mjs','--','--project='+root],{env,stdio:'inherit',windowsHide:true});child.on('exit',code=>{process.exitCode=code||0;});
