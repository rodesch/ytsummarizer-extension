# YTSummarizer Extension

Extensão para Google Chrome que gera resumos em Markdown de vídeos do YouTube usando IA da OpenAI.

## ✨ Funcionalidades
- 🤖 Gera resumos em Markdown de vídeos do YouTube usando OpenAI GPT
- 📋 Copia o resumo para a área de transferência  
- 🎨 Interface moderna, responsiva e com tema escuro/claro
- 📱 Integração com NotePlan (macOS)
- ⚙️ Configurações personalizáveis (modelo, idioma, estilo)
- 🔐 Chave da API armazenada localmente e de forma segura

## 🚀 Instalação
1. **Baixe ou clone este repositório:**
   ```bash
   git clone https://github.com/rodesch/ytsummarizer-extension.git
   ```

2. **Configure sua chave da API OpenAI:**
   - Obtenha sua chave em [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

3. **Instale a extensão:**
   - No Chrome, acesse `chrome://extensions/`
   - Ative o **Modo do desenvolvedor** (canto superior direito)
   - Clique em **"Carregar sem compactação"** e selecione a pasta `ytsummarizer-extension`

4. **Configure a extensão:**
   - Clique no ícone da extensão e depois em "Configurações"
   - Insira sua chave da API OpenAI
   - Ajuste as configurações conforme desejado

## 📖 Como usar
1. Acesse qualquer vídeo do YouTube
2. Clique no ícone da extensão YTSummarizer
3. Clique em **"Gerar Resumo"**
4. Aguarde a IA processar a transcrição do vídeo
5. O resumo será exibido em Markdown, pronto para copiar

## ⚙️ Configurações Disponíveis

### 🔑 API OpenAI
- **Chave da API**: Sua chave pessoal da OpenAI
- **Modelo**: GPT-4o Mini, GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
- **Tokens máximos**: Controla o tamanho do resumo (100-4000)

### 🌍 Configurações Gerais
- **Idioma**: Português (BR), English, Español, Français, Deutsch
- **Estilo**: Detalhado, Conciso, Tópicos, Acadêmico
- **Timestamps**: Incluir marcas de tempo no resumo
- **Auto-resumo**: Gerar automaticamente ao detectar vídeo

## 🔒 Segurança e Privacidade
- Sua chave da API é armazenada **localmente** no navegador
- Não enviamos dados para servidores externos (exceto OpenAI)
- As transcrições são processadas diretamente do YouTube
- Código 100% open source e auditável

## Contribuição
Pull requests são bem-vindos! Para contribuir:
1. Faça um fork do projeto
2. Crie uma branch (`git checkout -b minha-feature`)
3. Commit suas alterações (`git commit -am 'Minha feature'`)
4. Push para o branch (`git push origin minha-feature`)
5. Abra um Pull Request

## Licença
MIT

## Contato
Dúvidas, sugestões ou bugs? Abra uma issue ou envie um e-mail para [rodrigo@esch.dev](mailto:rodrigo@esch.dev) 