# Frontend QA v0.9

Testes estáticos e de interação com HTML/CSS/JS da versão padrão (não exigem NVIDIA ou Docker):

```sh
node --test qa/frontend-contract.test.mjs
python qa/visual_smoke.py
```

O smoke Playwright verifica quatro larguras (1440, 768, 390 e 320 pixels), dois destinos principais de navegação, quatro disclosures, apenas uma ferramenta avançada expandida por vez, editor Lean, prévia em modo mobile, demonstração sem evidências falsas, comandos avançados e ausência de overflow horizontal. As capturas de interface limpa estão em `docs/screenshots/studio-v09-1440.png` e `docs/screenshots/studio-v09-390.png`.

**Limites:** os testes visuais usam HTML incorporado no navegador. A conexão HTTP do backend é coberta separadamente por `apps/server/src/lean.test.ts`; dependências externas e credenciais não são testadas. Teste Docker real, Lean real e NVIDIA em sua máquina usando `verify-installation` e Configurações.
