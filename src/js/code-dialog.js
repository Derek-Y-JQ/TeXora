import { ctx } from './ctx.js';
import { icon, escapeHtml, toast } from './util.js';
import { LANGUAGES, ALGORITHM_PARTS, blockSource, packageInsertion } from './code-blocks.js';

export function openCodeDialog(kind = 'code') {
  const target = ctx.editor.model, rootFile = ctx.state.project.rootFile, projectRoot = ctx.state.project.root;
  if (!target || !rootFile) return toast({type:'warn',title:'请先打开 LaTeX 项目和目标文件'});
  const range = ctx.editor.editor.getSelection(), selected = target.getValueInRange(range), targetVersion = target.getVersionId();
  const algorithm = kind === 'algorithm';
  const initial = selected || (algorithm ? '\\Require Input data $X$\n\\Ensure Result $y$\n\\State $s \\gets 0$\n\\For{$i=1,\\ldots,n$}\n  \\State $s \\gets s+x_i$\n\\EndFor\n\\State \\Return $s$' : 'def mean(values):\n    return sum(values) / len(values)');
  let busy = false, closed = false, generation = 0;
  return ctx.dialogs.modal({
    title:algorithm ? '插入伪代码块' : '插入代码块', subtitle:'编辑内容、检查环境后，一键插入；缺少的宏包自动加入主文档导言区',width:1080,height:'min(86vh, 820px)',className:'code-block-modal',
    body:`<div class="code-block-dialog">
      <div class="code-options"><label>排版方案<select class="input" id="codeBackend">${algorithm ? '<option value="algorithm">algorithm + algpseudocode</option>' : '<option value="listings">listings · 无 Python 依赖</option><option value="minted">minted · Pygments 高亮</option>'}</select></label>
      ${algorithm ? '' : `<label>代码语言<select class="input" id="codeLanguage">${LANGUAGES.map(([id,label])=>`<option value="${id}">${escapeHtml(label)}</option>`).join('')}</select></label>`}
      <label>标题<input class="input" id="codeCaption" placeholder="可选" /></label><label>标签<input class="input" id="codeLabel" placeholder="${algorithm?'alg':'lst'}:example" /></label>
      <label class="row"><input type="checkbox" id="codeNumbers" checked />显示行号</label></div>
      ${algorithm ? `<div class="algorithm-parts">${ALGORITHM_PARTS.map(([name],i)=>`<button class="btn btn-sm" data-algorithm-part="${i}">${escapeHtml(name)}</button>`).join('')}</div>` : ''}
      <div class="code-edit-grid"><label>编辑${algorithm?'算法步骤':'源码'}<textarea class="input input-mono" id="codeContent" spellcheck="false">${escapeHtml(initial)}</textarea></label><label>将插入的 LaTeX<pre class="code-block" id="codeGenerated"></pre></label></div>
      <div class="field-hint" id="codeDependency">正在检测本机环境…</div>
      <div class="field-hint" id="codeRuntimeNote">${algorithm?'点选流程组件可插入光标处；步骤可继续手工编辑。':'选择 minted 后会自动补齐 TeX 宏包与 Python 高亮工具；仅当前项目启用外部程序调用。网络或权限受限时保留内容，可切换 listings。'}</div>
    </div>`,
    foot:'<button class="btn btn-sm" id="codeClose">取消</button><span class="spacer"></span><button class="btn btn-sm" id="codePrepare">检查并修复环境</button><button class="btn btn-sm btn-primary" id="codeInsert">检查并插入</button>',
    onClose:()=>{closed=true;},
    onMount:({root,close})=>{
      const get=id=>root.querySelector('#'+id), backend=()=>algorithm?'listings':get('codeBackend').value;
      const source=()=>blockSource({kind,backend:backend(),language:get('codeLanguage')?.value || 'python',code:get('codeContent').value,caption:get('codeCaption').value,label:get('codeLabel').value,numbers:get('codeNumbers').checked});
      const preview=()=>{try{const result=source();get('codeGenerated').textContent=result.source; get('codeGenerated').dataset.valid='true';if(result.plainLanguage)get('codeRuntimeNote').textContent='listings 未内置该语言，本块使用保留源码的纯文本模式。需要彩色高亮可切换 minted。';}catch(error){get('codeGenerated').textContent=error.message;get('codeGenerated').dataset.valid='false';}};
      const status=async()=>{ const id=++generation;get('codeDependency').textContent='正在检测本机环境…';try{const s=await ctx.api.tex.codeStatus({kind,backend:backend()});if(id!==generation)return;get('codeDependency').textContent=s.ready?'已检测到所需依赖；插入前将实际试编译验证。':'需要配置：'+[...s.missing,...(!s.runtime?['Python / latexminted']:[])].join('、')+'。插入时自动安装并验证。';}catch(error){if(id===generation)get('codeDependency').textContent=error.message;} };
      for(const input of root.querySelectorAll('input,textarea,select')) input.addEventListener('input',preview);
      get('codeBackend').addEventListener('change',()=>{preview();status();});
      for(const button of root.querySelectorAll('[data-algorithm-part]')) button.onclick=()=>{const input=get('codeContent'),a=input.selectionStart,b=input.selectionEnd; const content=(a&&input.value[a-1]!=='\n'?'\n':'')+ALGORITHM_PARTS[Number(button.dataset.algorithmPart)][1]+'\n';input.setRangeText(content,a,b,'end');input.focus();preview();};
      const prepare=async(insert)=>{
        if(busy)return;let generated;try{generated=source();}catch(error){return toast({type:'warn',title:error.message});}
        busy=true;for(const button of root.querySelectorAll('button'))button.disabled=true;for(const input of root.querySelectorAll('input,textarea,select'))input.disabled=true;
        get('codeDependency').textContent='正在补齐依赖并试编译，首次安装可能需要几分钟…';
        try{
          const result=await ctx.api.tex.prepareCode({kind,backend:backend()});if(!result.ok)throw Error(result.error);if(closed)return;
          if(!insert){get('codeDependency').textContent='环境试编译成功，可以插入。';return;}
          if(ctx.state.project.root!==projectRoot||target.isDisposed()||ctx.editor.model!==target)throw Error('目标文档或项目已切换，请重新打开弹窗');
          const rootDoc=[...ctx.state.docs].find(([p])=>p.replace(/\\/g,'/').toLowerCase()===rootFile.replace(/\\/g,'/').toLowerCase())?.[1];
          const read=rootDoc?{ok:true,text:rootDoc.model.getValue()}:await ctx.api.fs.read(rootFile); if(!read.ok)throw Error('主文档读取失败');
          const dir=rootFile.replace(/[\\/][^\\/]+$/,'');let included='';const seen=new Set();
          const expand=async(text,depth=0)=>{if(depth>8)return;for(const match of text.replace(/(?<!\\)(?:\\\\)*%[^\n]*/g,'').matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)){let rel=match[1];if(!/\.tex$/i.test(rel))rel+='.tex';const file=dir+'/'+rel;if(seen.has(file))continue;seen.add(file);const doc=[...ctx.state.docs].find(([p])=>p.replace(/\\/g,'/')===file.replace(/\\/g,'/'))?.[1];const data=doc?{text:doc.model.getValue()}:await ctx.api.fs.read(file);if(data.text){included+='\n'+data.text;await expand(data.text,depth+1);}}};
          await expand(read.text.split('\\begin{document}')[0]);
          const patch=packageInsertion(read.text,generated.packages,included);
          if(closed || target.isDisposed() || target.getVersionId() !== targetVersion || ctx.state.project.root !== projectRoot) throw Error('原文或项目已变化，请重新打开弹窗后插入');
          let insertionRange=range;
          if(rootDoc?.model===target && target.getOffsetAt({lineNumber:range.startLineNumber,column:range.startColumn}) < patch.offset+'\\begin{document}'.length){
            if(!range.isEmpty())throw Error('不能用代码块替换导言区，请选择正文内容');
            const position=target.getPositionAt(patch.offset+'\\begin{document}'.length);
            insertionRange={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:position.column,endColumn:position.column};
          }
          const edit={range:insertionRange,text:'\n'+generated.source+'\n',forceMoveMarkers:true};
          ctx.editor.editor.pushUndoStop();
          if(rootDoc?.model===target){const pos=target.getPositionAt(patch.offset);ctx.editor.editor.executeEdits('insert-code',[...(patch.text?[{range:{startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:pos.column,endColumn:pos.column},text:patch.text}]:[]),edit]);}
          else{
            if(patch.text){if(rootDoc){const pos=rootDoc.model.getPositionAt(patch.offset);rootDoc.model.pushEditOperations([],[{range:{startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:pos.column,endColumn:pos.column},text:patch.text}],()=>null);}else{const text=read.text.slice(0,patch.offset)+patch.text+read.text.slice(patch.offset);const written=await ctx.api.fs.write(rootFile,text);if(!written.ok)throw Error(written.error || '导言区写入失败');}}
            ctx.editor.editor.executeEdits('insert-code',[edit]);
          }
          ctx.editor.editor.pushUndoStop();close();toast({type:'success',title:algorithm?'伪代码已插入':'代码块已插入',body:patch.text?'已补充主文档宏包':'已复用已有宏包'});
        }catch(error){get('codeDependency').textContent=error.message;toast({type:'warn',title:'未插入，内容已保留',body:error.message,timeout:8000});}
        finally{busy=false;for(const node of root.querySelectorAll('button,input,textarea,select'))node.disabled=false;}
      };
      get('codeClose').onclick=()=>{if(!busy)close();};get('codePrepare').onclick=()=>prepare(false);get('codeInsert').onclick=()=>prepare(true);preview();status();
    }
  });
}
