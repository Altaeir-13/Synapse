# DeepsProxy

Proxy API local compatível com OpenAI que roteia requisições para modelos DeepSeek, com integração de automação de navegador via Playwright para execução de ferramentas e interações web.


[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.0-green)](https://hono.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-blueviolet)](https://playwright.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

---

> [!TIP]
> **🚀 Novo por aqui ou não é programador?** 
> Preparamos um guia passo a passo com imagens e painel visual para você. **[Clique aqui para ler o Tutorial de Iniciantes (TUTORIAL.md)](./TUTORIAL.md)**.

---

## 🙏 Créditos e Projeto Original

Este projeto é uma versão expandida e refatorada do **[DeepsProxy original](https://github.com/pedrofariasx/deepsproxy)** criado por **Pedro Farias (@pedrofariasx)**.  
Gostaríamos de expressar nossa profunda gratidão ao desenvolvedor original por criar a fundação e o mecanismo inovador de bridge via Playwright que tornou este ecossistema possível. Todo o crédito pela ideia base e proxy inicial do DeepSeek pertence a ele.

## 🔄 O que mudou nesta versão?

Esta versão transformou a ferramenta focada em DeepSeek em um gateway multi-provedor com arquitetura escalável:

- **🤖 Suporte Multi-Modelos**: Integramos suporte nativo para **Kimi (Moonshot)**, **GLM (Zhipu)**, **HuggingFace** e **MiMo (Xiaomi)** trabalhando paralelamente ao DeepSeek.
- **🏗️ Arquitetura Domain-Driven (DDD)**: O código-fonte foi completamente reorganizado. Saímos de uma estrutura plana para uma separação limpa em domínios (`api/`, `core/`, `providers/`, `shared/` e `tools/`), adotando padrões de nível Enterprise.
- **🔒 Segurança e Isolamento Aprimorados**: Regras rígidas adicionadas ao `.gitignore` e reposicionamento de artefatos temporários para garantir que cookies de sessão do Playwright e tokens nunca vazem no GitHub.
- **⚙️ Tipagem Estrita**: Refatoramos e unificamos todas as interfaces TypeScript (ex: `ParsedCompletion`, `Provider`) para assegurar 100% de compatibilidade e segurança de tipos nas respostas da OpenAI API spec em todos os provedores.

---

## ✨ Features

- **OpenAI API Compatible**: Interface compatível com `/v1/chat/completions` e `/v1/models`
- **Tool Execution**: Sistema de ferramentas executáveis via Playwright
- **Session Persistence**: Login persistente com armazenamento de perfil do navegador
- **Authentication**: Suporte opcional a API Key via header `Authorization` ou `X-API-Key`
- **Type-Safe**: Código 100% TypeScript com strict mode
- **Docker Ready**: Deploy simplificado com Docker Compose

---

## 🏗️ Arquitetura

```mermaid
graph TD
    Client["Cliente OpenAI/SDK"] -->|HTTPS| Proxy["DeepsProxy"]
    Proxy -->|"Router /v1/chat"| Engine["Core Engine"]
    
    subgraph "Vault (Segurança AES-256-GCM)"
        Password["Senha Mestra"] --> VaultCore["Descriptografia em Memória"]
        EnvEnc[".env.enc"] --> VaultCore
        ProfEnc["*_profile.enc"] --> VaultCore
        VaultCore -.->|"Extrai perfis para RAM"| Playwright["Playwright Service"]
        VaultCore -.->|"Injeta variáveis"| Engine
    end
    
    Engine -->|"Seleciona dinamicamente"| Providers
    
    subgraph "Providers LLM (Integrações)"
        Providers --> DS["DeepSeek"]
        Providers --> Kimi["Kimi / Moonshot"]
        Providers --> GLM["Zhipu GLM"]
        Providers --> MiMo["Xiaomi MiMo"]
        Providers --> HF["HuggingFace"]
    end

    Providers --> Playwright
    Playwright -->|"Coleta Headers/Cookies via CDP"| Browser["Headless Chromium"]
    Browser -.->|"Retorna Auth Headers"| Providers
    Providers -->|"Node Fetch (Seguro/Isolado)"| APIExterna["APIs de IA (Web)"]
```

---

## 📋 Pré-requisitos

| Dependência | Versão Mínima | Instalação |
|------------|--------------|-----------|
| Node.js | v20.x | [nvm](https://github.com/nvm-sh/nvm) |
| npm | v9.x | Incluído com Node.js |
| Playwright | - | `npx playwright install` |
| Docker (opcional) | v24.x | [Docker Docs](https://docs.docker.com/get-docker/) |

---

## 🚀 Instalação

### Via npm

```bash
# Clonar repositório
git clone https://github.com/pedrofariasx/deepsproxy.git
cd deepsproxy

# Instalar dependências
npm install

# Instalar browsers do Playwright
npx playwright install
```

### Via Docker

```bash
# Build da imagem
docker-compose build

# Iniciar containers
docker-compose up -d
```

---

## ⚙️ Configuração

Você pode configurar o projeto através de um arquivo `.env` na raiz do projeto. 

> [!TIP]
> Se você não configurar uma `API_KEY` no seu `.env`, o sistema **não** ficará vulnerável. Na primeira vez que você iniciar, ele irá gerar automaticamente uma chave de 48 caracteres altamente segura e exibi-la no terminal para que você a salve.

Exemplo de `.env`:
```env
# Porta do servidor (default: 3000)
PORT=3000

# Chave de API para proteger endpoints (Será gerada automaticamente se omitida)
API_KEY=sua-chave-secreta-aqui

# Provedores Ativos (ex: deepseek, kimi, glm, mimo, huggingface)
ACTIVE_PROVIDERS=deepseek,huggingface

# Configurações Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
```

> [!CAUTION]
> **Vault de Segurança**: Após efetuar os logins (via Dashboard ou comando `npm run login`), você deve executar `npm run setup-vault` para criptografar seu `.env` e suas sessões do navegador em arquivos `.enc`. Isso protege suas chaves e cookies contra malwares e acessos não autorizados. Após rodar o setup, o `.env` em texto plano será excluído e você precisará digitar sua senha mestra sempre que iniciar o servidor. Seus arquivos criptografados não vazarão no GitHub graças às regras rígidas do `.gitignore`.

### 🖥️ Dashboard (Interface Gráfica)
O DeepsProxy agora possui um **Dashboard Local** para facilitar sua vida. 
Ao iniciar o projeto com `npm start`, acesse `http://127.0.0.1:3000/` no seu navegador.
Lá você poderá:
- Ver o status do seu Servidor e do seu Cofre (Vault).
- Realizar o Login em qualquer um dos provedores de IA apenas clicando em um botão (sem precisar usar o terminal).
- Configurar a Senha Mestra do Vault.

> [!NOTE]
> Por questões rigorosas de segurança, o Dashboard possui uma trava de rede. Ele só pode ser acessado a partir de `127.0.0.1` (seu próprio computador). Requisições de outros IPs na sua rede serão sumariamente bloqueadas com `403 Forbidden` para evitar roubo da sua Senha Mestra.

### Variáveis de Ambiente

| Variável | Descrição | Default | Obrigatória |
|----------|-----------|---------|------------|
| `PORT` | Porta HTTP do servidor | `3000` | Não |
| `API_KEY` | Chave para autenticação de requests | Gerada automaticamente | Não |
| `PLAYWRIGHT_HEADLESS` | Executar browser em modo headless | `true` | Não |
| `PLAYWRIGHT_TIMEOUT` | Timeout para operações do Playwright (ms) | `30000` | Não |

---

## 🔐 Autenticação

Se `API_KEY` estiver configurada, todas as requisições devem incluir uma das opções:

```bash
# Via Bearer Token
curl -H "Authorization: Bearer sua-chave" http://localhost:3000/v1/chat/completions

# Via X-API-Key header
curl -H "X-API-Key: sua-chave" http://localhost:3000/v1/chat/completions
```

Resposta para autenticação falha:
```json
{ "error": "Unauthorized" }
```
Status: `401`

---

## 📡 API Reference

### Health Check

```http
GET /health
```

**Response** `200 OK`:
```json
{ "status": "ok" }
```

---

### List Models

```http
GET /v1/models
```

**Response** `200 OK`:
```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-v4-flash",
      "object": "model",
      "created": 1715616000,
      "owned_by": "deepseek"
    },
    {
      "id": "deepseek-v4-flash-thinking",
      "object": "model",
      "created": 1715616000,
      "owned_by": "deepseek"
    },
    {
      "id": "deepseek-v4-pro",
      "object": "model",
      "created": 1715616000,
      "owned_by": "deepseek"
    },
    {
      "id": "deepseek-v4-pro-thinking",
      "object": "model",
      "created": 1715616000,
      "owned_by": "deepseek"
    }
  ]
}
```

---

### Chat Completions

```http
POST /v1/chat/completions
Content-Type: application/json
```

**Request Body**:
```json
{
  "model": "deepseek-flash-thinking",
  "messages": [
    { "role": "user", "content": "Qual é a previsão do tempo?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Obter previsão do tempo",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto",
  "stream": false
}
```

**Response** `200 OK`:
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715616000,
  "model": "deepseek-flash-thinking",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "A previsão para São Paulo é de 24°C com sol.",
        "tool_calls": []
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 23,
    "total_tokens": 68
  }
}
```

---

## 💻 Exemplos de Uso

### cURL

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-flash-thinking",
    "messages": [{"role": "user", "content": "Olá!"}]
  }'
```

### OpenAI SDK (Node.js)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: process.env.API_KEY || 'sk-no-key-required'
});

