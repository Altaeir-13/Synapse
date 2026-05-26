# 📘 Guia Definitivo do DeepsProxy para Iniciantes

Bem-vindo ao DeepsProxy! Se você não é programador mas quer usar modelos de IA como DeepSeek, Kimi ou ChatGLM nas suas ferramentas favoritas (como KiloCode, Cursor, Cline, etc) sem pagar por APIs caríssimas, você está no lugar certo.

Este guia vai te pegar pela mão, do zero até o proxy rodando na sua máquina.

---

## Passo 1: Preparando o Terreno

Antes de tudo, seu computador precisa ter as ferramentas básicas.

1. **Baixe o Node.js**: Vá em [nodejs.org](https://nodejs.org/) e baixe a versão recomendada (LTS). Instale como qualquer outro programa (Avançar, Avançar, Concluir).
2. **Baixe este projeto**: Se ainda não baixou, faça o download da pasta do DeepsProxy e extraia no seu computador.
3. **Abra o Terminal**: Abra a pasta do DeepsProxy, clique com o botão direito numa área vazia e selecione "Abrir no Terminal" (ou abra o CMD/PowerShell e navegue até a pasta usando o comando `cd`).

Agora, no terminal, digite os dois comandos abaixo (um de cada vez) e espere terminar:

```bash
npm install
npx playwright install
```

*O primeiro baixa os pacotes básicos, e o segundo instala o navegador "fantasma" que a ferramenta usa para burlar os bloqueios e falar com as IAs.*

---

## Passo 2: Ligando o Motor e o Dashboard Visual!

Diferente de sistemas complexos, nós construímos uma interface visual (Dashboard) para facilitar sua vida. 

No terminal, simplesmente rode:
```bash
npm start
```

Se tudo der certo, o sistema vai abrir automaticamente o seu navegador principal em **http://127.0.0.1:3000/**. Essa é a tela de controle do seu proxy! 

> [!TIP]
> **API Key de Segurança Automática**: Ao iniciar pela primeira vez, o sistema gerou uma `API_KEY` super segura automaticamente para você. Ela vai aparecer **direto na tela do Dashboard**!

---

## Passo 3: O Perigo da API Key (⚠️ MUITO IMPORTANTE)

Na tela do Dashboard (no seu navegador), na seção "Como Configurar" na parte inferior, você verá a sua **API Key** (uma chave longa que começa com `sk-...`).

**🚨 PARE TUDO E COPIE ESSA CHAVE AGORA!** Salve ela em um Bloco de Notas ou no seu gerenciador de senhas. Se você passar para o Passo 4 sem copiar essa chave, você perderá o acesso ao sistema para sempre e terá que reinstalar tudo do zero!

---

## Passo 4: Criando o seu Cofre (Vault)

Ainda na tela do Dashboard, agora que você já copiou a sua API Key com segurança, vamos criar o seu Cofre (Vault):

1. Clique no botão "CONFIGURAR COFRE".
2. Digite uma **Senha Mestra** que você vai lembrar.
3. Clique em "SALVAR".
4. Nesse exato milissegundo, o sistema vai pegar a sua API Key, criptografá-la com nível militar (AES-256) e **DELETAR** a versão original do seu HD para que nenhum vírus consiga ler. 
5. Volte para o seu terminal (a tela preta), aperte `Ctrl + C` para desligar o servidor, e digite `npm start` de novo. Agora sim, ele vai te pedir a senha para destrancar o sistema!

---

## 🔒 Entendendo a Segurança: Cofre vs API Key
Antes de continuar, é muito importante você entender **por que** o sistema tem duas "senhas" diferentes, e para que serve cada uma:

- **1. A Senha Mestra do Cofre (Vault):** Protege os seus arquivos físicos no HD. Se um vírus roubar a pasta do seu projeto, ele não vai conseguir acessar sua conta da DeepSeek porque os seus cookies estão trancados nessa caixa-forte. Você só digita essa senha **uma vez** quando o servidor liga no terminal (para destrancar a caixa para o servidor usar).
- **2. A sua `API_KEY`:** É como se fosse a "Senha do Wi-Fi" do seu proxy. Ela serve para que os programas que você usa (como Cursor e KiloCode) provem que são eles mesmos tentando usar a sua IA. Você deve usar a **MESMA** chave (`sk-...`) em todos os seus aplicativos simultaneamente! Eles não sabem da existência da Senha Mestra.

---

## Passo 5: Fazendo Login nas IAs

Ainda no Dashboard visual:

1. Na tabela "Providers Status", escolha qual IA você quer usar (por exemplo, DeepSeek ou HuggingFace) e clique no botão **Login**.
2. Um navegador "fantasma" vai se abrir na sua tela.
3. Nele, faça o login na sua conta normalmente (usando Google, e-mail ou celular) e resolva os desafios de segurança (como o Cloudflare).
4. Assim que a tela de Chat da IA carregar e estiver pronta para uso, você pode simplesmente **fechar essa janela**. O Dashboard ficará "Verde" (Ativo) para essa IA. Seus cookies foram salvos com segurança dentro do Cofre!

---

## Passo 6: Rodando em Segundo Plano (Opcional - Docker)

Se você não quer deixar uma tela preta de terminal aberta o tempo todo, você pode usar o **Docker** para rodar o sistema invisível no fundo do seu computador:

1. Feche o seu terminal atual que estava rodando o `npm start`.
2. Abra o terminal novamente na mesma pasta.
3. **Na primeira vez**, rode: `docker-compose build` (pode demorar alguns minutos para baixar a "caixa").
4. **Para ligar o motor**, rode: `docker-compose up -d`. O terminal vai ser liberado e você pode fechá-lo!
5. **Para destrancar o cofre**, abra o seu navegador de internet, vá no Dashboard (`http://127.0.0.1:3000/`) e digite a sua Senha Mestra lá. O servidor vai ficar online!

*(Para desligar no futuro, basta abrir o terminal na pasta e rodar `docker-compose down`).*

---

## Passo 7: Plugando no KiloCode / Cursor / Cline

Com o servidor rodando (seja pelo terminal aberto com `npm start` ou invisível via Docker). Agora vá no seu programa favorito (KiloCode, Cline, Cursor, etc) nas configurações de API (procure por provedores Customizados ou "OpenAI Compatible").

Configure assim:

- **Base URL / API Endpoint:** `http://127.0.0.1:3000/v1`
- **API Key / Bearer Token:** *(Cole aqui a chave `sk-...` que apareceu no seu terminal no Passo 2)*
- **Custom Model Name:** Aqui você digita o modelo que quer usar. Ex:
  - `deepseek-v4-flash` (Para o DeepSeek rápido)
  - `deepseek-v4-flash-thinking` (Para o DeepSeek R1 Raciocínio longo)
  - `kimi-chat` (Para o Moonshot)
  - `glm-4` (Para o Zhipu)
  - `mimo-v2.5-pro` (Para Xiaomi MiMo)
  - `meta-llama/Llama-3.1-70B-Instruct` (Para usar via HuggingFace)

**Pronto!** Agora o seu aplicativo vai mandar as perguntas para o `127.0.0.1:3000`, e o seu proxy vai fazer o trabalho pesado de buscar a resposta nas IAs de graça para você!

> [!NOTE]
> Se quiser travar sua `API_KEY` para não ficar gerando uma nova a cada inicialização, crie um arquivo chamado `.env` na pasta do projeto e adicione a linha: `API_KEY=sk-sua-chave-aqui`.
