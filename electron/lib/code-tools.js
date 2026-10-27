'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { run } = require('./run');
const projectKey = root => path.resolve(root).replace(/\\/g, '/').toLowerCase();
function codeEnvironment(store, env = {}) {
  const scripts = store.get('code.runtimeScripts', '');
  return scripts && fs.existsSync(scripts) ? { ...env, PATH: scripts + path.delimiter + (env.PATH || process.env.PATH || '') } : { ...env };
}
function mintedEnabled(store, root) { return !!root && !!store.get('code.mintedProjects', {})[projectKey(root)]; }
class CodeTools {
  constructor({ tex, store, userData, project }) { Object.assign(this, { tex, store, userData, project }); this.pending = null; }
  packages(kind, backend) { return kind === 'algorithm' ? ['algorithms', 'algorithmicx'] : [backend === 'minted' ? 'minted' : 'listings']; }
  files(kind, backend) { return kind === 'algorithm' ? ['algorithm.sty','algpseudocode.sty'] : [backend === 'minted' ? 'minted.sty' : 'listings.sty']; }
  async packageFile(name) {
    if (!this.tex.get('kpsewhich')) return '';
    const res = await run(this.tex.get('kpsewhich'), [name], { env: this.tex.env, timeout: 15000 });
    return res.code === 0 ? res.output.trim().split(/\r?\n/).at(-1) : '';
  }
  async executable(name, env = this.tex.env) {
    const result = await run(name, ['--version'], { env: codeEnvironment(this.store, env), timeout: 20000 });
    return result.code === 0;
  }
  async status({ kind = 'code', backend = 'listings' } = {}) {
    if (!['code','algorithm'].includes(kind) || !['listings','minted'].includes(backend)) throw Error('不支持的代码环境');
    const missing = [];
    for (const name of this.files(kind, backend)) if (!await this.packageFile(name)) missing.push(name);
    const runtime = kind !== 'code' || backend !== 'minted' || await this.executable('latexminted');
    return { ok: true, ready: !missing.length && runtime, missing, runtime, backend, kind, engine: !!(this.tex.get('xelatex') || this.tex.get('pdflatex')) };
  }
  async python() {
    for (const [exe,args] of [['py',['-3']],['python',[]],['python3',[]]]) {
      const result = await run(exe, [...args,'-c','import sys; print(sys.executable)'], { timeout: 20000 });
      const file = result.output.trim().split(/\r?\n/).at(-1);
      if (result.code === 0 && fs.existsSync(file)) return file;
    }
    // Install for the current user; no arbitrary downloaded scripts are executed.
    const installed = await run('winget', ['install','--id','Python.Python.3.12','--exact','--scope','user','--silent','--accept-package-agreements','--accept-source-agreements','--disable-interactivity'], { timeout: 600000 });
    const local = path.join(process.env.LOCALAPPDATA || '', 'Programs','Python','Python312','python.exe');
    if (installed.code === 0 && fs.existsSync(local)) return local;
    throw Error('无法自动安装 Python。请安装 Python 3.10 或更高版本后重试。' + installed.output.slice(-500));
  }
  async setupRuntime() {
    if (await this.executable('latexminted')) return;
    const folder = path.join(this.userData, 'code-runtime');
    const python = path.join(folder, 'Scripts', 'python.exe');
    if (!fs.existsSync(python)) {
      const base = await this.python();
      const result = await run(base, ['-m','venv',folder], { timeout: 120000 });
      if (result.code !== 0) throw Error('创建代码高亮环境失败：' + result.output.slice(-700));
    }
    const result = await run(python, ['-m','pip','install','--disable-pip-version-check','--index-url','https://pypi.org/simple','latexminted>=0.6,<1','Pygments>=2.17,<3'], { timeout: 300000 });
    if (result.code !== 0) throw Error('安装 minted 高亮工具失败：' + result.output.slice(-700));
    this.store.set('code.runtimeScripts',path.join(folder,'Scripts'));
  }
  async prepare(options = {}) {
    if (this.pending) return { ok: false, error: '正在配置代码环境，请稍候' };
    this.pending = this._prepare(options);
    try { return await this.pending; } catch(error) { return { ok:false, error:error.message }; } finally { this.pending = null; }
  }
  async _prepare({ kind = 'code', backend = 'listings' } = {}) {
    const root = this.project.root;
    if (!root) throw Error('请先打开项目');
    let status = await this.status({ kind, backend });
    if (!status.engine) throw Error('未找到 TeX 引擎，请先安装或配置 MiKTeX / TeX Live');
    const files = this.files(kind,backend), packages = this.packages(kind,backend);
    for (let i=0;i<files.length;i++) if (!await this.packageFile(files[i])) {
      const result = await this.tex.installPackage(packages[i]);
      if (!result.ok) throw Error('自动安装 ' + packages[i] + ' 失败：' + (result.error || result.output || '请检查网络与宏包安装设置'));
    }
    if (kind === 'code' && backend === 'minted') await this.setupRuntime();
    if (root !== this.project.root) throw Error('项目已切换，请在新项目中重试');
    const probes = path.join(this.userData,'code-probes');
    await fsp.mkdir(probes,{recursive:true});
    const probeDir = await fsp.mkdtemp(path.join(probes,'probe-'));
    const packagesText = kind === 'algorithm' ? '\\usepackage{algorithm,algpseudocode}' : `\\usepackage{${backend}}`;
    const body = kind === 'algorithm' ? '\\begin{algorithm}\\begin{algorithmic}[1]\\State $x=1$\\end{algorithmic}\\end{algorithm}' : backend === 'minted' ? '\\begin{minted}{python}\nprint(1)\n\\end{minted}' : '\\begin{lstlisting}[language=Python]\nprint(1)\n\\end{lstlisting}';
    await fsp.writeFile(path.join(probeDir,'probe.tex'),`\\documentclass{article}\n${packagesText}\n\\begin{document}\n${body}\n\\end{document}\n`);
    const exe = this.tex.get('pdflatex') || this.tex.get('xelatex');
    const result = await run(exe, ['-interaction=nonstopmode','-halt-on-error',...(kind === 'code' && backend === 'minted' ? ['-shell-escape'] : []),'probe.tex'], { cwd:probeDir, env:codeEnvironment(this.store,this.tex.env), timeout:90000 });
    if (result.code !== 0 || !fs.existsSync(path.join(probeDir,'probe.pdf'))) throw Error('环境试编译失败：' + result.output.slice(-1800));
    if (kind === 'code' && backend === 'minted') {
      this.store.set('code.mintedProjects',{...this.store.get('code.mintedProjects',{}),[projectKey(root)]:true});
    }
    return { ok:true, ready:true, verified:true, kind, backend };
  }
}
module.exports = { CodeTools, codeEnvironment, mintedEnabled };
