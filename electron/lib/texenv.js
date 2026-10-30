'use strict';
/**
 * TeX installation discovery: distributions, engines, helper tools,
 * installed packages (for auto-completion), local fonts, and package install.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { run, capture } = require('./run');

const ENGINE_BINARIES = {
  xelatex: 'xelatex.exe',
  pdflatex: 'pdflatex.exe',
  lualatex: 'lualatex.exe',
  latexmk: 'latexmk.exe',
  bibtex: 'bibtex.exe',
  biber: 'biber.exe',
  synctex: 'synctex.exe',
  chktex: 'chktex.exe',
  latexdiff: 'latexdiff.exe',
  kpsewhich: 'kpsewhich.exe',
  mpm: 'mpm.exe',
  tlmgr: 'tlmgr.bat',
  pdftocairo: 'pdftocairo.exe',
  pdftoppm: 'pdftoppm.exe',
  pdftohtml: 'pdftohtml.exe',
  pdftotext: 'pdftotext.exe',
  pdfinfo: 'pdfinfo.exe',
  mgs: 'mgs.exe'
};

const CANDIDATE_DIRS = () => {
  const dirs = [];
  const local = process.env.LOCALAPPDATA || '';
  const appdata = process.env.APPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  dirs.push(path.join(local, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'));
  dirs.push(path.join(pf, 'MiKTeX', 'miktex', 'bin', 'x64'));
  dirs.push(path.join(pf86, 'MiKTeX', 'miktex', 'bin'));
  dirs.push(path.join(appdata, 'MiKTeX', 'miktex', 'bin', 'x64'));
  dirs.push(path.join(local, 'Programs', 'TinyTeX', 'bin', 'windows'));
  dirs.push(path.join(local, 'TinyTeX', 'bin', 'windows'));
  dirs.push(path.join(appdata, 'TinyTeX', 'bin', 'windows'));
  dirs.push('C:\\texlive\\2026\\bin\\windows');
  dirs.push('C:\\texlive\\2025\\bin\\windows');
  dirs.push('C:\\texlive\\2024\\bin\\windows');
  dirs.push('C:\\texlive\\2023\\bin\\windows');
  dirs.push('C:\\Program Files\\texlive\\2025\\bin\\windows');
  dirs.push('C:\\Program Files\\texlive\\2024\\bin\\windows');
  dirs.push('C:\\strawberry\\c\\texlive\\2024\\bin\\windows');
  return dirs;
};

function findInPath(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of [bin, bin.replace(/\.exe$/i, '.bat'), bin.replace(/\.exe$/i, '')]) {
      try {
        const full = path.join(dir, name);
        if (fs.existsSync(full)) return full;
      } catch {}
    }
  }
  return '';
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function parseMpmList(text){
  const names=[];
  for(const line of text.split(/\r?\n/).map(value=>value.trim())){
    const row=line.match(/^(true|false|i|u|-)\s+\d+\s+\d+\s+([a-zA-Z0-9@_.-]+)$/i);
    if(row){if(/^(true|i)$/i.test(row[1]))names.push(row[2]);continue;}
    if(/^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/.test(line)&&!/^(true|false|listing|packages?|mpm|usage|warning|error)$/i.test(line))names.push(line);
  }
  return names;
}

class TexEnv {
  constructor(store, userDataDir) {
    this.store = store;
    this.cacheFile = path.join(userDataDir, 'tex-cache.json');
    this.cache = this._readCache();
    this.binDir = '';
    this.tools = {};
    this.distro = '';
    this.env = null;
  }

  _readCache() {
    try {
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch {
      return {};
    }
  }

  _writeCache() {
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch {}
  }

  _binDirFrom(exePath) {
    return exePath ? path.dirname(exePath) : '';
  }

  detect() {
    const configured = (this.store.get('tex.binPath') || '').trim();
    const found = {};
    let binDir = '';
    if (configured && exists(path.join(configured, 'xelatex.exe'))) {
      binDir = configured;
    } else if (configured && exists(configured)) {
      binDir = configured;
    } else {
      const inPath = findInPath('xelatex.exe') || findInPath('pdflatex.exe') || findInPath('lualatex.exe');
      if (inPath) binDir = path.dirname(inPath);
      else {
        for (const dir of CANDIDATE_DIRS()) {
          if (exists(path.join(dir, 'xelatex.exe')) || exists(path.join(dir, 'pdflatex.exe'))) {
            binDir = dir;
            break;
          }
        }
      }
    }
    for (const [key, bin] of Object.entries(ENGINE_BINARIES)) {
      found[key] = '';
      if (binDir && exists(path.join(binDir, bin))) found[key] = path.join(binDir, bin);
      else if (!binDir) found[key] = findInPath(bin);
      if (!found[key] && key === 'pdftocairo') {
        const alt = findInPath('pdftocairo.exe');
        if (alt) found[key] = alt;
      }
    }
    // mpm/tlmgr may live next to engines under different names
    if (!found.tlmgr && binDir && exists(path.join(binDir, 'tlmgr.exe'))) found.tlmgr = path.join(binDir, 'tlmgr.exe');
    if (!found.mgs) {
      const alt = findInPath('gswin64c.exe');
      if (alt) found.mgs = alt;
    }
    this.binDir = binDir;
    this.tools = found;
    this.distro = this._detectDistro(binDir);
    const installation=path.resolve(binDir||'.').toLowerCase()+'|'+this.distro;
    if(this.cache.installation!==installation){
      for(const key of ['packages','packagesAt','sty','styAt','version'])delete this.cache[key];
      this.cache.installation=installation;
      this._writeCache();
    }
    this.env = this._buildEnv();
    return this.info();
  }

  _detectDistro(binDir) {
    if (!binDir) return 'none';
    const lower = binDir.toLowerCase();
    if (lower.includes('tinytex')) return 'tinytex';
    if (lower.includes('texlive')) return 'texlive';
    if (lower.includes('miktex') || exists(path.join(binDir, 'mpm.exe')) || exists(path.join(binDir, 'miktex-console.exe'))) {
      return 'miktex';
    }
    if (exists(path.join(binDir, 'tlmgr.bat')) || exists(path.join(binDir, 'tlmgr.exe')) || lower.includes('texlive')) {
      return 'texlive';
    }
    return 'unknown';
  }

  _buildEnv() {
    const env = {};
    if (this.binDir) {
      env.PATH = this.binDir + path.delimiter + (process.env.PATH || '');
    }
    env.TEXMFVAR = env.TEXMFVAR || process.env.TEXMFVAR;
    // Avoid interactive prompts / hangs
    env.MIKTEX_AUTOINSTALL = this.store.get('build.autoInstallMissing') === 'auto' ? '1' : '0';
    env.TEXMFCONFIG = process.env.TEXMFCONFIG;
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    return env;
  }

  get(name) {
    return this.tools[name] || '';
  }

  packageManager(){
    const name=this.distro==='miktex'?'mpm':['texlive','tinytex'].includes(this.distro)?'tlmgr':'';
    return name&&this.tools[name]?{name,exe:this.tools[name]}:null;
  }

  info() {
    const tools = this.tools;
    return {
      distro: this.distro,
      binDir: this.binDir,
      engines: {
        xelatex: !!tools.xelatex,
        pdflatex: !!tools.pdflatex,
        lualatex: !!tools.lualatex,
        latexmk: !!tools.latexmk,
        bibtex: !!tools.bibtex,
        biber: !!tools.biber
      },
      tools: {
        synctex: tools.synctex,
        chktex: tools.chktex,
        latexdiff: tools.latexdiff,
        pdftocairo: tools.pdftocairo,
        pdftoppm: tools.pdftoppm,
        mgs:tools.mgs,
        pdftohtml: tools.pdftohtml,
        pdfinfo: tools.pdfinfo,
        pdftotext: tools.pdftotext,
        kpsewhich: tools.kpsewhich,
        mpm: tools.mpm,
        tlmgr: tools.tlmgr
      },
      version: this.cache.version || ''
    };
  }

  async version() {
    const installation=this.cache.installation;
    const exe = this.tools.xelatex || this.tools.pdflatex;
    if (!exe) return '';
    const out = await capture(exe, ['--version'], { timeout: 15000, env: this.env });
    const first = out.split(/\r?\n/).find((l) => /TeX|version/i.test(l)) || out.split(/\r?\n/)[0] || '';
    return installation===this.cache.installation?first.trim().slice(0, 120):'';
  }

  /** Installed LaTeX packages, cached for a day. */
  async packages(force = false) {
    const now = Date.now();
    if (!force && this.cache.packages && now - (this.cache.packagesAt || 0) < 86400000) {
      return this.cache.packages;
    }
    let names = [];
    const installation=this.cache.installation;
    const manager=this.packageManager();
    if(!manager)return [];
    try {
      if (manager.name==='mpm') {
        const result=await run(manager.exe,['--list'],{timeout:60000,env:this.env});
        if(result.code!==0)throw Error(result.output||'mpm 查询失败');
        const out=result.file?await fsp.readFile(result.file,'utf8'):result.output;
        names = parseMpmList(out);
      } else {
        const result = await run(manager.exe, ['info', '--only-installed', '--data', 'name'], {
          timeout: 90000,
          env: this.env
        });
        if(result.code!==0)throw Error(result.output||'tlmgr 查询失败');
        const out=result.file?await fsp.readFile(result.file,'utf8'):result.output;
        names = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[a-zA-Z0-9@_\-.]+$/.test(l));
      }
    } catch (err) {
      console.warn('[tex] package list failed', err.message);
      return installation===this.cache.installation?(this.cache.packages||[]):[];
    }
    if(installation!==this.cache.installation)return [];
    names = Array.from(new Set(names)).sort();
    this.cache.packages = names;
    this.cache.packagesAt = now;
    this._writeCache();
    return names;
  }

  /** Public per-package metadata, used by the Packages settings panel. */
  async searchPackages(query = '', limit = 200) {
    const list = await this.packages();
    const q = query.toLowerCase();
    const hits = q ? list.filter((n) => n.toLowerCase().includes(q)) : list;
    return { total: list.length, items: hits.slice(0, limit) };
  }

  async installPackage(name, mirrorOverride) {
    const policy = this.store.get('build.autoInstallMissing', 'ask');
    const mirror = mirrorOverride || this.store.get('build.mirror', '');
    const pkg = String(name || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9@_\-.]*$/.test(pkg)) return { ok: false, error: '非法宏包名' };
    if(policy==='never')return {ok:false,error:'当前设置为“仅提示不安装”'};
    const manager=this.packageManager();
    if (!manager) {
      return { ok: false, error: '未找到当前 TeX 发行版的宏包管理器（TeX Live / TinyTeX：tlmgr；MiKTeX：mpm）' };
    }
    let args;
    let exe;
    if (manager.name==='mpm') {
      exe = manager.exe;
      args = ['--install', pkg];
      // A CTAN root is not an MPM package repository. Keep MiKTeX's own mirror in that case.
      if (mirror && /miktex\/tm\/packages/i.test(mirror)) args.push('--repository', mirror);
    } else {
      exe = manager.exe;
      args = ['install', pkg];
    }
    const res = await run(exe, args, { timeout: 300000, env: this.env });
    const ok = res.code === 0;
    if(ok){delete this.cache.packages;delete this.cache.packagesAt;delete this.cache.sty;delete this.cache.styAt;this._writeCache();}
    return { ok, code: res.code, output: res.output.slice(-8000), error: ok ? '' : res.output.split(/\r?\n/).slice(-6).join('\n') };
  }

  /** Windows fonts via registry (avoids spawning PowerShell). */
  async fonts(force = false) {
    const now = Date.now();
    if (!force && this.cache.fonts && now - (this.cache.fontsAt || 0) < 86400000) return this.cache.fonts;
    const names = new Set();
    const regQuery = async (key) => {
      const out = await capture('reg', ['query', key], { timeout: 15000 });
      return out;
    };
    const parse = (text) => {
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s{4}(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/);
        if (!m) continue;
        let name = m[1];
        name = name.replace(/\s*\((TrueType|OpenType|Type 1|TrueType Collection)\)\s*$/i, '').trim();
        if (name) names.add(name);
      }
    };
    parse(await regQuery('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'));
    parse(await regQuery('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Fonts'));

    const list = Array.from(names).sort((a, b) => a.localeCompare(b));
    const CJK = /(宋体|黑体|楷体|仿宋|微软雅黑|等线|新宋|幼圆|隶书|华文|方正|汉仪|思源|SimSun|SimHei|KaiTi|FangSong|YaHei|DengXian|NSimSun|STSong|STKaiti|STHeiti|STFangsong|STXihei|MingLiU|PMingLiU|JhengHei|Source Han|Noto (Sans|Serif) (CJK|SC|TC)|WenQuanYi|Hanzi|LXGW|Zhuque|Alibaba|HarmonyOS|MiSans|OPPO|SmileySans|DingTalk|Fandol)/i;
    const MONO = /(Mono|Consolas|Courier|Code|Cascadia|Fixed|Terminal|Console|Menlo|Inconsolata|Hack|Iosevka|Fira|JetBrains)/i;
    const result = list.map((name) => {
      let kind = 'latin';
      if (CJK.test(name)) kind = 'cjk';
      else if (MONO.test(name)) kind = 'mono';
      return { name, kind };
    });
    // Deduplicate and add well-known families in case the registry is sparse.
    const extra = [
      ['Microsoft YaHei', 'cjk'], ['SimSun', 'cjk'], ['SimHei', 'cjk'], ['KaiTi', 'cjk'],
      ['FangSong', 'cjk'], ['DengXian', 'cjk'], ['Source Han Sans SC', 'cjk'], ['Noto Sans SC', 'cjk'],
      ['Times New Roman', 'latin'], ['Arial', 'latin'], ['Georgia', 'latin'], ['Cambria', 'latin'],
      ['Palatino Linotype', 'latin'], ['Book Antiqua', 'latin'], ['Segoe UI', 'latin'],
      ['Consolas', 'mono'], ['Cascadia Code', 'mono'], ['Cascadia Mono', 'mono'],
      ['Courier New', 'mono'], ['JetBrains Mono', 'mono'], ['Fira Code', 'mono']
    ];
    const have = new Set(result.map((f) => f.name.toLowerCase()));
    for (const [name, kind] of extra) {
      if (!have.has(name.toLowerCase())) result.push({ name, kind });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    this.cache.fonts = result;
    this.cache.fontsAt = now;
    this._writeCache();
    return result;
  }

  /** Local package database for completion of \usepackage{...} */
  async packageNames() {
    const list = await this.packages();
    return list;
  }

  /** Search .sty names actually present on the filesystem (fast fallback). */
  async styFiles(limit = 3000) {
    if (this.cache.sty && Date.now() - (this.cache.styAt || 0) < 86400000) return this.cache.sty;
    const installation=this.cache.installation;
    const out = [];
    const roots = [];
    if (this.tools.kpsewhich) {
      const val = await capture(this.tools.kpsewhich, ['-var-value', 'TEXMFDIST'], { timeout: 20000, env: this.env });
      const dist = val.trim().split(/\r?\n/).pop();
      if (dist && exists(dist)) roots.push(dist);
    }
    for (const root of roots) {
      const walk = async (dir, depth) => {
        if (depth > 5 || out.length > limit) return;
        let entries = [];
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (out.length > limit) return;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full, depth + 1);
          else if (e.name.endsWith('.sty')) {
            const base = path.basename(e.name, '.sty');
            if (!out.includes(base)) out.push(base);
          }
        }
      };
      await walk(root, 0);
    }
    if(installation!==this.cache.installation)return [];
    this.cache.sty = out;
    this.cache.styAt = Date.now();
    this._writeCache();
    return out;
  }
}

module.exports = { TexEnv, parseMpmList };
