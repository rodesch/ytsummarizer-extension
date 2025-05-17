# YTSummarizer Extension

Extensão para Google Chrome que gera resumos em Markdown de vídeos do YouTube usando IA, integrada ao seu servidor YTSummarizer.

## Funcionalidades
- Gera resumos em Markdown de vídeos do YouTube com um clique
- Copia o resumo para a área de transferência
- Abre o resumo no app web
- Integração com NotePlan (macOS)
- Interface moderna, responsiva e com tema escuro/claro

## Instalação
1. Baixe ou clone este repositório:
   ```bash
   git clone https://github.com/rodesch/ytsummarizer-extension.git
   ```
2. No Chrome, acesse `chrome://extensions/`.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **"Carregar sem compactação"** e selecione a pasta `ytsummarizer-extension`.

## Como usar
- Acesse um vídeo do YouTube.
- Clique no ícone da extensão YTSummarizer.
- Clique em **Gerar Resumo**.
- O resumo será exibido em Markdown, pronto para copiar ou abrir no app.

## Configuração do Servidor
A extensão se conecta ao seu servidor YTSummarizer (por padrão: `http://212.85.23.16:5050`).
Você pode alterar a URL da API nas configurações da extensão.

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