const completion = await openai.chat.completions.create({
  model: 'deepseek-thinking',
  messages: [{ role: 'user', content: 'Explique TypeScript' }]
});

console.log(completion.choices[0].message.content);
```

### Python (openai library)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-no-key-required"
)

response = client.chat.completions.create(
    model="deepseek-thinking",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

---

## 🔧 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia o servidor e solicita a Senha Mestra do Vault |
| `npm run setup-vault` | Criptografa o `.env` e pastas `*_profile/` para proteger dados contra malwares |
| `npm run login:<provider>` | Executa fluxo de login (`ds`, `kimi`, `glm`, `mimo`, `hf`) |
| `npm test` | Executa suite de testes |
| `npm run build` | Compila TypeScript para `dist/` |
| `npx playwright install` | Instala browsers para automação |

---

## 📁 Estrutura do Projeto

```
deepsproxy/
├── src/
│   ├── __tests__/           # Testes automatizados
│   ├── api/                 # Rotas Web (Hono)
│   ├── core/                # Motor principal e Vault (Segurança AES-256)
│   ├── providers/           # Integrações LLM (DeepSeek, Kimi, GLM, etc.)
│   ├── scripts/             # Scripts utilitários (Login, Setup Vault)
│   ├── shared/              # Schemas e lógicas compartilhadas
│   ├── tools/               # Registro e Parse de Tool Calls
│   ├── app.ts               # Configuração global da API
│   └── index.ts             # Boot do servidor
├── docker-compose.yml       # Orquestração multi-container
├── Dockerfile               # Imagem Docker otimizada
├── tsconfig.json            # Configuração TypeScript
├── package.json             # Dependências e scripts
├── .env.enc                 # Cofre de Ambiente Criptografado (Vault)
└── *_profile.enc            # Sessões de Navegador Criptografadas (Vault)
```

---

## 🐳 Docker

### docker-compose.yml

```yaml
services:
  deepsproxy:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - PLAYWRIGHT_HEADLESS=true
    volumes:
      - ./deepseek_profile:/app/deepseek_profile
      - ./kimi_profile:/app/kimi_profile
      - ./glm_profile:/app/glm_profile
      - ./mimo_profile:/app/mimo_profile
    cap_add:
      - SYS_ADMIN
    restart: unless-stopped
