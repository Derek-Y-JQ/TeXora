/** Capability checks follow the active installation, not an all-tools checklist. */
export function texHealth(info={}){
  const tools=info.tools||{},engines=info.engines||{};
  const canCompile=['xelatex','pdflatex','lualatex'].some(name=>!!engines[name]);
  const manager=info.distro==='miktex'?'mpm':['texlive','tinytex'].includes(info.distro)?'tlmgr':'';
  const optional=[];
  for(const [name,label] of [['synctex','SyncTeX（双向定位）'],['chktex','ChkTeX（静态检查）'],['latexdiff','latexdiff（版本对比）'],['kpsewhich','kpsewhich（宏包路径查询）']])if(!tools[name])optional.push(label);
  if(manager&&!tools[manager])optional.push(manager+'（宏包管理）');
  if(!tools.pdftoppm&&!tools.pdftocairo&&!tools.mgs)optional.push('局部预览渲染器（Poppler / Ghostscript）');
  return {canCompile,manager,optional,type:canCompile?'success':'error',title:canCompile?'TeX 编译环境可用':'未检测到可用的 TeX 编译引擎',description:canCompile?(optional.length?'可编译；以下可选功能未就绪：'+optional.join('、'):'编译与辅助功能均已就绪'):'请安装 TeX Live / MiKTeX，或在设置中选择有效的 TeX 可执行目录'};
}
