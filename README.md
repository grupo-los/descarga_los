# Descargas | Grupo LOS

Consulta de valores e regras de descarga por cliente.

- **App dos motoristas (este site):** pode ser instalado no celular e abre direto na consulta (somente leitura).
- **App da equipe:** o link normal do Apps Script (`.../exec`), protegido por senha, para pesquisar e editar.

## Estrutura

| Pasta / arquivo | Para que serve |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` | App instalável dos motoristas (GitHub Pages) |
| `config.js` | **Único arquivo para configurar**: o link do Apps Script |
| `apps-script/` | Cópia do código do Google Apps Script (`Code.gs`, `Index.html`, `Motorista.html`) |

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `descargas-los`).
2. Em **Add file → Upload files**, arraste todo o conteúdo desta pasta e clique em **Commit changes**.
3. Abra `config.js` no GitHub, clique no lápis e cole o link do App da Web (o que termina em `/exec`). Salve com **Commit changes**.
4. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
5. Em 1 a 2 minutos o site fica disponível em `https://SEU-USUARIO.github.io/descargas-los/`. É este link que vai para os motoristas.

## Como o motorista instala

- **Android (Chrome):** abre o link e toca em **Instalar** na faixa do topo (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** abre o link, toca em **Instalar** e segue as instruções: *Compartilhar → Adicionar à Tela de Início*.

O ícone do Grupo LOS aparece junto com os outros apps e abre direto na consulta.

## Atualizações

- **Valores e clientes:** mudam na planilha / no app da equipe e aparecem na hora para os motoristas. Não precisa mexer no GitHub.
- **Tela do motorista ou avisos:** são alterados no Apps Script (`Code.gs` e `Motorista.html`) e reimplantados com *Nova versão*. O app instalado pega a mudança sozinho.
- A pasta `apps-script/` é só uma cópia de segurança do código. Quando mudar algo no Apps Script, atualize a cópia aqui também.

## ⚠️ Segurança

Se o repositório for **público**, qualquer pessoa pode ler os arquivos. Por isso:

- **Nunca** salve aqui o `Code.gs` com as senhas reais de `USUARIOS` nem o `PIN_MOTORISTA`. A cópia deste repositório deve ficar com `TROQUE-ESTA-SENHA` e `PIN_MOTORISTA: ''`; as senhas reais ficam só no Apps Script.
- Se preferir, deixe o repositório **privado**. O GitHub Pages em repositório privado exige plano pago do GitHub.

## Gerar um APK para Android (opcional)

Com o site já publicado, entre em <https://www.pwabuilder.com>, cole o link do GitHub Pages e use **Package for stores → Android**. Ele gera o arquivo do app para instalar direto ou publicar na Play Store.
