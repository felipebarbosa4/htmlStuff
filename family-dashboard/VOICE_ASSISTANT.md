# Hey Family — voz no tablet (PWA)

## Como ativar

1. Abra o dashboard instalado no Chrome do tablet Samsung com a tela ligada.
2. Toque uma vez no botão redondo de microfone, no canto inferior direito.
3. Permita o acesso ao microfone caso o Chrome pergunte.
4. Diga "Hey Family" e, depois, sua pergunta em português.
5. Toque novamente no microfone para desativar a escuta.

Também é possível dizer "Hey Family, abra o calendário" em uma única frase.

## Como funciona

- **Ativação e STT:** a implementação inicial utiliza Web Speech API (SpeechRecognition / webkitSpeechRecognition). O Chrome pode enviar áudio para um serviço de reconhecimento; não é um detector local offline. Em certas versões do Android, o serviço termina a escuta automaticamente, por isso tentamos reiniciá-lo enquanto o aplicativo estiver ativo.
- **Perguntas:** comandos simples são tratados localmente. Perguntas gerais enviam apenas a transcrição final ao endpoint de primeira parte `/api/voice`, que consulta a API de IA usando o secret `OPENAI_API_KEY` de Cloudflare. Esse secret nunca vai para o cliente. Não é enviada gravação de áudio ao endpoint próprio.
- **TTS:** SpeechSynthesisUtterance do navegador com `lang=pt-BR`; a qualidade depende das vozes instaladas no tablet.
- **Privacidade:** o botão de voz inicia desativado; não persistimos áudio, transcrições ou conversas no navegador. Somente o consentimento da ativação pode ser preservado durante a sessão para tentar reconectar após a atualização automática do PWA. Desligar apaga essa preferência.
- **Finance:** sem controle de voz, sem enviar ou ler PIN, saldos ou extratos.
- **Agenda:** usa apenas os próximos eventos já carregados em memória; se ainda não estiverem disponíveis, abre o calendário e informa que está sincronizando. Não acessa Finance.
- **Custo:** a detecção/transcrição usa o serviço do navegador (sujeito às condições dele); perguntas gerais usam sua chave OpenAI, que pode gerar custos de API. O endpoint usa a KV existente para reduzir a frequência de solicitações (quando configurada).

## Limitações atuais

Não há garantia de escuta permanente com tela bloqueada, outro app em primeiro plano ou após reiniciar o PWA. É possível que o Chrome exija um novo toque no microfone. Esta primeira versão **não usa Porcupine/Picovoice** porque ele exige chave/modelo específicos. O fallback é o botão de microfone, sem alterar a programação automática do dashboard.

## Diagnóstico

- Se o microfone estiver bloqueado: Chrome > configurações do site > Microfone > Permitir.
- Se a pergunta geral não responder: verifique se `OPENAI_API_KEY` existe nos segredos de produção do Cloudflare Pages e se a sessão Cloudflare Access está ativa.
- Se o TTS estiver sem sotaque brasileiro: verifique as vozes de texto para fala instaladas no Android.
- Se a escuta interromper sozinha: toque novamente no microfone; isso pode ser uma limitação do Chrome/Android.

## Arquivos

- `family-dashboard/voice.mjs`: controle de microfone, STT, comandos e TTS.
- `family-dashboard/voice-core.mjs`: interpretação local e wake phrase.
- `family-dashboard/voice.css`: sobreposição visual fixa e pequena.
- `functions/api/voice.js`: endpoint POST protegido, chave de IA somente no servidor.
- `tests/voice.test.mjs`: testes automatizados.
