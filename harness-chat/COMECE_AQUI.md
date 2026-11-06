# COMECE AQUI — Harness Chat

1. No Linux/macOS com Docker, inicie Docker Engine. No Fedora, Podman rootless também é suportado pelo `start.sh` (requer `podman-compose`).
2. Execute **`./start.ps1`** (Windows PowerShell) ou **`./start.sh`** (Linux/macOS). O Harness Chat fica isolado em **http://127.0.0.1:8787**; o Contraponto continua em **http://127.0.0.1:3000**.
3. Abra **http://127.0.0.1:8787**. O modelo padrão nesta instalação é `z-ai/glm-5.3-flash` (GLM 5.3 Flash).
4. Clique em **Configurações**. Digite sua chave NVIDIA temporária ou salve `NVIDIA_API_KEY` no arquivo `.env`, depois teste a conexão.
5. Escolha **Agente** e diga: “Leia `numerical/newton.py`, execute os testes e explique o método”.
6. Para Lean: “Crie uma prova em `proofs/` e verifique com `lean_core`”.

Se não houver Docker, o chat pode ser acessado via `npm start` com Node 22.16+, mas o runner Python/Lean não estará disponível. Para rodar os testes locais, use `./check.sh`.

**O ZIP não inclui chaves API, não requer npm install para iniciar pelo Docker e mantém o frontend estático sem bibliotecas externas.**
