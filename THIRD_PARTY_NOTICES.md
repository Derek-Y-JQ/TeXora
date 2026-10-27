# Third-party notices

TeXora bundles and/or invokes the following third-party components.
Each is distributed under its own license; this file is informational only.

## Bundled in the application package

| Component | Version | License | Use |
| --- | --- | --- | --- |
| Electron | 38.8.6 | MIT | Desktop runtime (Chromium + Node.js) |
| Chromium | bundled with Electron | BSD-3-Clause and others | Rendering engine |
| Node.js | bundled with Electron | MIT | Main-process runtime |
| KaTeX | 0.19.1 | MIT | Instant floating math previews |
| Monaco Editor | 0.57.0 | MIT | Source editor |
| Vite | 7.3.1 | MIT | Renderer bundler |
| electron-builder | 26.18.0 | MIT | Installer packaging |

Monaco Editor and Electron ship with their own `LICENSES.chromium.html` and
license files inside the installed application directory (`resources/`,
`LICENSE.electron.txt`, `LICENSES.chromium.html`).

## Invoked from the local TeX toolchain (not bundled)

TeXora calls tools from the user's own TeX distribution and system. No binaries
from these projects are redistributed with TeXora.

| Tool | Project | License |
| --- | --- | --- |
| `xelatex`, `pdflatex`, `lualatex`, `latexmk`, `bibtex`, `biber` | TeX Live / MiKTeX | GPL / LPPL and others |
| `synctex` | TeX Live / MiKTeX | MIT-like (SyncTeX) |
| `pdftoppm`, `pdftocairo`, `pdfinfo` | Poppler | GPL-2.0 |
| `chktex` | ChkTeX | GPL-2.0 |
| `latexdiff` | CTAN latexdiff | GPL |
| `mpm`, `miktex`, `tlmgr` | MiKTeX / TeX Live | respective licenses |
| Git | Git for Windows | GPL-2.0 |

## Fonts and assets

- The demo figure in `samples/demo/figures/spectrum.png` is generated for TeXora
  and may be used freely with the demo project.
- The application icon is an original TeXora asset.
- Documents produced by TeXora embed fonts according to the user's TeX setup;
  users are responsible for complying with the licenses of fonts they use.

## AI services

TeXora does not bundle any model. AI features call the endpoint configured by
the user (OpenAI, DeepSeek, Anthropic, Google, Moonshot or a compatible service)
and are subject to that provider's terms and privacy policy.

KaTeX copyright and license: [docs/licenses/KaTeX-LICENSE.txt](docs/licenses/KaTeX-LICENSE.txt).
