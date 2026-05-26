# DeepsProxy

Proxy API local compatível com OpenAI que roteia requisições para modelos DeepSeek, com integração de automação de navegador via Playwright para execução de ferramentas e interações web.


[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.0-green)](https://hono.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-blueviolet)](https://playwright.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

---

> [!TIP]
> **🚀 Quer apenas usar o sistema de forma fácil?** 
> A documentação abaixo é focada na arquitetura e desenvolvimento do projeto. Se você quer apenas instalar e usar, preparamos um guia passo a passo com painel visual. **[Clique aqui para ler o Tutorial de Iniciantes (TUTORIAL.md)](./TUTORIAL.md)**.

---

## 🙏 Créditos e Projeto Original

Este projeto é uma versão expandida e refatorada do **[DeepsProxy original](https://github.com/pedrofariasx/deepsproxy)** criado por **Pedro Farias (@pedrofariasx)**.  
Gostaríamos de expressar nossa profunda gratidão ao desenvolvedor original por criar a fundação e o mecanismo inovador de bridge via Playwright que tornou este ecossistema possível. Todo o crédito pela ideia base e proxy inicial do DeepSeek pertence a ele.

## 🔄 O que mudou nesta versão?

Esta versão transformou a ferramenta focada em DeepSeek em um gateway multi-provedor com arquitetura escalável:

- **🤖 Suporte Multi-Modelos**: Integramos suporte nativo para **Kimi (Moonshot)**, **GLM (Zhipu)**, **HuggingFace** e **MiMo (Xiaomi)** trabalhando paralelamente ao DeepSeek.
- **🏗️ Arquitetura Domain-Driven (DDD)**: O código-fonte foi completamente reorganizado. Saímos de uma estrutura plana para uma separação limpa em domínios (`api/`, `core/`, `providers/`, `shared/` e `tools/`), adotando padrões de nível Enterprise.
- **🔒 Segurança e Isolamento Aprimorados**: Adicionado um sistema de "Vault" criptografado e bloqueios de IP para prevenir vazamento de credenciais.

---

## ✨ Features

- **OpenAI API Compatible**: Interface compatível com `/v1/chat/completions` e `/v1/models`
- **Tool Execution**: Sistema de ferramentas executáveis nativamente via Playwright
- **Session Persistence**: Login persistente com armazenamento de perfil do navegador
- **Type-Safe**: Código 100% TypeScript com strict mode

---

## 🏗️ Arquitetura do Sistema

O DeepsProxy atua como uma ponte (bridge) entre ferramentas que falam a linguagem da OpenAI (como Cursor, Cline, etc) e as interfaces web (chat) das inteligências artificiais.

```mermaid
graph TD
    Client["Cliente OpenAI/SDK"] -->|HTTPS| Proxy["DeepsProxy API"]
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

O fluxo ocorre da seguinte forma:
1. A requisição chega na API (Hono) no formato OpenAI.
2. O Core Engine identifica qual o provedor desejado (ex: `deepseek-v4-flash`).
3. O provedor solicita ao Playwright que recupere os cookies e os headers de autenticação da sessão do usuário salva no disco.
4. O provedor traduz a requisição para o formato proprietário da IA e faz a chamada via `fetch` direto na API interna do site da IA (não usando o navegador para digitar texto, o que garante altíssima velocidade e suporte a streaming real).

---

## 🔒 Segurança e Privacidade (Hardening)

Como o sistema lida com os cookies de sessão pessoais do usuário, ele foi desenhado com uma abordagem "Seguro por Padrão" (Fail-Secure).

### 1. O Cofre Criptografado (Vault)
Perfis de navegador (`*_profile`) contêm tokens sensíveis de acesso. Para permitir o versionamento seguro e proteger contra malwares locais:
- O sistema possui um comando utilitário (`npm run setup-vault`) que empacota e criptografa a pasta do navegador e o `.env` usando o algoritmo **AES-256-GCM** atrelado a uma Senha Mestra.
- O projeto ignora (`.gitignore`) as pastas descriptografadas. Apenas os arquivos `.enc` criptografados permanecem.
- Na inicialização, a senha mestra é solicitada e o cofre é aberto **apenas na memória RAM temporária do SO** (`os.tmpdir()`), sendo ejetado ao desligar o servidor.

### 2. Bloqueio de Rede do Dashboard (Localhost-Only)
O servidor possui um Dashboard gráfico. Para evitar que espiões na mesma rede Wi-Fi local acessem o painel e roubem a senha mestra durante a digitação:
- O sistema possui um *middleware* que bloqueia sumariamente (HTTP 403) qualquer requisição ao Dashboard `/` e `/api/dashboard/*` que não tenha como origem estritamente `127.0.0.1` ou `::1`.

### 3. Geração Automática de API Key (Zero-Config Security)
Para garantir que o seu proxy nunca fique vulnerável na rede local, o processo de instalação é totalmente automatizado e "Seguro por Padrão" (Zero-Config):
- Ao rodar o servidor pela primeira vez (sem um arquivo `.env`), o sistema **gera automaticamente uma API Key aleatória forte** (`sk-...`).
- Essa chave é injetada no sistema e disponibilizada para visualização e cópia **exclusivamente no Dashboard Visual**.
- **Atenção Máxima:** No momento em que você criar a sua Senha Mestra do Cofre, o arquivo original `.env` será **criptografado e excluído do disco** (`.env.enc`). Você **DEVE** copiar e salvar a sua API Key no bloco de notas antes de criar o cofre, ou perderá o acesso e precisará reconfigurar o sistema! A mesma API Key pode e deve ser usada em todos os seus sistemas simultaneamente (Cline, Cursor, Open WebUI, etc).

---

## 📋 Pré-requisitos

| Dependência | Versão Mínima |
|------------|--------------|
| Node.js | v20.x |
| npm | v9.x |
| Playwright | Navegadores do Playwright |
| Docker (opcional) | v24.x |

---

## 📁 Estrutura do Projeto

```
deepsproxy/
├── src/
│   ├── __tests__/           # Testes automatizados da API e core
│   ├── api/                 # Rotas Web compatíveis com OpenAI (Hono)
│   ├── core/                # Motor principal, Telemetria e Vault (Segurança AES)
│   ├── providers/           # Integrações LLM específicas (DeepSeek, Kimi, etc.)
│   ├── scripts/             # Scripts utilitários de linha de comando
│   ├── shared/              # Utilitários globais (CLI, compressão, parsers)
│   ├── tools/               # Registro e Parse de Tool Calls estilo Hermes/OpenAI
│   ├── app.ts               # Configuração global da API (Middlewares, CORS)
│   └── index.ts             # Boot do servidor, geração de chaves e Vault
├── docker-compose.yml       # Orquestração multi-container para deploy de fundo
├── Dockerfile               # Imagem Docker otimizada com dependências Chromium
├── .env.enc                 # Cofre de Ambiente Criptografado (Vault)
└── *_profile.enc            # Sessões de Navegador Criptografadas (Vault)
```

---

## 🔧 Lista de Comandos Principais

Embora o uso diário seja feito via Dashboard, a CLI expõe as seguintes ferramentas:

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia o servidor e solicita a Senha Mestra do Vault |
| `npm run setup-vault` | Empacota e criptografa as credenciais em arquivos `.enc` |
| `npm run login:<provider>` | Abre um navegador limpo para você logar no serviço (`ds`, `kimi`, `glm`, `mimo`, `hf`) |
| `npm run build` | Compila o projeto TypeScript em JavaScript puro na pasta `dist/` |
| `npm test` | Executa a bateria de testes automatizados unitários e E2E |

> [!NOTE]
> **Empacotamento em binário standalone**: O pacote `pkg` (Vercel) foi removido por estar descontinuado e conter uma vulnerabilidade de escalação de privilégio local (GHSA-22r3-9w55-cj54). Caso essa funcionalidade seja necessária no futuro, utilize o fork mantido pela comunidade: **[@yao-pkg/pkg](https://github.com/yao-pkg/pkg)**.

---

## 🧪 Testes

A suíte de testes valida a confiabilidade do proxy, limites de contexto, retentativas e compatibilidade com a API da OpenAI.

```bash
# Executar todos os testes
npm test

# Executar com watch mode (para desenvolvimento)
npm run test:watch
```

---

## 🔍 Troubleshooting (Resolução de Problemas)

### O Playwright falha em abrir o navegador
Em sistemas Linux ou Dockerizados, dependências do Chromium podem faltar. Execute:
```bash
npx playwright install --with-deps chromium
```

### Timeout constante nas respostas
- Aumente a variável `PLAYWRIGHT_TIMEOUT` no `.env` (ex: `60000` para 60 segundos).
- Verifique se a IA não está bloqueando seu IP com um CAPTCHA. Entre no Dashboard visual e renove sua sessão fazendo login novamente.

---

## 🤝 Regras de Contribuição

1. Faça um Fork do repositório
2. Crie uma branch para sua feature: `git checkout -b feature/sua-feature`
3. Siga o padrão TypeScript **strict** presente no `tsconfig.json`. Evite usar `any` sempre que possível.
4. Mantenha 100% de compatibilidade com a documentação da OpenAI API nas respostas enviadas.
5. Abra um Pull Request e descreva os testes que você realizou.

---

## 📄 License

Distribuído sob licença ISC. Veja `LICENSE` para mais informações.

---

## ⚠️ Disclaimer

> Este projeto é fornecido estritamente para fins educacionais e de pesquisa.

Os autores não incentivam ou endossam:
- Uso indevido, comercial ou malicioso.
- Automação não autorizada de serviços de terceiros para bypass de planos pagos.
- Violação de Termos de Serviço de plataformas de Inteligência Artificial.
- Atividades que violem leis ou regulamentações locais e internacionais aplicáveis.

Usuários são integralmente responsáveis pelo uso deste software. **Use por sua conta e risco.**