```

### Build e Execução

```bash
# Build
docker-compose build

# Executar em background
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar
docker-compose down
```

---

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar com watch mode
npm run test:watch

# Executar testes específicos
npm test -- src/index.test.ts

# Coverage report
npm run test:coverage
```

---

## 🔍 Troubleshooting

### Playwright não inicializa

```bash
# Reinstalar browsers
npx playwright install --with-deps

# Verificar dependências do sistema
npx playwright install-deps
```

### Erro de autenticação

- Verifique se `API_KEY` no `.env` corresponde ao header enviado
- Teste sem `API_KEY` configurada para isolar o problema

### Timeout em requests

- Aumente `PLAYWRIGHT_TIMEOUT` no `.env`
- Verifique conectividade com a API DeepSeek
- Considere executar com `PLAYWRIGHT_HEADLESS=false` para debug visual

### Sessão não persiste

- Certifique-se que `deepseek_profile/` tem permissões de escrita
- Execute `npm run login` para renovar a sessão

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch para sua feature: `git checkout -b feature/minha-feature`
3. Commit suas mudanças: `git commit -m 'feat: adiciona minha feature'`
4. Push para a branch: `git push origin feature/minha-feature`
5. Abra um Pull Request

### Guidelines de Código

- Siga o padrão TypeScript strict
- Adicione testes para novas funcionalidades
- Mantenha compatibilidade com OpenAI API spec

---

## 📄 License

Distribuído sob licença ISC. Veja `LICENSE` para mais informações.

---

## ⚠️ Disclaimer

> Este projeto é fornecido estritamente para fins educacionais e de pesquisa.

### Hardening de Segurança Local
Para garantir a máxima proteção da máquina local:
- **Sandbox do Chromium**: O Playwright roda *com* a sandbox habilitada. Por este motivo, para rodar no Docker, o parâmetro `cap_add: [SYS_ADMIN]` é obrigatório no `docker-compose.yml`.
- **Network Binding**: O servidor é blindado para rodar nativamente apenas em `127.0.0.1` (localhost). Nenhuma rede externa consegue acessar a porta, prevenindo vazamentos em redes Wi-Fi públicas.
- **Strict CORS**: O sistema bloqueia requisições CSRF/SSRF. Apenas origens provenientes de `localhost` podem disparar a API no navegador.
- **Timing Attacks**: A validação de `API_KEY` utiliza `crypto.timingSafeEqual` mitigando ataques de força bruta por tempo.

Os autores não incentivam ou endossam:
- Uso indevido ou malicioso
- Automação não autorizada de serviços terceiros
- Violação de Termos de Serviço de plataformas
- Atividades que violem leis ou regulamentações aplicáveis

Usuários são integralmente responsáveis pelo uso deste software, incluindo conformidade com leis, regulamentos e contratos de serviço aplicáveis.

Este repositório demonstra conceitos relacionados a:
- Automação de navegadores com Playwright
- Gerenciamento de sessões e autenticação
- Arquiteturas de runtime compatíveis com OpenAI
- Padrões de proxy e roteamento de API

**Use por sua conta e risco.**
