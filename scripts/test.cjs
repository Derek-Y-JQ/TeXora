const fs=require('node:fs');const path=require('node:path');
const tmp=path.resolve('.tmp/tests');fs.mkdirSync(tmp,{recursive:true});process.env.TEMP=tmp;process.env.TMP=tmp;
const {spawnSync}=require('node:child_process');
const environmentTest=spawnSync(process.execPath,['tests/test-environment-input.mjs'],{stdio:'inherit'});if(environmentTest.status!==0)process.exit(environmentTest.status??1);
const files=["tests/test-punctuation.mjs", "tests/test-131.mjs", "tests/test-external-links.mjs", "tests/test-updater.cjs", "tests/test-current-fixes.mjs", "tests/test-133.mjs", "tests/test-134.mjs", "tests/test-135.mjs", "tests/test-math-input.mjs", "tests/test-overleaf.cjs", "tests/test-overleaf-session.cjs", "tests/test-overleaf-ot.cjs", "tests/test-overleaf-live.cjs", "tests/test-140.cjs", "tests/test-pdf-raster.cjs", "tests/test-143.mjs", "tests/test-143-diagnostics.cjs", "tests/test-i18n.cjs", "tests/test-200.cjs"];
for(const file of files){const r=spawnSync(process.execPath,[file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
const r=spawnSync(process.execPath,['--test','tests/preview-state.test.mjs','tests/security.test.cjs','tests/protocols.test.cjs','tests/codex-login.test.cjs','tests/agent-models.test.cjs'],{stdio:'inherit'});process.exit(r.status??1);
