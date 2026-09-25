# Casa Porto — Gestão de Aluguel Online

Sistema web responsivo para administrar uma casa de temporada: dashboard, calendário, reservas, pagamentos, despesas, check-in/check-out, tarefas de limpeza e acesso compartilhado entre familiares.

## O que já está pronto

- Login por e-mail e senha (Supabase Auth)
- Dados online e sincronizados entre celular e computador
- Espaço compartilhado por código de acesso
- Dashboard com ocupação, próxima reserva, recebido e saldo a receber
- Calendário mensal
- Cadastro, edição e cancelamento de reservas
- Proteção contra reservas sobrepostas (inclusive no banco)
- Controle de pagamentos por reserva
- Controle de despesas
- Tarefas de limpeza/manutenção
- Row Level Security (RLS) no Supabase
- Layout responsivo para celular
- Deploy direto pela Vercel a partir do GitHub

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com e crie um projeto.
2. No painel do projeto, abra **SQL Editor**.
3. Clique em **New query**.
4. Copie todo o conteúdo de `supabase/schema.sql`, cole e execute com **Run**.
5. Vá em **Authentication > Providers > Email** e mantenha Email habilitado.
6. Para um primeiro teste mais simples, você pode desabilitar **Confirm email**. Em produção, pode manter habilitado.
7. Se mantiver confirmação de e-mail ativada, depois do deploy ajuste **Authentication > URL Configuration > Site URL** para a URL final da Vercel (por exemplo `https://seu-projeto.vercel.app`).
8. Abra **Project Settings / API** (ou a tela equivalente atual) e copie:
   - Project URL
   - chave pública `anon` / `publishable`

> Nunca coloque a `service_role` no frontend nem nas variáveis `NEXT_PUBLIC_*`.

## 2. Configurar localmente (opcional)

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

Depois:

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## 3. Subir para o GitHub

Crie um repositório **vazio** no GitHub (não marque para criar README, .gitignore ou licença) e, dentro desta pasta, rode:

```bash
git init
git add .
git commit -m "Sistema Casa Porto"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Ou simplesmente faça upload dos arquivos pela interface do GitHub.

## 4. Deploy na Vercel

1. Acesse https://vercel.com.
2. Clique em **Add New > Project**.
3. Importe o repositório do GitHub.
4. A Vercel detectará Next.js automaticamente.
5. Antes de finalizar, adicione estas variáveis de ambiente:

```text
NEXT_PUBLIC_SUPABASE_URL = sua Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY = sua chave pública anon/publishable
```

6. Clique em **Deploy**.

Depois disso o sistema ficará em uma URL semelhante a:

```text
https://seu-projeto.vercel.app
```

## 5. Primeiro acesso

1. Abra a URL publicada.
2. Clique em **Criar conta**.
3. Entre e escolha **Criar a casa**.
4. Informe o nome da família/espaço e o nome da casa.
5. Em **Configurações**, copie o **Código da casa**.
6. No celular do seu sogro, ele cria outra conta, escolhe **Entrar com código** e cola esse código.
7. Os dois passarão a ver os mesmos dados em tempo real a cada atualização da tela.

## Segurança

O frontend usa somente a chave pública do Supabase. A segurança dos dados é feita por Row Level Security (RLS): um usuário autenticado só consegue consultar registros do espaço do qual é membro. As funções de entrada por código e criação do espaço são executadas no banco com regras específicas.

## Estrutura

```text
app/
  login/page.tsx       login/cadastro
  page.tsx             aplicação principal
  globals.css          visual responsivo
lib/
  supabase.ts          cliente Supabase
  date.ts              datas/moeda
supabase/
  schema.sql           banco + RLS + funções
public/
  manifest.webmanifest
  house.svg
```

## Próximas melhorias possíveis

- Sincronização automática com Airbnb/Booking via iCal
- Envio de mensagem/WhatsApp para hóspede
- Contrato PDF e comprovante
- Mais de uma propriedade
- Tela específica para equipe de limpeza
- Relatórios mensais e anuais
- Fotos/documentos por reserva
- Notificações de check-in/check-out

