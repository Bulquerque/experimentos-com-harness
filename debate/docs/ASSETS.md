# Inventário e política de assets v15

**Fonte de verdade:** `app/assets/trio/manifest.json` — 37 sequências de Lia, Dante e Elias, 210 quadros/retratos PNG distintos referenciados. Alguns quadros reaparecem em mais de uma sequência (não são cópias extras).

A versão anterior continha `assets/master/` (530 arquivos históricos/duplicados; cerca de 82 MiB), além de 2 atlas de origem, 13 efeitos duplicados antigos e 28 ângulos/quadros experimentais não usados. Esses arquivos foram **excluídos do pacote executável**, mas permanecem no ZIP original v14 se for necessário recuperá-los depois. Nenhum dos 210 PNGs ativos do manifesto foi excluído.

Além dos 210 quadros ativos, existem pequenos retratos estáticos de fallback (16 expressões e 16 olhos), fundos e camadas de efeitos WebP, e o MP3 de Objection! fornecido pelo usuário. O código pode usar esses arquivos sem depender da biblioteca removida.

### Regras

1. Antes de excluir um sprite, confira `npm run audit:assets` e o `manifest.json`.
2. Não editar nomes de frames sem atualizar o manifesto.
3. Novos assets ficam em `app/assets/trio/personagens/` se forem sequências, ou nos diretórios `scenes/`, `fx/` e `ui/` conforme o tipo.
4. O catálogo em `/catalog.html` mostra cada sequência que realmente está instalada; não inclui assets de arquivo morto.
5. As capturas de QA ficam em `docs/screenshots/` e não são carregadas no runtime.
