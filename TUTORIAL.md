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
*O que isso faz? O primeiro baixa os pacotes necessários. O segundo instala um "navegador fantasma" que o proxy usará para acessar os sites de IA por você.*

---

## Passo 2: O Arquivo de Configuração (.env)

O proxy precisa de algumas instruções básicas. 

1. Na raiz da pasta do DeepsProxy, crie um arquivo chamado **exatamente** `.env` (apenas `.env`, sem nome antes do ponto).
2. Abra esse arquivo no Bloco de Notas ou qualquer editor de texto.
3. Cole o seguinte conteúdo:

```env
# A porta que o proxy vai rodar
PORT=3000

# Invente uma senha de segurança para a sua API
API_KEY=minha-senha-super-secreta-123

# Quais IAs você quer deixar ativadas?
ACTIVE_PROVIDERS=deepseek,kimi,glm,mimo,huggingface
```
Salve e feche o arquivo.

---

## Passo 3: Fazendo o Login (Só a primeira vez!)

O DeepsProxy não usa "mágica" para pular a segurança dos sites. Ele literalmente entra na sua conta pelo navegador fantasma, resolve os desafios de segurança (como o Cloudflare) e pega a resposta.
Para isso, você precisa logar nas suas contas.

No terminal, digite o comando do provedor que quer usar:
- **DeepSeek:** `npm run login:ds`
- **Kimi / Moonshot:** `npm run login:kimi`
- **HuggingFace:** `npm run login:hf`
- **ChatGLM:** `npm run login:glm`
- **Xiaomi MiMo:** `npm run login:mimo`

**O que vai acontecer?**
Um navegador de verdade vai abrir. Faça o login na sua conta normalmente (usando Google, e-mail ou celular). 
Quando a tela de Chat da IA carregar e estiver pronta para uso, você pode simplesmente **fechar o navegador** (ou apertar `Ctrl+C` no terminal). Seus cookies foram salvos no seu PC!

---

## Passo 4: Trancando o Cofre (Vault)

Como seus cookies e sua `API_KEY` agora estão salvos no PC, nós adicionamos um sistema de segurança nível militar (AES-256) para que nenhum vírus ou extensão maliciosa possa roubá-los.

No terminal, rode:
```bash
npm run setup-vault
```
Ele vai pedir para você inventar uma **Senha Mestra**. *Não esqueça essa senha!* 
O sistema vai criptografar todos os seus dados e apagar as versões desprotegidas.

---

## Passo 5: Ligando o Motor!

Agora que tudo está configurado, logado e seguro, basta ligar o proxy!

No terminal, rode:
```bash
npm start
```
Ele vai pedir a sua **Senha Mestra** (aquela do Passo 4). Ao digitar, ele destranca o cofre na memória RAM e inicia o servidor.

Se aparecer a mensagem `Server is running on http://127.0.0.1:3000`, **PARABÉNS!** Seu proxy está online e pronto para receber requisições.

---

## Passo 6: Plugando no KiloCode / Cursor / Cline

Deixe o terminal aberto rodando. Agora vá no seu programa favorito (KiloCode, Cline, Cursor, etc) nas configurações de API (geralmente em provedores Customizados ou formato OpenAI Compatible).

Configure assim:

- **Base URL / API Endpoint:** `http://127.0.0.1:3000/v1`
- **API Key / Bearer Token:** `minha-senha-super-secreta-123` *(exatamente a mesma do seu `.env` no Passo 2)*
- **Custom Model Name:** Aqui você digita o modelo que quer usar. Ex:
  - `deepseek-v4-flash` (Para o DeepSeek rápido)
  - `deepseek-v4-flash-thinking` (Para o DeepSeek R1 Raciocínio longo)
  - `kimi-chat` (Para o Moonshot)
  - `glm-4` (Para o Zhipu)
  - `mimo-v2.5-pro` (Para Xiaomi MiMo)

**Pronto!** Agora o seu aplicativo vai mandar as perguntas para o `127.0.0.1:3000`, e o seu proxy vai fazer o trabalho pesado de buscar a resposta nas IAs de graça para você!
