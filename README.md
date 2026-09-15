This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Diagram-aware grading pilot

See [implementation, validation and rollout](docs/diagram-aware-grading.md), [assessment sources](docs/diagram-assessment-basis.md), [96-question coverage](docs/four-mark-bank-coverage.md), and [teacher calibration](docs/diagram-calibration.md).

Apply migrations **0013–0015** after 0001–0012 before enabling `NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED=true`, then rebuild. The flag defaults to false. Rollback keeps migrated data and immutable historical results. Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run test:db:diagrams`, and `npm run build`; the local-only security/browser harness is documented in the implementation note. Ordinary tests make no paid model calls. See [source closure and release state](docs/diagram-source-closure.md).

For the verified local handwritten-diagram pilot, run `node scripts/diagram-local-pilot.mjs` and open [local login](http://127.0.0.1:3000/login). This launcher pins Supabase to the existing local Docker instance and enables diagrams only in that process; [setup and local mail instructions](docs/diagram-local-testing.md) explain sign-in. Submitting an assessment yourself uses the real provider.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
