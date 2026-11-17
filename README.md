# Horses Benchmark

A catalog of interactive 3D horses built from a shared prompt. [Open the catalog](https://horses.adelnz.com/).

## Prompt

> "create a realistic interactive 3d horse with three.js. from scratch, no reusing of existing licensed stuff. verify using [@Browser](plugin://browser@openai-bundled) "

## Models

- [`62solmax`](./62solmax/) is a procedural bay horse with close-up views and animated gaits. The model has 120,011 vertices and 22 bones. It was generated in 30 minutes. [Open 62solmax](https://horses.adelnz.com/62solmax/).

## Development

Use mise and Node.js 26 to set up the project.

```sh
mise install
mise exec -- aube install --frozen-lockfile
mise exec -- aube run dev
```

`aube run build` writes the catalog and model pages to `dist/`. `aube run preview` serves that build locally.

## Deployment

GitHub Actions builds pull requests and deploys `main` to the `horses` Cloudflare Pages project. It authenticates with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

With those credentials in your environment, run `mise exec -- aube run build` followed by `mise exec -- aube run deploy` to upload a local build.

## License

[MIT](./LICENSE)
