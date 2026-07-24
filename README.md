# manga-studio-website

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_IbFBpYpP3LrosMEzWFECEmeptdJ9)

## Шрифты

Встроенный шрифт редактора по умолчанию — [Balsamiq Sans](https://fonts.google.com/specimen/Balsamiq+Sans) (OFL, поддерживает кириллицу). Он self-hosted: бинарные `.woff2` не хранятся в git — в `public/fonts/` лежат их base64-версии (`*.woff2.b64`), которые автоматически декодируются скриптом `scripts/materialize-fonts.mjs` перед `dev` и `build` (см. `predev`/`prebuild`). Запустить вручную: `npm run fonts`.

Пользовательские шрифты (ttf/otf/woff/woff2), загруженные в редакторе, сохраняются в IndexedDB браузера и переживают перезагрузку страницы. «Шрифт перевода по умолчанию» выбирается в настройках перевода и хранится в localStorage.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
