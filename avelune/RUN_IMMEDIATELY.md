# Run OptiLearn immediately

This package includes a rebuilt `node_modules` directory, so no dependency installation is required after extraction.

## Development mode

```bash
npm run dev
```

The app will be available at the local URL printed by Vite.

## Production-style preview

The production asset bundle has already been generated in `dist/` and the dependencies needed by Vite are included.

```bash
npm run preview
```

## Validation note

The CSS/Vite bundle was verified with `npx vite build`. The package’s existing TypeScript build command still reports five pre-existing logic/type errors in quiz and SEP files; those files were intentionally not modified during the front-end-only styling pass.
